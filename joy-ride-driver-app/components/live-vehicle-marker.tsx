import { useEffect, useRef, useState } from 'react';
import type { ComponentProps } from 'react';
import { Marker } from 'react-native-maps';

type Point = { latitude: number; longitude: number };
export function interpolatePosition(from: Point, to: Point, progress: number): Point {
  const t = Math.max(0, Math.min(1, progress));
  return { latitude: from.latitude + (to.latitude - from.latitude) * t,
    longitude: from.longitude + (to.longitude - from.longitude) * t };
}
function valid(point: Point) {
  return Number.isFinite(point.latitude) && Math.abs(point.latitude) <= 90 &&
    Number.isFinite(point.longitude) && Math.abs(point.longitude) <= 180;
}
export default function LiveVehicleMarker(props: ComponentProps<typeof Marker>) {
  const { latitude, longitude } = props.coordinate;
  const [position, setPosition] = useState<Point>({ latitude, longitude });
  const displayed = useRef(position);
  useEffect(() => {
    const target = { latitude, longitude };
    if (!valid(target)) return;
    const start = displayed.current;
    if (start.latitude === latitude && start.longitude === longitude) return;
    // Snap large corrections rather than animate a fictional long journey.
    if (!valid(start) || Math.abs(start.latitude - latitude) > 0.005 || Math.abs(start.longitude - longitude) > 0.005) {
      displayed.current = target;
      setPosition(target);
      return;
    }
    let frame: number;
    let started: number | null = null;
    let lastFrame = -Infinity;
    const step = (now: number) => {
      if (started === null) started = now;
      const progress = Math.min(1, (now - started) / 1000);
      if (now - lastFrame >= 32 || progress === 1) {
        displayed.current = interpolatePosition(start, target, progress);
        setPosition(displayed.current);
        lastFrame = now;
      }
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [latitude, longitude]);
  return valid(position) ? <Marker {...props} coordinate={position} /> : null;
}
