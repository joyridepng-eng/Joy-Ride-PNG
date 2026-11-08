import { riderFetch } from "./rider-auth";
import { loadRiderSession } from "./rider-session";

export type ActiveRiderRide = {
  id: string;
  status: "REQUESTED" | "ACCEPTED" | "DRIVER_ARRIVED" | "IN_PROGRESS";
};

const activeStatuses = new Set([
  "REQUESTED", "ACCEPTED", "DRIVER_ARRIVED", "IN_PROGRESS",
]);

export async function fetchActiveRiderRide(
  signal?: AbortSignal,
): Promise<ActiveRiderRide | null> {
  const session = await loadRiderSession();
  if (!session) throw new Error("Rider sign-in required.");

  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener("abort", abort, { once: true });

  const timeout = setTimeout(abort, 12000);

  try {
    const response = await riderFetch("/rides/me/active", {
      signal: controller.signal,
    });
    if (!response.ok) throw new Error("Active ride lookup failed.");

    const data: unknown = await response.json();
    const current = await loadRiderSession();
    if (
      controller.signal.aborted ||
      !current ||
      current.rider.id !== session.rider.id ||
      current.accessToken !== session.accessToken
    ) {
      throw new Error("Ride lookup session changed.");
    }

    if (data === null) return null;
    if (typeof data !== "object" || data === null) {
      throw new Error("Invalid active ride response.");
    }

    const ride = data as Partial<ActiveRiderRide>;
    if (
      typeof ride.id !== "string" ||
      !ride.id.trim() ||
      typeof ride.status !== "string" ||
      !activeStatuses.has(ride.status)
    ) {
      throw new Error("Invalid active ride response.");
    }

    return { id: ride.id, status: ride.status };
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
  }
}
