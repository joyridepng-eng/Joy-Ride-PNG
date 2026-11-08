import type { ReactElement } from "react";

export type RiderMapPoint = {
  latitude: number;
  longitude: number;
  label?: string | null;
};

type RiderLiveTripMapProps = {
  rideId: string;
  status: string;
  pickup: RiderMapPoint | null;
  dropoff: RiderMapPoint | null;
  driverAssigned: boolean;
  driverName?: string | null;
  vehicleLabel?: string | null;
  trackingEnabled?: boolean;
};

export declare function RiderLiveTripMap(
  props: RiderLiveTripMapProps,
): ReactElement;

export default RiderLiveTripMap;
