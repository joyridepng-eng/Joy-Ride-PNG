import { riderFetch } from "@/services/rider-auth";
import {
  loadRiderSession,
  subscribeToRiderSession,
} from "@/services/rider-session";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";

const DEFAULT_POLL_INTERVAL_MS = 2000;
export type RideDriverLocation = {
  rideId: string;
  driverId: string;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  heading: number | null;
  speed: number | null;
  recordedAt: string;
  isFresh: boolean;
};
type UseRideDriverLocationOptions = {
  rideId?: string | null;
  enabled: boolean;
  pollIntervalMs?: number;
};
type UseRideDriverLocationResult = {
  location: RideDriverLocation | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

function nullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parseDriverLocation(value: unknown): RideDriverLocation | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  const latitude = nullableNumber(item.latitude);
  const longitude = nullableNumber(item.longitude);

  if (
    latitude === null || longitude === null ||
    Math.abs(latitude) > 90 || Math.abs(longitude) > 180 ||
    typeof item.rideId !== "string" || !item.rideId ||
    typeof item.driverId !== "string" || !item.driverId ||
    typeof item.recordedAt !== "string" ||
    !Number.isFinite(Date.parse(item.recordedAt))
  ) {
    return null;
  }

  const accuracy = nullableNumber(item.accuracy);
  const heading = nullableNumber(item.heading);
  const speed = nullableNumber(item.speed);

  return {
    rideId: item.rideId,
    driverId: item.driverId,
    latitude,
    longitude,
    accuracy: accuracy !== null && accuracy >= 0 ? accuracy : null,
    heading: heading !== null && heading >= 0 && heading < 360 ? heading : null,
    speed: speed !== null && speed >= 0 ? speed : null,
    recordedAt: item.recordedAt,
    isFresh: item.isFresh === true,
  };
}

export function useRideDriverLocation({
  rideId,
  enabled,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
}: UseRideDriverLocationOptions): UseRideDriverLocationResult {
  const [location, setLocation] = useState<RideDriverLocation | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [appState, setAppState] = useState(AppState.currentState);
  const [sessionRevision, setSessionRevision] = useState(0);
  const generation = useRef(0);
  const pending = useRef<AbortController | null>(null);
  const tracking = enabled && appState === "active";

  useEffect(() => {
    const subscription = AppState.addEventListener("change", setAppState);
    const unsubscribe = subscribeToRiderSession(() => {
      generation.current++;
      pending.current?.abort();
      pending.current = null;
      setLocation(null);
      setError(null);
      setIsLoading(false);
      setSessionRevision(value => value + 1);
    });

    return () => {
      subscription.remove();
      unsubscribe();
    };
  }, []);

  const refresh = useCallback(async () => {
    const cleanRideId = rideId?.trim();
    if (!tracking || !cleanRideId || pending.current) return;

    const ticket = generation.current;
    const controller = new AbortController();
    pending.current = controller;
    const current = () =>
      ticket === generation.current &&
      pending.current === controller &&
      !controller.signal.aborted;
    const timeout = setTimeout(() => controller.abort(), 8000);

    setIsLoading(true);

    try {
      const session = await loadRiderSession();
      if (!current()) return;
      if (!session) throw new Error("Rider authentication required.");

      const response = await riderFetch(`/rides/me/${encodeURIComponent(cleanRideId)}/location`, {
        signal: controller.signal,
      });
      if (!current()) return;

      const data: unknown = response.ok ? await response.json() : null;
      const latestSession = await loadRiderSession();
      if (!current()) return;

      if (
        !latestSession ||
        latestSession.rider.id !== session.rider.id ||
        latestSession.accessToken !== session.accessToken
      ) {
        return;
      }

      if (response.status === 404) {
        setLocation(null);
        setError(null);
        return;
      }
      if (!response.ok) {
        throw new Error("Driver location refresh failed.");
      }

      const parsed = parseDriverLocation(data);
      if (!parsed || parsed.rideId !== cleanRideId) {
        throw new Error("Driver location response was invalid.");
      }

      setLocation(previous => {
        if (
          previous &&
          previous.rideId === parsed.rideId &&
          previous.driverId === parsed.driverId &&
          Date.parse(parsed.recordedAt) < Date.parse(previous.recordedAt)
        ) {
          return previous;
        }
        return parsed;
      });
      setError(null);
    } catch {
      if (
        ticket === generation.current &&
        pending.current === controller
      ) {
        setError("Driver location could not refresh. Please retry.");
      }
    } finally {
      clearTimeout(timeout);
      if (pending.current === controller) {
        pending.current = null;
        setIsLoading(false);
      }
    }
  }, [tracking, rideId]);


  const cancelPendingRequest = useCallback(() => {
    generation.current++;
    pending.current?.abort();
    pending.current = null;
  }, []);

useEffect(() => {
    cancelPendingRequest();
    setLocation(null);
    setError(null);
    setIsLoading(false);
    if (!tracking || !rideId?.trim()) return;

    void refresh();
    const intervalMs = Number.isFinite(pollIntervalMs)
      ? Math.max(1000, Math.min(10000, pollIntervalMs))
      : DEFAULT_POLL_INTERVAL_MS;
    const timer = setInterval(() => { void refresh(); }, intervalMs);

    return () => {
      clearInterval(timer);
      cancelPendingRequest();
    };
  }, [tracking, rideId, pollIntervalMs, refresh, sessionRevision, cancelPendingRequest]);

  return { location, isLoading, error, refresh };
}
