import type { Emergency } from "./admin-safety";

export type MapPoint = {
  latitude: number;
  longitude: number;
  recordedAt: string;
  accuracyMeters: number | null;
  source: "GPS" | "MANUAL_PIN" | "UNKNOWN" | "FLEET_GPS";
};
export type LatestDriverLocation = MapPoint & {
  driverId: string;
  source: "FLEET_GPS";
  driverOnline: boolean | null;
};
const row = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error("INVALID_LOCATION");
  return value as Record<string, unknown>;
};
function coordinate(value: unknown, bound: number): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    Math.abs(value) > bound
  )
    throw Error("INVALID_LOCATION");
  return value;
}
function recordedTime(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T/.test(value) ||
    !Number.isFinite(Date.parse(value))
  )
    throw Error("INVALID_LOCATION");
  return value;
}
const accuracy = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;

// The existing authorized fleet route returns all rows. Keep only the selected
// incident's Driver, validate ownership twice, and discard all unrelated data.
export function latestLocationForDriver(
  value: unknown,
  driverId: string,
): LatestDriverLocation | null {
  if (
    !Array.isArray(value) ||
    value.length > 10000 ||
    !/^[A-Za-z0-9_-]{1,64}$/.test(driverId)
  )
    throw Error("INVALID_LOCATION");
  const points: LatestDriverLocation[] = [];
  for (const valueRow of value) {
    if (!valueRow || typeof valueRow !== "object" || Array.isArray(valueRow))
      continue;
    const item = valueRow as Record<string, unknown>;
    if (item.driverId !== driverId) continue;
    const driver = row(item.driver);
    if (driver.id !== driverId) throw Error("INVALID_LOCATION");
    points.push({
      driverId,
      latitude: coordinate(item.latitude, 90),
      longitude: coordinate(item.longitude, 180),
      recordedAt: recordedTime(item.recordedAt),
      accuracyMeters: accuracy(item.accuracy),
      source: "FLEET_GPS",
      driverOnline:
        typeof driver.isOnline === "boolean" ? driver.isOnline : null,
    });
  }
  points.sort((a, b) => Date.parse(b.recordedAt) - Date.parse(a.recordedAt));
  return points[0] ?? null;
}
export function incidentPoint(item: Emergency): MapPoint | null {
  if (
    item.latitude === null ||
    item.longitude === null ||
    item.locationRecordedAt === null
  )
    return null;
  const source =
    item.locationSource === "MANUAL_PIN" || item.locationSource === "GPS"
      ? item.locationSource
      : "UNKNOWN";
  return {
    latitude: coordinate(item.latitude, 90),
    longitude: coordinate(item.longitude, 180),
    recordedAt: recordedTime(item.locationRecordedAt),
    source,
    accuracyMeters:
      source === "MANUAL_PIN" ? null : accuracy(item.accuracyMeters),
  };
}
export function pointAge(point: MapPoint, now = Date.now()) {
  const age = now - Date.parse(point.recordedAt);
  const seconds =
    Number.isFinite(age) && age >= 0 ? Math.floor(age / 1000) : null;
  const limit = point.source === "FLEET_GPS" ? 60000 : 120000;
  return { seconds, stale: seconds === null || age > limit };
}
export function pointDescription(point: MapPoint, now = Date.now()): string {
  const source =
    point.source === "MANUAL_PIN"
      ? "Driver-selected incident pin"
      : point.source === "GPS"
        ? "Incident device GPS snapshot"
        : point.source === "FLEET_GPS"
          ? "Latest Driver-reported GPS"
          : "Incident location; source unknown";
  const age = pointAge(point, now);
  const timeLabel = point.source === "MANUAL_PIN" ? "Selected" : "Recorded";
  const clock =
    age.seconds === null
      ? "age unknown; check device clock"
      : `${age.seconds} seconds old`;
  const precision =
    point.source === "MANUAL_PIN"
      ? "Selected point; no measured GPS accuracy"
      : point.accuracyMeters === null
        ? "Accuracy unknown"
        : `Reported accuracy approximately ${Math.round(point.accuracyMeters)} metres`;
  return `${source}: ${point.latitude.toFixed(6)}, ${point.longitude.toFixed(6)}. ${timeLabel}: ${new Date(point.recordedAt).toLocaleString()}. ${clock}. ${point.source === "MANUAL_PIN" ? "Fixed incident point, not live GPS" : age.stale ? "Stale or uncertain position; confirm with the Driver" : "Recent report; not a guarantee of current position"}. ${precision}.`;
}
export function accuracyRadius(point: MapPoint): number | null {
  // Legacy/manual points have no confirmed GPS measurement. Extremely broad
  // accuracy is displayed as text rather than sent as an unsafe native radius.
  return (point.source === "GPS" || point.source === "FLEET_GPS") &&
    point.accuracyMeters !== null &&
    point.accuracyMeters > 0 &&
    point.accuracyMeters <= 10000
    ? point.accuracyMeters
    : null;
}
export function samePoint(
  first: MapPoint | null,
  second: MapPoint | null,
): boolean {
  return (
    !!first &&
    !!second &&
    first.latitude === second.latitude &&
    first.longitude === second.longitude
  );
}
export function incidentVehicleLabel(item: Emergency): string {
  return item.ride?.vehicle?.plateNumber
    ? `Ride-linked vehicle: ${item.ride.vehicle.plateNumber}; confirm with the Driver`
    : "Vehicle at incident unconfirmed";
}
