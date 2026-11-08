type DriverLocation = {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  recordedAt: string;
};

type DriverLocationTrackingResult = {
  status: "idle";
  errorMessage: null;
  latestLocation: DriverLocation | null;
  isTracking: false;
};

export function useDriverLocationTracking(): DriverLocationTrackingResult {
  return {
    status: "idle",
    errorMessage: null,
    latestLocation: null,
    isTracking: false,
  };
}
