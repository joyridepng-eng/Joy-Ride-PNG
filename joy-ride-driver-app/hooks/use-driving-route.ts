import { useEffect, useState, useRef } from 'react';
import { driverFetch } from '@/services/driver-auth';
import { offlineTelemetryService } from '../services/offline-telemetry';
import type { RideRoute } from '../components/ride-map/ride-map.types';

export interface RouteCoordinate {
  latitude: number;
  longitude: number;
}

interface UseDrivingRouteOptions {
  rideId?: string | null;
  origin?: RouteCoordinate | null;
  destination?: RouteCoordinate | null;
  currentLocation?: RouteCoordinate | null;
  rideStatus?: 'ASSIGNED' | 'EN_ROUTE' | 'ARRIVED' | 'IN_PROGRESS' | 'COMPLETED';
  enabled?: boolean;
}

function validPoint(latitude: unknown, longitude: unknown): boolean {
  return typeof latitude === 'number' && Number.isFinite(latitude)
    && Math.abs(latitude) <= 90
    && typeof longitude === 'number' && Number.isFinite(longitude)
    && Math.abs(longitude) <= 180;
}

function readMetric(value: unknown): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function parseRoadRoute(data: unknown): RideRoute | null {
  if (!data || typeof data !== 'object') return null;
  const result = data as Record<string, unknown>;
  if (!Array.isArray(result.coordinates) || result.coordinates.length < 2) return null;
  const coordinates: [number, number][] = [];
  for (const pair of result.coordinates) {
    // Backend geometry uses [longitude, latitude]. Reject broken geometry
    // rather than joining across invalid points with a misleading straight line.
    if (!Array.isArray(pair) || pair.length < 2 || !validPoint(pair[1], pair[0])) return null;
    coordinates.push([pair[0], pair[1]]);
  }
  const distanceMeters = readMetric(result.distanceMeters);
  const durationSeconds = readMetric(result.durationSeconds);
  if (distanceMeters === null || durationSeconds === null) return null;
  return { coordinates, distanceMeters, durationSeconds };
}

export function useDrivingRoute(options: UseDrivingRouteOptions = {}) {
  const {
    rideId, origin, destination, currentLocation,
    rideStatus = 'IN_PROGRESS', enabled = true,
  } = options;
  const [route, setRoute] = useState<RideRoute | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(false);
  const lastLoggedRef = useRef<string | null>(null);
  const latestOriginRef = useRef<RouteCoordinate | null>(null);

  const originLat = origin?.latitude;
  const originLng = origin?.longitude;
  const destLat = destination?.latitude;
  const destLng = destination?.longitude;
  const currLat = currentLocation?.latitude;
  const currLng = currentLocation?.longitude;

  const originValid = validPoint(originLat, originLng);

  useEffect(() => {
    latestOriginRef.current = originValid
      ? { latitude: originLat!, longitude: originLng! } : null;
  }, [originValid, originLat, originLng]);

  useEffect(() => {
    let cancelled = false;
    let poll: ReturnType<typeof setTimeout> | undefined;
    let requestTimeout: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | null = null;
    let previousOrigin: RouteCoordinate | null = null;
    let retry = true;
    let hasRoute = false;
    setRoute(null);
    setErrorMessage(undefined);
    setIsLoading(false);
    if (!enabled || !originValid || destLat == null || destLng == null) return;
    if (!validPoint(destLat, destLng)) {
      setErrorMessage('The ride has invalid routing coordinates.');
      return;
    }
    const destinationLatitude = destLat;
    const destinationLongitude = destLng;

    async function refresh() {
      if (cancelled) return;
      const point = latestOriginRef.current;
      if (!point) return;
      // Coordinate changes update a ref instead of cancelling a running request.
      // Skip stationary refreshes after a successful result; failed requests retry.
      const moved = !previousOrigin || Math.hypot(
        (point.latitude - previousOrigin.latitude) * 111320,
        (point.longitude - previousOrigin.longitude) * 111320 *
          Math.cos(point.latitude * Math.PI / 180),
      ) >= 15;
      if (!retry && !moved) {
        poll = setTimeout(() => void refresh(), 10000);
        return;
      }
      controller = new AbortController();
      const requestController = controller;
      let timedOut = false;
      setIsLoading(true);
      try {
        const query = new URLSearchParams({
          originLatitude: String(point.latitude),
          originLongitude: String(point.longitude),
          destinationLatitude: String(destinationLatitude),
          destinationLongitude: String(destinationLongitude),
        });
        const request = (async () => {
          const response = await driverFetch(`/routing/driving?${query.toString()}`, {
            method: 'GET', headers: { Accept: 'application/json' },
            signal: requestController.signal,
          });
          if (!response.ok) {
            throw new Error(response.status === 401 || response.status === 403
              ? 'Road routing access was denied. Check your Driver sign-in.'
              : `Road routing failed (HTTP ${response.status}).`);
          }
          const nextRoute = parseRoadRoute(await response.json());
          if (!nextRoute) throw new Error('The server returned an invalid road route.');
          return nextRoute;
        })();
        const timeout = new Promise<never>((_, reject) => {
          requestTimeout = setTimeout(() => {
            timedOut = true;
            reject(new Error('Road routing timed out.'));
            requestController.abort();
          }, 20000);
        });
        const nextRoute = await Promise.race([request, timeout]);
        if (cancelled) return;
        setRoute(nextRoute);
        setErrorMessage(undefined);
        previousOrigin = point;
        hasRoute = true;
        retry = false;
      } catch (error) {
        if (cancelled) return;
        retry = true;
        // Only show fixed app messages and HTTP status, never raw server bodies.
        const message = timedOut ? 'Road routing timed out.'
          : error instanceof Error && (
              error.message === 'Road routing access was denied. Check your Driver sign-in.' ||
              error.message === 'The server returned an invalid road route.' ||
              /^Road routing failed \(HTTP \d{3}\)\.$/.test(error.message)
            ) ? error.message : 'Could not load the road route. Check your connection.';
        setErrorMessage(`${message} ${hasRoute ? 'Showing the last road route. ' : ''}Retrying shortly.`);
      } finally {
        if (requestTimeout !== undefined) clearTimeout(requestTimeout);
        if (!cancelled) {
          setIsLoading(false);
          poll = setTimeout(() => void refresh(), 10000);
        }
      }
    }
    void refresh();
    return () => {
      cancelled = true;
      if (poll !== undefined) clearTimeout(poll);
      if (requestTimeout !== undefined) clearTimeout(requestTimeout);
      controller?.abort();
    };
  }, [enabled, rideId, originValid, destLat, destLng]);

  // Retain the existing optional offline telemetry behavior.
  useEffect(() => {
    if (!enabled || !rideId || currLat === undefined || currLng === undefined) {
      lastLoggedRef.current = null;
      return;
    }
    if (!validPoint(currLat, currLng)) return;
    const key = `${rideId}:${rideStatus}:${currLat.toFixed(5)},${currLng.toFixed(5)}`;
    if (lastLoggedRef.current === key) return;
    lastLoggedRef.current = key;
    offlineTelemetryService.enqueuePoint({
      rideId, latitude: currLat, longitude: currLng,
      timestamp: new Date().toISOString(), status: rideStatus,
    });
  }, [enabled, rideId, currLat, currLng, rideStatus]);

  return { route, routeCoordinates: route?.coordinates || [], errorMessage, isLoading };
}
