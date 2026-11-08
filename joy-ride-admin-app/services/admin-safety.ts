import { latestLocationForDriver } from "./emergency-map-core";
import { adminFetch } from "@/services/admin-auth";

export type EmergencyLocationSource = "GPS" | "MANUAL_PIN";
export type EmergencyStatus = "OPEN" | "ACKNOWLEDGED" | "RESOLVED";
export type ReviewStatus = "NEW" | "REVIEWED" | "FOLLOW_UP" | "CLOSED";
export type Page<T> = { items: T[]; nextCursor: string | null };
export type Emergency = {
  id: string;
  status: EmergencyStatus;
  message: string | null;
  createdAt: string;
  updatedAt: string;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  latitude: number | null;
  longitude: number | null;
  accuracyMeters: number | null;
  locationRecordedAt: string | null;
  locationAgeSeconds: number | null;
  locationIsStale: boolean;
  locationSource: EmergencyLocationSource | null;
  driver: {
    id: string;
    fullName: string;
    phone: string;
    vehicles: { id: string; plateNumber: string }[];
  };
  ride: {
    id: string;
    status: string;
    vehicle: { id: string; plateNumber: string } | null;
  } | null;
};
export type EmergencyDetail = Emergency & {
  events: {
    id: string;
    action: "CREATED" | "ACKNOWLEDGED" | "RESOLVED";
    note: string | null;
    createdAt: string;
    admin: { id: string; fullName: string } | null;
  }[];
};
export type Feedback = {
  id: string;
  rideId: string;
  driverId: string;
  overallRating: number;
  customerCareRating: number | null;
  professionalismRating: number | null;
  drivingRating: number | null;
  cleanlinessRating: number | null;
  comment: string | null;
  createdAt: string;
  updatedAt: string;
  reviewStatus: ReviewStatus;
  driver: { id: string; fullName: string };
};
export type FeedbackDetail = Feedback & {
  reviewEvents: {
    id: string;
    adminId: string;
    previousStatus: ReviewStatus;
    newStatus: ReviewStatus;
    note: string;
    createdAt: string;
  }[];
};
export const reviewTransitions: Record<
  ReviewStatus,
  Exclude<ReviewStatus, "NEW">[]
