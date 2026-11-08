import { useEffect, useState, useSyncExternalStore } from "react";
import { AppState } from "react-native";
import { useDriverLocationTracking as useForegroundTracking } from './use-driver-location-tracking-foreground';
import { getBackgroundGPSSnapshot, subscribeBackgroundGPS, usesBackgroundGPS } from '@/services/background-gps';

export function useDriverLocationTracking(
  options: { rideId?: string; enabled: boolean },
) {
  const background = useSyncExternalStore(
    subscribeBackgroundGPS,
    getBackgroundGPSSnapshot,
    getBackgroundGPSSnapshot,
  );
  const [appState, setAppState] = useState(AppState.currentState);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", setAppState);
    return () => subscription.remove();
  }, []);

  const foreground = useForegroundTracking({
    ...options,
    enabled: options.enabled && appState === "active" &&
      (!usesBackgroundGPS || background.enabled),
    uploadEnabled: !usesBackgroundGPS,
  });

  if (!usesBackgroundGPS) return foreground;

  const local = foreground.latestLocation;
  const uploaded = background.latestLocation;
  const localTime = local ? Date.parse(local.recordedAt) : -Infinity;
  const uploadedTime = uploaded ? Date.parse(uploaded.recordedAt) : -Infinity;
  const latestLocation = local && Number.isFinite(localTime) &&
    (!uploaded || !Number.isFinite(uploadedTime) || localTime >= uploadedTime)
      ? local : uploaded;

  return {
    status: background.status,
    errorMessage: background.errorMessage,
    latestLocation: options.enabled && background.enabled ? latestLocation : null,
    isTracking: background.enabled && background.status === "tracking",
  };
}
