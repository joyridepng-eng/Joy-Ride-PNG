// Idempotency IDs identify retries, never authorize requests. The server derives
// Driver ownership from authentication, not from this local record.
export type LocationSource = "GPS" | "MANUAL_PIN";
export type Position = {
  source?: LocationSource;
  latitude: number;
  longitude: number;
  accuracyMeters?: number;
  recordedAt: string;
};
export type Draft = {
  driverId: string;
  clientRequestId: string;
  message: string;
  clientOccurredAt: string;
  location?: Position;
  alertId: string | null;
};
export type Emergency = {
  id: string;
  clientRequestId: string;
  status: "OPEN" | "ACKNOWLEDGED" | "RESOLVED";
  message: string | null;
  createdAt: string;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  latitude: number | null;
  longitude: number | null;
  locationRecordedAt: string | null;
  locationIsStale: boolean;
  locationSource: LocationSource | null;
  adminInboxItemCount: number;
};
export type Rating = { average: number | null; count: number };
export type Summary = {
  ratingCount: number;
  overall: Rating;
  customerCare: Rating;
  professionalism: Rating;
  driving: Rating;
  cleanliness: Rating;
};
export class DriverSafetyError extends Error {}
export const safeMessage = (e: unknown) =>
  e instanceof DriverSafetyError
    ? e.message
    : "Unable to complete this action. Check sign-in and connection. Any saved alert remains available for retry.";
