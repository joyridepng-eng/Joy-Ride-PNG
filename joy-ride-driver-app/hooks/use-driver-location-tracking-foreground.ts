import { driverFetch } from "@/services/driver-auth";
import * as Location from "expo-location";
import { Platform } from "react-native";
import { useEffect, useState } from "react";

type TrackingStatus =
  "idle" | "requesting-permission" | "tracking" | "permission-denied" | "error";

type LatestLocation = {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  heading: number | null;
  speed: number | null;
  recordedAt: string;
};

type LocationSample = Omit<LatestLocation, "recordedAt"> & { timestamp: number };
type UseDriverLocationTrackingOptions = { rideId?: string; enabled: boolean; uploadEnabled?: boolean };

function nonNegative(value: number | null): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value : null;
}

export function useDriverLocationTracking({ rideId, enabled, uploadEnabled = true }: UseDriverLocationTrackingOptions) {
  const [status, setStatus] = useState<TrackingStatus>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  // This remains the last location ACCEPTED by the backend, not just read by GPS.
  const [latestLocation, setLatestLocation] = useState<LatestLocation | null>(null);

  useEffect(() => {
    let cancelled = false;
    let nativeSubscription: Location.LocationSubscription | null = null;
    let webWatchId: number | null = null;
    let posting = false;
    let queuedSample: LocationSample | null = null;
    let newestTimestamp = -Infinity;
    let activeRequest: AbortController | null = null;

    setStatus(enabled ? "requesting-permission" : "idle");
    setErrorMessage("");
    setLatestLocation(null);
    if (!enabled) return;

    function reportError(message: string) {
      if (cancelled) return;
      setStatus("error");
      setErrorMessage(message);
    }

    async function drainQueue() {
      if (cancelled || posting) return;
      posting = true;
      try {
        while (!cancelled && queuedSample !== null) {
          const sample: LocationSample = queuedSample;
          queuedSample = null;
          const controller = new AbortController();
          activeRequest = controller;
          // driverFetch must forward the signal to fetch for cancellation to work.
          const timeout = setTimeout(() => controller.abort(), 20_000);
          try {
            const recordedAt = new Date(sample.timestamp).toISOString();
            const response = await driverFetch("/driver-locations/upsert", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              signal: controller.signal,
              body: JSON.stringify({
                rideId: rideId || undefined,
                latitude: sample.latitude,
                longitude: sample.longitude,
                accuracy: sample.accuracy ?? undefined,
                heading: sample.heading ?? undefined,
                speed: sample.speed ?? undefined,
                recordedAt,
              }),
            });
            if (cancelled) return;
            // Never display or log raw response bodies, credentials, or exceptions.
            if (!response.ok) {
              reportError(
                response.status === 401 || response.status === 403
                  ? "Location upload was not authorized. Check your driver sign-in."
                  : "The server could not accept the location update. Please try again.",
              );
              continue;
            }

            setStatus("tracking");
            setErrorMessage("");
          } catch {
            reportError("Could not upload your location. Check your connection and try again.");
          } finally {
            clearTimeout(timeout);
            if (activeRequest === controller) activeRequest = null;
          }
        }
      } finally {
        posting = false;
      }
    }

    function receiveLocation(sample: LocationSample) {
      if (cancelled) return;
      if (
        !Number.isFinite(sample.latitude) || Math.abs(sample.latitude) > 90 ||
        !Number.isFinite(sample.longitude) || Math.abs(sample.longitude) > 180 ||
        !Number.isFinite(sample.timestamp) || sample.timestamp <= 0 ||
        !Number.isFinite(new Date(sample.timestamp).getTime())
      ) {
        reportError("The device returned an invalid GPS reading. Waiting for another reading.");
        return;
      }
      // Do not let older callbacks replace a newer sample.
      if (sample.timestamp < newestTimestamp) return;
      newestTimestamp = sample.timestamp;

      const localSample: LocationSample = {
        ...sample,
        accuracy: nonNegative(sample.accuracy),
        heading: sample.heading !== null && sample.heading < 360
          ? nonNegative(sample.heading) : null,
        speed: nonNegative(sample.speed),
      };
      setLatestLocation({
        latitude: localSample.latitude,
        longitude: localSample.longitude,
        accuracy: localSample.accuracy,
        heading: localSample.heading,
        speed: localSample.speed,
        recordedAt: new Date(localSample.timestamp).toISOString(),
      });
      if (!uploadEnabled) {
        setStatus("tracking");
        setErrorMessage("");
        return;
      }
      queuedSample = localSample;

      void drainQueue();
    }

    async function startNativeTracking() {
      try {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (cancelled) return;
        if (permission.status !== "granted") {
          setStatus("permission-denied");
          setErrorMessage("Location permission is required to share the driver position.");
          return;
        }
        const servicesEnabled = await Location.hasServicesEnabledAsync();
        if (cancelled) return;
        if (!servicesEnabled) {
          reportError("Location services are turned off. Enable GPS and restart tracking.");
          return;
        }
        void Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High })
          .then(location => receiveLocation({
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
            accuracy: location.coords.accuracy,
            heading: location.coords.heading,
            speed: location.coords.speed,
            timestamp: location.timestamp,
          }))
          .catch(() => { /* The continuous watcher can still provide a fix. */ });
        const subscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.High,
            timeInterval: 1000,
            distanceInterval: 1,
          },
          (location) => receiveLocation({
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
            accuracy: location.coords.accuracy,
            heading: location.coords.heading,
            speed: location.coords.speed,
            timestamp: location.timestamp,
          }),
          () => reportError("The device could not obtain a GPS position. Check location services."),
        );
        // Cleanup may already have run while watchPositionAsync was pending.
        if (cancelled) {
          subscription.remove();
          return;
        }
        nativeSubscription = subscription;
        // 'tracking' means the watcher is active; latestLocation confirms uploads.
        setStatus((current) => current === "error" ? current : "tracking");
      } catch {
        reportError("Could not start location tracking. Check permissions and restart tracking.");
      }
    }

    function startWebTracking() {
      if (typeof navigator === "undefined" || !navigator.geolocation) {
        reportError("Location tracking is not supported by this browser.");
        return;
      }
      try {
        webWatchId = navigator.geolocation.watchPosition(
          (position) => receiveLocation({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            heading: position.coords.heading,
            speed: position.coords.speed,
            timestamp: position.timestamp,
          }),
          (error) => {
            if (cancelled) return;
            if (error.code === 1) {
              setStatus("permission-denied");
              setErrorMessage("Allow location access in your browser and restart tracking.");
            } else {
              reportError("The browser could not obtain your location. Check location services.");
            }
          },
          { enableHighAccuracy: true, maximumAge: 5_000, timeout: 20_000 },
        );
      } catch {
        reportError("Could not start browser location tracking.");
      }
    }

    if (Platform.OS === "web") startWebTracking();
    else void startNativeTracking();

    return () => {
      cancelled = true;
      queuedSample = null;
      activeRequest?.abort();
      nativeSubscription?.remove();
      if (webWatchId !== null && typeof navigator !== "undefined") {
        navigator.geolocation?.clearWatch(webWatchId);
      }
    };
  }, [enabled, rideId, uploadEnabled]);

  return { status, errorMessage, latestLocation, isTracking: status === "tracking" };
}