> = {
  NEW: ["REVIEWED", "FOLLOW_UP", "CLOSED"],
  REVIEWED: ["FOLLOW_UP", "CLOSED"],
  FOLLOW_UP: ["REVIEWED", "CLOSED"],
  CLOSED: ["FOLLOW_UP"],
};
export class SafetyError extends Error {
  constructor(
    message: string,
    public readonly status = 0,
  ) {
    super(message);
    this.name = "SafetyError";
  }
}
export function safetyMessage(error: unknown): string {
  return error instanceof SafetyError
    ? error.message
    : "Could not complete the request. Check your connection and sign-in, then refresh.";
}
function invalid(): never {
  throw new SafetyError(
    "The server returned an invalid response. Refresh before taking action.",
  );
}
function record(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== "object" || Array.isArray(v)) return invalid();
  return v as Record<string, unknown>;
}
function text(v: unknown): string {
  if (typeof v !== "string") return invalid();
  return v;
}
function nullableText(v: unknown): string | null {
  return v === null ? null : text(v);
}
function date(v: unknown): string {
  const s = text(v);
  if (!Number.isFinite(Date.parse(s))) return invalid();
  return s;
}
function nullableDate(v: unknown): string | null {
  return v === null ? null : date(v);
}
function number(v: unknown, min: number, max: number): number {
  if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max)
    return invalid();
  return v;
}
function nullableNumber(v: unknown, min: number, max: number) {
  return v === null ? null : number(v, min, max);
}
export function safetyId(v: unknown): string {
  if (typeof v !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(v))
    throw new SafetyError("Select a valid record before continuing.");
  return v;
}
function enumValue<T extends string>(v: unknown, values: readonly T[]): T {
  if (typeof v !== "string" || !values.includes(v as T)) return invalid();
  return v as T;
}
const emergencyStatuses = ["OPEN", "ACKNOWLEDGED", "RESOLVED"] as const;
const reviewStatuses = ["NEW", "REVIEWED", "FOLLOW_UP", "CLOSED"] as const;
function list<T>(v: unknown, parse: (v: unknown) => T): T[] {
  if (!Array.isArray(v) || v.length > 1000) return invalid();
  return v.map(parse);
}
function person(v: unknown) {
  const r = record(v);
  return { id: safetyId(r.id), fullName: text(r.fullName) };
}
function vehicle(v: unknown) {
  const r = record(v);
  return { id: safetyId(r.id), plateNumber: text(r.plateNumber) };
}
function emergency(v: unknown): Emergency {
  const r = record(v),
    d = record(r.driver),
    ride = r.ride === null ? null : record(r.ride);
  const result: Emergency = {
    id: safetyId(r.id),
    status: enumValue(r.status, emergencyStatuses),
    message: nullableText(r.message),
    createdAt: date(r.createdAt),
    updatedAt: date(r.updatedAt),
    acknowledgedAt: nullableDate(r.acknowledgedAt),
    resolvedAt: nullableDate(r.resolvedAt),
    latitude: nullableNumber(r.latitude, -90, 90),
    longitude: nullableNumber(r.longitude, -180, 180),
    accuracyMeters: nullableNumber(r.accuracyMeters, 0, Number.MAX_VALUE),
    locationRecordedAt: nullableDate(r.locationRecordedAt),
    locationAgeSeconds: nullableNumber(
      r.locationAgeSeconds,
      0,
      Number.MAX_VALUE,
    ),
    locationSource:
      r.locationSource === "GPS" || r.locationSource === "MANUAL_PIN"
        ? r.locationSource
        : null,
    locationIsStale:
      typeof r.locationIsStale === "boolean" ? r.locationIsStale : invalid(),
    driver: {
      ...person(d),
      phone: text(d.phone),
      vehicles: list(d.vehicles, vehicle),
    },
    ride: ride
      ? {
          id: safetyId(ride.id),
          status: text(ride.status),
          vehicle: ride.vehicle === null ? null : vehicle(ride.vehicle),
        }
      : null,
  };
  if (
    (result.latitude === null) !== (result.longitude === null) ||
    (result.latitude === null) !== (result.locationRecordedAt === null)
  )
    return invalid();
  if (
    (result.status === "OPEN" &&
      (result.acknowledgedAt || result.resolvedAt)) ||
    (result.status !== "OPEN" && !result.acknowledgedAt) ||
    (result.status === "RESOLVED" && !result.resolvedAt) ||
    (result.status === "ACKNOWLEDGED" && result.resolvedAt)
  )
    return invalid();
  return result;
}
function emergencyDetail(v: unknown): EmergencyDetail {
  const r = record(v);
  return {
    ...emergency(r),
    events: list(r.events, (x) => {
      const e = record(x);
      return {
        id: safetyId(e.id),
        action: enumValue(e.action, [
          "CREATED",
          "ACKNOWLEDGED",
          "RESOLVED",
        ] as const),
        note: nullableText(e.note),
        createdAt: date(e.createdAt),
        admin: e.admin === null ? null : person(e.admin),
      };
    }),
  };
}
function rating(v: unknown): number {
  const n = number(v, 1, 5);
  if (!Number.isInteger(n)) return invalid();
  return n;
}
function optionalRating(v: unknown) {
  return v === null ? null : rating(v);
}
function feedback(v: unknown): Feedback {
  const r = record(v);
  return {
    id: safetyId(r.id),
    rideId: safetyId(r.rideId),
    driverId: safetyId(r.driverId),
    overallRating: rating(r.overallRating),
    customerCareRating: optionalRating(r.customerCareRating),
    professionalismRating: optionalRating(r.professionalismRating),
    drivingRating: optionalRating(r.drivingRating),
    cleanlinessRating: optionalRating(r.cleanlinessRating),
    comment: nullableText(r.comment),
    createdAt: date(r.createdAt),
    updatedAt: date(r.updatedAt),
    reviewStatus: enumValue(r.reviewStatus, reviewStatuses),
    driver: person(r.driver),
  };
}
function feedbackDetail(v: unknown): FeedbackDetail {
  const r = record(v);
  return {
    ...feedback(r),
    reviewEvents: list(r.reviewEvents, (x) => {
      const e = record(x);
      return {
        id: safetyId(e.id),
        adminId: safetyId(e.adminId),
        previousStatus: enumValue(e.previousStatus, reviewStatuses),
        newStatus: enumValue(e.newStatus, reviewStatuses),
        note: text(e.note),
        createdAt: date(e.createdAt),
      };
    }),
  };
}
function page<T>(v: unknown, parse: (v: unknown) => T): Page<T> {
  const r = record(v);
  return {
    items: list(r.items, parse),
    nextCursor: r.nextCursor === null ? null : safetyId(r.nextCursor),
  };
}
export function createAdminSafetyClient(
  fetcher: typeof adminFetch,
  timeoutMs = 15000,
) {
  async function request<T>(
    path: string,
    parse: (v: unknown) => T,
    init: RequestInit = {},
    signal?: AbortSignal,
  ): Promise<T> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let abort = () => {};
    const stopped = new Promise<never>((_, reject) => {
      abort = () => {
        controller.abort();
        reject(
          new SafetyError(
            "Request cancelled. Refresh to check the current state.",
          ),
        );
      };
      if (signal?.aborted) abort();
      else signal?.addEventListener("abort", abort, { once: true });
      timer = setTimeout(() => {
        controller.abort();
        reject(
          new SafetyError(
            "The request timed out. Its result is unknown; refresh before retrying.",
          ),
        );
      }, timeoutMs);
    });
    try {
      const work = async () => {
        if (controller.signal.aborted)
          throw new SafetyError("Request cancelled.");
        // React Native's fetch polyfill adds an undeclared _ query parameter
        // for cache: "no-store". Use a header so strict API queries stay intact.
        const headers = new Headers(init.headers);
        headers.set("Cache-Control", "no-store");
        const response = await fetcher(path, {
          ...init,
          headers,
          signal: controller.signal,
        });
        if (!response.ok) {
          const messages: Record<number, string> = {
            400: "The request was not accepted. Check the selected status and note.",
            401: "Your Admin session has expired. Sign in again.",
            403: "This account is not permitted to perform this action.",
            404: "This record or feature is unavailable on this server. The new backend may not be enabled yet.",
            409: "Another action changed this record. Refresh and review it before continuing.",
            429: "Too many requests. Wait a minute, then refresh.",
          };
          throw new SafetyError(
            messages[response.status] ??
              "The server could not complete the request. Refresh to check its result.",
            response.status,
          );
        }
        return parse(await response.json());
      };
      return await Promise.race([work(), stopped]);
    } catch (error) {
      if (error instanceof SafetyError) throw error;
      throw new SafetyError(
        "Connection or sign-in failed. The request result is unknown; refresh before retrying.",
      );
    } finally {
      if (timer) clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
    }
  }
  const query = (status?: string, cursor?: string) => {
    const q = new URLSearchParams({ limit: "25" });
    if (status) q.set("status", status);
    if (cursor) q.set("cursor", safetyId(cursor));
    return q.toString();
  };
  const patch = (body: unknown): RequestInit => ({
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return {
    latestDriverLocation: (driverId: string, signal?: AbortSignal) => {
      const id = safetyId(driverId);
      return request(
        "/driver-locations/fleet",
        (value) => {
          try {
            return latestLocationForDriver(value, id);
          } catch {
            return invalid();
          }
        },
        {},
        signal,
      );
    },
    emergencies: (
      status?: EmergencyStatus,
      cursor?: string,
      signal?: AbortSignal,
    ) =>
      request(
        `/emergencies/admin?${query(status, cursor)}`,
        (v) => page(v, emergency),
        {},
        signal,
      ),
    emergency: (id: string, signal?: AbortSignal) =>
      request(
        `/emergencies/admin/${safetyId(id)}`,
        emergencyDetail,
        {},
        signal,
      ),
    acknowledge: (id: string, note: string, signal?: AbortSignal) =>
      request(
        `/emergencies/admin/${safetyId(id)}/acknowledge`,
        (v) => {
          const item = emergencyDetail(v);
          if (item.status === "OPEN") return invalid();
          return item;
        },
        patch({ note: note.trim() }),
        signal,
      ),
    resolve: (id: string, note: string, signal?: AbortSignal) => {
      if (!note.trim() || note.trim().length > 1000)
        throw new SafetyError("Enter a resolution note of 1–1000 characters.");
      return request(
        `/emergencies/admin/${safetyId(id)}/resolve`,
        (v) => {
          const item = emergencyDetail(v);
          if (item.status !== "RESOLVED") return invalid();
          return item;
        },
        patch({ note: note.trim() }),
        signal,
      );
    },
    feedback: (status?: ReviewStatus, cursor?: string, signal?: AbortSignal) =>
      request(
        `/feedback/admin?${query(status, cursor)}`,
        (v) => page(v, feedback),
        {},
        signal,
      ),
    feedbackDetail: (id: string, signal?: AbortSignal) =>
      request(`/feedback/admin/${safetyId(id)}`, feedbackDetail, {}, signal),
    review: (
      item: FeedbackDetail,
      status: Exclude<ReviewStatus, "NEW">,
      note: string,
      signal?: AbortSignal,
    ) => {
      if (
        !note.trim() ||
        note.trim().length > 1000 ||
        !reviewTransitions[item.reviewStatus].includes(status)
      )
        throw new SafetyError(
          "Select a permitted status and enter a note of 1–1000 characters.",
        );
      return request(
        `/feedback/admin/${safetyId(item.id)}/review`,
        feedbackDetail,
        patch({
          expectedStatus: item.reviewStatus,
          expectedUpdatedAt: item.updatedAt,
          status,
          note: note.trim(),
        }),
        signal,
      );
    },
  };
}
export const adminSafety = createAdminSafetyClient(adminFetch);
