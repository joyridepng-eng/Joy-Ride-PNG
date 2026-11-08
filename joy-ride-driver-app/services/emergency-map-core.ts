import { parsePosition, type Position } from "./driver-safety-core";

// A map centre is only a viewing region. Call this only after explicit Driver
// selection, never on mount, pan, map-ready, GPS denial or a retry.
export function selectedIncidentPoint(
  value: unknown,
  now = Date.now(),
): Position | undefined {
  if (!Number.isFinite(now)) return undefined;
  try {
    if (!value || typeof value !== "object") return undefined;
    const p = value as Record<string, unknown>;
    return parsePosition({
      source: "MANUAL_PIN",
      latitude: p.latitude,
      longitude: p.longitude,
      recordedAt: new Date(now).toISOString(),
    });
  } catch {
    return undefined;
  }
}
export function incidentLocationText(
  position?: Position,
  now = Date.now(),
): string {
  if (!position)
    return "No incident location attached. You can send without location.";
  const point = `${position.latitude.toFixed(6)}, ${position.longitude.toFixed(6)}`;
  const time = new Date(position.recordedAt).toLocaleString();
  if (position.source === "MANUAL_PIN")
    return `Selected incident pin: ${point}. Selected: ${time}. This is a fixed Driver-selected point, not live GPS; it has no measured GPS accuracy.`;
  const age = now - Date.parse(position.recordedAt);
  const freshness =
    !Number.isFinite(age) || age < -60000
      ? "time uncertain"
      : age > 120000
        ? "stale"
        : "recent";
  const accuracy =
    position.accuracyMeters === undefined
      ? "accuracy unavailable"
      : `reported accuracy approximately ${position.accuracyMeters} metres`;
  return `${position.source === "GPS" ? "Device GPS snapshot" : "Saved location; source unknown"}: ${point}. Recorded: ${time} (${freshness}); ${accuracy}. This is not continuous tracking.`;
}
