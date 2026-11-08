import type {
  LatestDriverLocation,
  MapPoint,
} from "@/services/emergency-map-core";
export type EmergencyMapProps = {
  incident: MapPoint | null;
  latest: LatestDriverLocation | null;
  refreshFailed: boolean;
  vehicleLabel: string;
};