const fail = (): never => {
  throw new DriverSafetyError(
    "Invalid safety data. Refresh or contact Admin; do not assume the alert was received.",
  );
};
export function object(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== "object" || Array.isArray(v)) return fail();
  return v as Record<string, unknown>;
}
export function identifier(v: unknown): string {
  if (typeof v !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(v)) return fail();
  return v;
}
function date(v: unknown): string {
  if (
    typeof v !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T/.test(v) ||
    !Number.isFinite(Date.parse(v))
  )
    return fail();
  return v;
}
function count(v: unknown): number {
  if (typeof v !== "number" || !Number.isSafeInteger(v) || v < 0) return fail();
  return v;
}
function uuid(v: unknown): string {
  if (
    typeof v !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
      v,
    )
  )
    return fail();
  return v;
}
function number(v: unknown, low: number, high: number): number {
  if (typeof v !== "number" || !Number.isFinite(v) || v < low || v > high)
    return fail();
  return v;
}
export function parsePosition(v: unknown): Position {
  const p = object(v);
  if (p.source !== undefined && p.source !== "GPS" && p.source !== "MANUAL_PIN")
    return fail();
  return {
    ...(p.source === undefined ? {} : { source: p.source }),
    latitude: number(p.latitude, -90, 90),
    longitude: number(p.longitude, -180, 180),
    recordedAt: date(p.recordedAt),
    ...(p.source === "MANUAL_PIN" || p.accuracyMeters === undefined
      ? {}
      : { accuracyMeters: number(p.accuracyMeters, 0, Number.MAX_VALUE) }),
  };
}
export function parseDraft(v: unknown, driverId: string): Draft {
  const d = object(v);
  if (
    d.driverId !== driverId ||
    typeof d.message !== "string" ||
    d.message.length > 200
  )
    return fail();
  return {
    driverId: identifier(driverId),
    clientRequestId: uuid(d.clientRequestId),
    message: d.message,
    clientOccurredAt: date(d.clientOccurredAt),
    alertId: d.alertId === null ? null : identifier(d.alertId),
    ...(d.location === undefined
      ? {}
      : { location: parsePosition(d.location) }),
  };
}
export function parseEmergency(v: unknown): Emergency {
  const e = object(v);
  if (
    e.status !== "OPEN" &&
    e.status !== "ACKNOWLEDGED" &&
    e.status !== "RESOLVED"
  )
    return fail();
  if (
    e.serverReceived !== true ||
    typeof e.locationIsStale !== "boolean" ||
    (e.message !== null && typeof e.message !== "string")
  )
    return fail();
  const acknowledgedAt =
    e.acknowledgedAt === null ? null : date(e.acknowledgedAt);
  const resolvedAt = e.resolvedAt === null ? null : date(e.resolvedAt);
  if (
    (e.status === "OPEN") !== (acknowledgedAt === null) ||
    (e.status === "RESOLVED") !== (resolvedAt !== null) ||
    e.humanAcknowledged !== (acknowledgedAt !== null)
  )
    return fail();
  const latitude = e.latitude === null ? null : number(e.latitude, -90, 90);
  const longitude =
    e.longitude === null ? null : number(e.longitude, -180, 180);
  if ((latitude === null) !== (longitude === null)) return fail();
  const locationRecordedAt =
    e.locationRecordedAt === null ? null : date(e.locationRecordedAt);
  if (
    (latitude === null) !== (locationRecordedAt === null) ||
    e.locationAccepted !== (latitude !== null)
  )
    return fail();
  return {
    id: identifier(e.id),
    clientRequestId: uuid(e.clientRequestId),
    status: e.status,
    message: e.message,
    createdAt: date(e.createdAt),
    acknowledgedAt,
    resolvedAt,
    latitude,
    longitude,
    locationRecordedAt,
    locationIsStale: e.locationIsStale,
    locationSource:
      e.locationSource === "GPS" || e.locationSource === "MANUAL_PIN"
        ? e.locationSource
        : null,
    adminInboxItemCount: count(e.adminInboxItemCount),
  };
}
export function parseSummary(v: unknown): Summary {
  const s = object(v),
    total = count(s.ratingCount);
  const rating = (v: unknown): Rating => {
    const r = object(v),
      n = count(r.count);
    if (n > total || (n === 0) !== (r.average === null)) return fail();
    return {
      count: n,
      average: r.average === null ? null : number(r.average, 1, 5),
    };
  };
  const overall = rating(s.overall);
  if (overall.count !== total) return fail();
  return {
    ratingCount: total,
    overall,
    customerCare: rating(s.customerCare),
    professionalism: rating(s.professionalism),
    driving: rating(s.driving),
    cleanliness: rating(s.cleanliness),
  };
}
export function retryId(): string {
  // Time prefix plus 74 random bits for accidental-collision resistance. Not a
  // security token. Persisted before network; never regenerated on retry.
  const time = Date.now().toString(16).padStart(12, "0").slice(-12);
  return `${time.slice(0, 8)}-${time.slice(8)}-4xxx-yxxx-xxxxxxxxxxxx`.replace(
    /[xy]/g,
    (c) => {
      const r = Math.floor(Math.random() * 16);
      return (c === "x" ? r : (r & 3) | 8).toString(16);
    },
  );
}
export type Store = {
  read: (key: string) => Promise<string | null>;
  write: (key: string, value: string) => Promise<void>;
};
export type Request = (
  driverId: string,
  path: string,
  init?: RequestInit,
) => Promise<unknown>;
export function createSafetyClient(
  store: Store,
  request: Request,
  newId = retryId,
) {
  const jobs = new Map<string, Promise<unknown>>();
  const key = (id: string) => `joyride-emergency-v1-${identifier(id)}`;
  const load = async (id: string) => {
    const raw = await store.read(key(id));
    if (raw === null) return null;
    try {
      return parseDraft(JSON.parse(raw), id);
    } catch {
      throw new DriverSafetyError(
        "The saved alert could not be read. Contact Admin; it has not been deleted or replaced.",
      );
    }
  };
  const save = (d: Draft) => store.write(key(d.driverId), JSON.stringify(d));
  async function serial<T>(id: string, work: () => Promise<T>): Promise<T> {
    if (jobs.has(id))
      throw new DriverSafetyError(
        "An alert operation is already running. Please wait.",
      );
    const job = Promise.resolve().then(work);
    jobs.set(id, job);
    try {
      return await job;
    } finally {
      if (jobs.get(id) === job) jobs.delete(id);
    }
  }
  return {
    load,
    prepare: (
      id: string,
      message: string,
      position?: Position,
      replaceReceived = false,
    ) =>
      serial(id, async () => {
        const old = await load(id);
        if (old && (!replaceReceived || !old.alertId))
          throw new DriverSafetyError(
            "An existing alert is saved. Retry or check it before starting a new incident.",
          );
        const d = parseDraft(
          {
            driverId: id,
            clientRequestId: newId(),
            message: message.trim(),
            clientOccurredAt: new Date().toISOString(),
            alertId: null,
            ...(position ? { location: position } : {}),
          },
          id,
        );
        await save(d); // No POST is permitted before durable storage succeeds.
        return d;
      }),
    send: (id: string, signal?: AbortSignal) =>
      serial(id, async () => {
        const d = await load(id);
        if (!d) throw new DriverSafetyError("No saved alert is available.");
        const { driverId: _owner, alertId: _receipt, ...body } = d;
        const result = parseEmergency(
          await request(id, "/emergencies/driver/me", {
            method: "POST",
            body: JSON.stringify(body),
            signal,
          }),
        );
        if (
          result.clientRequestId !== d.clientRequestId ||
          (d.alertId !== null && d.alertId !== result.id)
        )
          return fail();
        await save({ ...d, alertId: result.id });
        return result;
      }),
    get: async (id: string, alertId: string, signal?: AbortSignal) => {
      const e = parseEmergency(
        await request(id, `/emergencies/driver/me/${identifier(alertId)}`, {
          signal,
        }),
      );
      if (e.id !== alertId) return fail();
      return e;
    },
    history: async (id: string, signal?: AbortSignal) => {
      const p = object(
        await request(id, "/emergencies/driver/me?limit=25", { signal }),
      );
      if (!Array.isArray(p.items) || p.items.length > 25) return fail();
      return p.items.map(parseEmergency);
    },
    summary: async (id: string, signal?: AbortSignal) =>
      parseSummary(
        await request(id, "/feedback/driver/me/summary", { signal }),
      ),
  };
}
