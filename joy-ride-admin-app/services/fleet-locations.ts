import { adminFetch } from "@/services/admin-auth";

export type FleetDriverLocation = {
  id: string;
  driverId: string;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  heading: number | null;
  speed: number | null;
  recordedAt: string;
  updatedAt: string;
  driver: {
    status: "PENDING" | "APPROVED" | "SUSPENDED" | "INACTIVE";
    id: string;
    fullName: string;
    isOnline: boolean;
    isAvailable: boolean;
  };
};

export async function loadFleetLocations(): Promise<FleetDriverLocation[]> {
  const response = await adminFetch(`/driver-locations/fleet`, {
    headers: {
      Accept: "application/json",
    },
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.message || "Could not load live fleet locations.");
  }

  return (Array.isArray(data) ? data : [data])
        .filter((location: FleetDriverLocation) =>
          location.driver.status !== "INACTIVE");
}
