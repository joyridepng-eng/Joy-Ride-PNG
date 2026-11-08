import {
  pointAge,
  type LatestDriverLocation,
  type MapPoint,
} from "@/services/emergency-map-core";
import type { Position } from "./google.web";

export function mapPosition(point: MapPoint): Position {
  if (
    !Number.isFinite(point.latitude) ||
    !Number.isFinite(point.longitude) ||
    Math.abs(point.latitude) > 90 ||
    Math.abs(point.longitude) > 180
  ) {
    throw new Error("INVALID_MAP_POINT");
  }
  return { lat: point.latitude, lng: point.longitude };
}
export function gpsIsUncertain(
  point: LatestDriverLocation,
  refreshFailed: boolean,
  now = Date.now(),
): boolean {
  return (
    refreshFailed || point.driverOnline === false || pointAge(point, now).stale
  );
}
export function carContent(title: string, color: string): HTMLElement {
  const car = document.createElement("div");
  car.textContent = "🚗";
  car.title = title;
  car.setAttribute("aria-label", title);
  car.style.cssText = `background:${color};border:3px solid white;border-radius:50%;padding:7px;font-size:26px;box-shadow:0 2px 6px #333;`;
  return car;
}
