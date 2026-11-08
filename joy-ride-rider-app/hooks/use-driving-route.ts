import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

const API_BASE_URL = (
  process.env.EXPO_PUBLIC_API_BASE_URL ??
  'https://explore-png-api.onrender.com'
).replace(/\/+$/, '');

const DEFAULT_ROUTE_REFRESH_INTERVAL_MS = 15000;

export type RouteCoordinate = {
  latitude: number;
  longitude: number;
};

export type DrivingRoute = {
  coordinates: RouteCoordinate[];
  distanceMeters: number;
  durationSeconds: number;
};

type RoutePoint = {
  latitude: number;
  longitude: number;
};

type UseDrivingRouteOptions = {
  origin?: RoutePoint | null;
  destination?: RoutePoint | null;
  enabled: boolean;
  refreshIntervalMs?: number;
};

type UseDrivingRouteResult = {
  route: DrivingRoute | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

function isValidPoint(
  point: RoutePoint | null | undefined,
): point is RoutePoint {
  return Boolean(
    point &&
      Number.isFinite(point.latitude) &&
      Number.isFinite(point.longitude),
  );
}

function parseRoute(
  value: unknown,
): DrivingRoute | null {
  if (
    !value ||
    typeof value !== 'object'
  ) {
    return null;
  }

  const candidate = value as Record<string, unknown>;

  if (
    typeof candidate.distanceMeters !== 'number' ||
    !Number.isFinite(candidate.distanceMeters) ||
    typeof candidate.durationSeconds !== 'number' ||
    !Number.isFinite(candidate.durationSeconds) ||
    !Array.isArray(candidate.coordinates)
  ) {
    return null;
  }

  const coordinates = candidate.coordinates
    .map((coordinate) => {
      if (
        !Array.isArray(coordinate) ||
        coordinate.length < 2
      ) {
        return null;
      }

      const longitude = coordinate[0];
      const latitude = coordinate[1];

      if (
        typeof latitude !== 'number' ||
        !Number.isFinite(latitude) ||
        typeof longitude !== 'number' ||
        !Number.isFinite(longitude)
      ) {
        return null;
      }

      return {
        latitude,
        longitude,
      };
    })
    .filter(
      (
        coordinate,
      ): coordinate is RouteCoordinate =>
        coordinate != null,
    );

  if (coordinates.length < 2) {
    return null;
  }

  return {
    coordinates,
    distanceMeters: candidate.distanceMeters,
    durationSeconds: candidate.durationSeconds,
  };
}

export function useDrivingRoute({
  origin,
  destination,
  enabled,
  refreshIntervalMs =
    DEFAULT_ROUTE_REFRESH_INTERVAL_MS,
}: UseDrivingRouteOptions): UseDrivingRouteResult {
  const [route, setRoute] =
    useState<DrivingRoute | null>(null);
  const [isLoading, setIsLoading] =
    useState(false);
  const [error, setError] =
    useState<string | null>(null);

  const latestOriginRef =
    useRef<RoutePoint | null>(null);
  const latestDestinationRef =
    useRef<RoutePoint | null>(null);

  const abortControllerRef =
    useRef<AbortController | null>(null);
  const requestInFlightRef =
    useRef(false);

  latestOriginRef.current =
    isValidPoint(origin) ? origin : null;

  latestDestinationRef.current =
    isValidPoint(destination)
      ? destination
      : null;

  const refresh = useCallback(async () => {
    const currentOrigin =
      latestOriginRef.current;
    const currentDestination =
      latestDestinationRef.current;

    if (
      !enabled ||
      !currentOrigin ||
      !currentDestination ||
      requestInFlightRef.current
    ) {
      return;
    }

    requestInFlightRef.current = true;

    abortControllerRef.current?.abort();

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsLoading(true);

    try {
      const query = [
        `originLatitude=${encodeURIComponent(
          String(currentOrigin.latitude),
        )}`,
        `originLongitude=${encodeURIComponent(
          String(currentOrigin.longitude),
        )}`,
        `destinationLatitude=${encodeURIComponent(
          String(currentDestination.latitude),
        )}`,
        `destinationLongitude=${encodeURIComponent(
          String(currentDestination.longitude),
        )}`,
      ].join('&');

      const response = await fetch(
        `${API_BASE_URL}/routing/driving?${query}`,
        {
          signal: controller.signal,
        },
      );

      if (!response.ok) {
        throw new Error(
          `Driving route request failed (${response.status}).`,
        );
      }

      const data: unknown = await response.json();
      const parsed = parseRoute(data);

      if (!parsed) {
        throw new Error(
          'Driving route response was invalid.',
        );
      }

      setRoute(parsed);
      setError(null);
    } catch (caught) {
      if (
        caught instanceof Error &&
        caught.name === 'AbortError'
      ) {
        return;
      }

      setError(
        caught instanceof Error
          ? caught.message
          : 'Could not load the driving route.',
      );
    } finally {
      if (
        abortControllerRef.current === controller
      ) {
        abortControllerRef.current = null;
      }

      requestInFlightRef.current = false;
      setIsLoading(false);
    }
  }, [enabled]);

  const originAvailable = isValidPoint(origin);

  const destinationKey = isValidPoint(destination)
    ? `${destination.latitude.toFixed(
        6,
      )}:${destination.longitude.toFixed(6)}`
    : '';

  useEffect(() => {
    if (
      !enabled ||
      !originAvailable ||
      !destinationKey
    ) {
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
      requestInFlightRef.current = false;

      setRoute(null);
      setError(null);
      setIsLoading(false);

      return;
    }

    void refresh();

    const interval = setInterval(() => {
      void refresh();
    }, refreshIntervalMs);

    return () => {
      clearInterval(interval);

      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
      requestInFlightRef.current = false;
    };
  }, [
    destinationKey,
    enabled,
    originAvailable,
    refresh,
    refreshIntervalMs,
  ]);

  return {
    route,
    isLoading,
    error,
    refresh,
  };
}