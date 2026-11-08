import { useEffect, useRef, useState } from 'react';

export interface TelemetryPoint {
  latitude: number;
  longitude: number;
  heading?: number;
  timestamp?: string;
}

interface InterpolatedPosition {
  latitude: number;
  longitude: number;
  heading: number;
}

function calculateHeading(startLat: number, startLng: number, endLat: number, endLng: number): number {
  const dLng = (endLng - startLng) * (Math.PI / 180);
  const lat1 = startLat * (Math.PI / 180);
  const lat2 = endLat * (Math.PI / 180);

  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  const brng = Math.atan2(y, x) * (180 / Math.PI);

  return (brng + 360) % 360;
}

export function useTelemetryInterpolation(
  rawPoints: TelemetryPoint[],
  durationMs: number = 1000
) {
  const [currentPosition, setCurrentPosition] = useState<InterpolatedPosition | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const lastPointRef = useRef<TelemetryPoint | null>(null);

  useEffect(() => {
    if (!rawPoints || rawPoints.length === 0) return;

    const latestTarget = rawPoints[rawPoints.length - 1];
    const previousPoint = lastPointRef.current || latestTarget;

    if (
      previousPoint.latitude === latestTarget.latitude &&
      previousPoint.longitude === latestTarget.longitude
    ) {
      setCurrentPosition({
        latitude: latestTarget.latitude,
        longitude: latestTarget.longitude,
        heading: latestTarget.heading ?? previousPoint.heading ?? 0,
      });
      return;
    }

    const calculatedHeading = calculateHeading(
      previousPoint.latitude,
      previousPoint.longitude,
      latestTarget.latitude,
      latestTarget.longitude
    );

    const startTime = Date.now();

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / durationMs, 1);

      // Linear interpolation formula: P = P0 + (P1 - P0) * t
      const interpolatedLat =
        previousPoint.latitude + (latestTarget.latitude - previousPoint.latitude) * progress;
      const interpolatedLng =
        previousPoint.longitude + (latestTarget.longitude - previousPoint.longitude) * progress;

      setCurrentPosition({
        latitude: interpolatedLat,
        longitude: interpolatedLng,
        heading: latestTarget.heading ?? calculatedHeading,
      });

      if (progress < 1) {
        animationFrameRef.current = requestAnimationFrame(animate);
      } else {
        lastPointRef.current = latestTarget;
      }
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [rawPoints, durationMs]);

  return { currentPosition };
}