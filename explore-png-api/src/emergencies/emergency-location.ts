import { EmergencyLocationSource } from '@prisma/client';

export type NormalizedEmergencyLocation = {
  latitude: number | null;
  longitude: number | null;
  accuracyMeters: number | null;
  locationRecordedAt: Date | null;
  locationSource: EmergencyLocationSource | null;
};

// Location is best effort and must never prevent an alert. Source describes
// what the authenticated Driver supplied, not a verified physical position.
export function normalizeEmergencyLocation(
  value: unknown,
  now = Date.now(),
): NormalizedEmergencyLocation {
  const empty: NormalizedEmergencyLocation = {
    latitude: null,
    longitude: null,
    accuracyMeters: null,
    locationRecordedAt: null,
    locationSource: null,
  };
  if (!value || typeof value !== 'object' || Array.isArray(value)) return empty;
  const item = value as Record<string, unknown>;
  const { latitude, longitude, recordedAt } = item;
  const timestamp =
    typeof recordedAt === 'string' ? Date.parse(recordedAt) : NaN;
  if (
    typeof latitude !== 'number' ||
    !Number.isFinite(latitude) ||
    Math.abs(latitude) > 90 ||
    typeof longitude !== 'number' ||
    !Number.isFinite(longitude) ||
    Math.abs(longitude) > 180 ||
    typeof recordedAt !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T/.test(recordedAt) ||
    !Number.isFinite(timestamp) ||
    timestamp > now + 60_000
  )
    return empty;
  const locationSource =
    item.source === EmergencyLocationSource.GPS ||
    item.source === EmergencyLocationSource.MANUAL_PIN
      ? item.source
      : null;
  const accuracy = item.accuracyMeters;
  return {
    latitude,
    longitude,
    locationRecordedAt: new Date(timestamp),
    locationSource,
    // A selected map pin has no measured GPS accuracy. Do not copy the
    // accuracy of the device's initial map centre onto the selected point.
    accuracyMeters:
      locationSource !== EmergencyLocationSource.MANUAL_PIN &&
      typeof accuracy === 'number' &&
      Number.isFinite(accuracy) &&
      accuracy >= 0
        ? accuracy
        : null,
  };
}
