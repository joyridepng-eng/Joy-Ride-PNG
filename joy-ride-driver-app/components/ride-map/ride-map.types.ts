export type RideMapPoint = {
  latitude: number;
  longitude: number;
  label?: string | null;
  address?: string | null;
  accuracy?: number | null;
  heading?: number | null;
  speed?: number | null;
};

export type RideRoute = {
  coordinates: [number, number][];
  distanceMeters: number;
  durationSeconds: number;
};

export type RideMapProps = {
  driverLocation?: RideMapPoint | null;
  pickupLocation?: RideMapPoint | null;
  dropoffLocation?: RideMapPoint | null;
  activeDestination?: RideMapPoint | null;
  route?: RideRoute | null;
  routeLoading?: boolean;
  routeError?: string;
  navigationMode?:
    | "pickup"
    | "waiting"
    | "dropoff";
};
