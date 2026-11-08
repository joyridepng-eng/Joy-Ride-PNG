export type Ratings = {
  overallRating: number;
  customerCareRating?: number;
  professionalismRating?: number;
  drivingRating?: number;
  cleanlinessRating?: number;
  comment?: string;
};
export type Feedback = {
  id: string;
  rideId: string;
  overallRating: number;
  customerCareRating: number | null;
  professionalismRating: number | null;
  drivingRating: number | null;
  cleanlinessRating: number | null;
  comment: string | null;
  createdAt: string;
};
export type Ride = {
  id: string;
  status: string;
  driver: { id: string; fullName: string } | null;
};
export type Pending = { riderId: string; rideId: string; payload: Ratings };
export type FeedbackState = {
  ride: Ride;
  feedback: Feedback | null;
  pending: Pending | null;
  eligible: boolean;
};
export type Store = {
  read: (key: string) => Promise<string | null>;
  write: (key: string, value: string) => Promise<void>;
  remove: (key: string) => Promise<void>;
};
export type Request = (
  riderId: string,
  path: string,
  init?: RequestInit,
) => Promise<unknown>;
export class FeedbackError extends Error {}
export const feedbackMessage = (e: unknown) =>
  e instanceof FeedbackError
    ? e.message
    : "Could not complete feedback. Check your sign-in and connection, then refresh. Any saved submission is retained.";
function invalid(): never {
  throw new FeedbackError(
    "Invalid feedback data. Refresh before submitting; confirmation has not been verified.",
  );
}
export function record(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== "object" || Array.isArray(v)) return invalid();
  return v as Record<string, unknown>;
}
export function identifier(v: unknown): string {
  if (typeof v !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(v))
    return invalid();
  return v;
}
const optional = [
  "customerCareRating",
  "professionalismRating",
  "drivingRating",
  "cleanlinessRating",
] as const;
function score(v: unknown): number {
  if (typeof v !== "number" || !Number.isInteger(v) || v < 1 || v > 5)
    return invalid();
  return v;
}
export function ratings(v: unknown): Ratings {
  const r = record(v);
  const out: Ratings = { overallRating: score(r.overallRating) };
  for (const key of optional)
    if (r[key] !== undefined && r[key] !== null) out[key] = score(r[key]);
  if (r.comment !== undefined && r.comment !== null) {
    if (typeof r.comment !== "string" || r.comment.length > 1000)
      return invalid();
    const comment = r.comment.trim();
    if (comment) out.comment = comment;
  }
  return out;
}
export function parseFeedback(v: unknown, rideId: string): Feedback {
  const f = record(v);
  if (
    f.rideId !== rideId ||
    typeof f.createdAt !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T/.test(f.createdAt) ||
    !Number.isFinite(Date.parse(f.createdAt))
  )
    return invalid();
  if (
    f.comment !== null &&
    (typeof f.comment !== "string" || f.comment.length > 1000)
  )
    return invalid();
  const out: Feedback = {
    id: identifier(f.id),
    rideId: identifier(f.rideId),
    overallRating: score(f.overallRating),
    customerCareRating: null,
    professionalismRating: null,
    drivingRating: null,
    cleanlinessRating: null,
    comment: f.comment,
    createdAt: f.createdAt,
  };
  for (const key of optional) out[key] = f[key] === null ? null : score(f[key]);
  return out;
}
function parseRide(v: unknown, rideId: string): Ride {
  const r = record(v);
  if (
    r.id !== rideId ||
    typeof r.status !== "string" ||
    ![
      "REQUESTED",
      "ACCEPTED",
      "DRIVER_ARRIVED",
      "IN_PROGRESS",
      "COMPLETED",
      "CANCELLED",
    ].includes(r.status)
  )
    return invalid();
  const d = r.driver == null ? null : record(r.driver);
  if (d && typeof d.fullName !== "string") return invalid();
  return {
    id: identifier(r.id),
    status: r.status,
    driver: d ? { id: identifier(d.id), fullName: d.fullName as string } : null,
  };
}
function parsePending(raw: string, riderId: string, rideId: string): Pending {
  try {
    const p = record(JSON.parse(raw));
    if (p.riderId !== riderId || p.rideId !== rideId) return invalid();
    return { riderId, rideId, payload: ratings(p.payload) };
  } catch {
    throw new FeedbackError(
      "Saved feedback cannot be read. It has not been replaced. Contact Admin for help.",
    );
  }
}
function same(a: unknown, b: unknown) {
  return JSON.stringify(ratings(a)) === JSON.stringify(ratings(b));
}
export function createFeedbackClient(store: Store, request: Request) {
  const running = new Set<string>();
  const key = (riderId: string, rideId: string) =>
    `joyride-feedback-v1-${identifier(riderId)}-${identifier(rideId)}`;
  const endpoint = (rideId: string) =>
    `/feedback/rider/me/rides/${identifier(rideId)}`;
  async function load(
    riderId: string,
    rideId: string,
    signal?: AbortSignal,
  ): Promise<FeedbackState> {
    const storageKey = key(riderId, rideId);
    const [rideData, feedbackData, raw] = await Promise.all([
      request(riderId, `/rides/me/${rideId}`, { signal }),
      request(riderId, endpoint(rideId), { signal }),
      store.read(storageKey),
    ]);
    const ride = parseRide(rideData, rideId),
      data = record(feedbackData);
    const feedback =
      data.feedback === null ? null : parseFeedback(data.feedback, rideId);
    let pending = raw === null ? null : parsePending(raw, riderId, rideId);
    if (feedback && pending) {
      await store.remove(storageKey);
      pending = null;
    }
    return {
      ride,
      feedback,
      pending,
      eligible: ride.status === "COMPLETED" && ride.driver !== null,
    };
  }
  return {
    load,
    async submit(
      riderId: string,
      rideId: string,
      input: Ratings | undefined,
      signal?: AbortSignal,
    ): Promise<Feedback> {
      const storageKey = key(riderId, rideId);
      if (running.has(storageKey))
        throw new FeedbackError(
          "A feedback submission is already running. Please wait.",
        );
      running.add(storageKey);
      try {
        if (signal?.aborted)
          throw new FeedbackError(
            "Submission interrupted. Refresh to check confirmation.",
          );
        const state = await load(riderId, rideId, signal);
        if (state.feedback) return state.feedback;
        if (!state.eligible)
          throw new FeedbackError(
            "Feedback requires your completed ride with an assigned Driver.",
          );
        let payload = state.pending?.payload;
        if (payload && input && !same(payload, input))
          throw new FeedbackError(
            "A submission is already saved. Retry the same ratings or refresh for confirmation.",
          );
        if (!payload) {
          if (!input)
            throw new FeedbackError(
              "Choose an overall rating before submitting.",
            );
          payload = ratings(input);
          await store.write(
            storageKey,
            JSON.stringify({ riderId, rideId, payload }),
          );
        }
        if (signal?.aborted)
          throw new FeedbackError(
            "Submission interrupted. Your saved ratings remain available for retry.",
          );
        const feedback = parseFeedback(
          await request(riderId, endpoint(rideId), {
            method: "POST",
            body: JSON.stringify(payload),
            signal,
          }),
          rideId,
        );
        if (!same(payload, feedback))
          throw new FeedbackError(
            "The returned feedback differs from your submission. Refresh to check the saved server record.",
          );
        await store.remove(storageKey);
        return feedback;
      } finally {
        running.delete(storageKey);
      }
    },
  };
}
