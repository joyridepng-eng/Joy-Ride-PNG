import { adminFetch } from "@/services/admin-auth";

export type AdminActiveRide = {
  id: string;
  status: string;

  riderName: string;
  riderPhone: string;

  pickupLabel: string | null;
  pickupAddress: string | null;
  pickupLatitude: number | null;
  pickupLongitude: number | null;

  dropoffLabel: string | null;
  dropoffAddress: string | null;
  dropoffLatitude: number | null;
  dropoffLongitude: number | null;

  estimatedFare: number | null;
  finalFare: number | null;

  requestedAt: string;
  updatedAt: string;

  driver?: {
    id: string;
    fullName: string;
    phone?: string;
  } | null;

  vehicle?: {
    id: string;
    plateNumber: string;
    make: string;
    model: string;
    color: string;
  } | null;
};

const ACTIVE_STATUSES = new Set(["ACCEPTED", "DRIVER_ARRIVED", "IN_PROGRESS"]);

export async function loadActiveRides(): Promise<AdminActiveRide[]> {
  const response = await adminFetch(`/rides`, {
    headers: {
      Accept: "application/json",
    },
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.message || "Could not load active rides.");
  }

  if (!Array.isArray(data)) {
    return [];
  }

  return data.filter(
    (ride: AdminActiveRide) =>
      ACTIVE_STATUSES.has(ride.status) && Boolean(ride.driver?.id),
  );
}
