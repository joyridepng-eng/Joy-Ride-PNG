export type PlacePoint = { latitude: number; longitude: number };
export function incidentSearchQuery(value: string): string | undefined {
  const clean = value.trim().replace(/\s+/g, " ");
  if (
    clean.length < 3 ||
    clean.length > 160 ||
    /[\u0000-\u001f\u007f]/.test(value)
  )
    return undefined;
  return /papua new guinea|\bpng\b/i.test(clean)
    ? clean
    : `${clean}, Papua New Guinea`;
}
export function incidentSearchPoints(value: unknown): PlacePoint[] {
  if (!Array.isArray(value)) return [];
  const result: PlacePoint[] = [];
  for (const item of value.slice(0, 30)) {
    if (!item || typeof item !== "object") continue;
    const { latitude, longitude } = item as Record<string, unknown>;
    if (
      typeof latitude !== "number" ||
      !Number.isFinite(latitude) ||
      typeof longitude !== "number" ||
      !Number.isFinite(longitude) ||
      Math.abs(latitude) > 90 ||
      Math.abs(longitude) > 180 ||
      result.some((p) => p.latitude === latitude && p.longitude === longitude)
    )
      continue;
    result.push({ latitude, longitude });
    if (result.length === 5) break;
  }
  return result;
}
export class IncidentSearchPermissionDenied extends Error {}
export type SearchOutcome =
  | { kind: "results"; points: PlacePoint[] }
  | {
      kind:
        | "invalid"
        | "busy"
        | "cancelled"
        | "timeout"
        | "denied"
        | "failed"
        | "empty";
    };

// Native geocoding cannot be aborted. Keep one native request in flight even
// after timeout/cancellation, and discard all results from obsolete searches.
export function createIncidentPlaceSearch(
  provider: (query: string) => Promise<unknown>,
  timeoutMs = 10000,
) {
  let pending = false;
  let generation = 0;
  let cancel: (() => void) | undefined;
  return {
    cancel() {
      generation++;
      cancel?.();
    },
    async search(input: string): Promise<SearchOutcome> {
      const query = incidentSearchQuery(input);
      if (!query) return { kind: "invalid" };
      if (pending) return { kind: "busy" };
      pending = true;
      const ticket = ++generation;
      let timer: ReturnType<typeof setTimeout> | undefined;
      let stop: (outcome: SearchOutcome) => void = () => {};
      const stopped = new Promise<SearchOutcome>((resolve) => {
        stop = resolve;
      });
      cancel = () => stop({ kind: "cancelled" });
      timer = setTimeout(() => {
        generation++;
        stop({ kind: "timeout" });
      }, timeoutMs);
      const work = Promise.resolve()
        .then(() => provider(query))
        .then(
          (value) =>
            ticket === generation
              ? incidentSearchPoints(value).length
                ? {
                    kind: "results" as const,
                    points: incidentSearchPoints(value),
                  }
                : { kind: "empty" as const }
              : { kind: "cancelled" as const },
          (error) =>
            ticket !== generation
              ? { kind: "cancelled" as const }
              : {
                  kind:
                    error instanceof IncidentSearchPermissionDenied
                      ? ("denied" as const)
                      : ("failed" as const),
                },
        )
        .finally(() => {
          pending = false;
        });
      try {
        return await Promise.race([work, stopped]);
      } finally {
        clearTimeout(timer);
        cancel = undefined;
      }
    },
  };
}
