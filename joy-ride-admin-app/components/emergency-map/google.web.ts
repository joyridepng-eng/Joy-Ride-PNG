export type Position = { lat: number; lng: number };
export type GoogleMap = {
  panTo: (point: Position) => void;
  setZoom: (zoom: number) => void;
  fitBounds: (bounds: GoogleBounds, padding?: number) => void;
};
export type GoogleBounds = { extend: (point: Position) => GoogleBounds };
export type GoogleMarker = HTMLElement & { map: GoogleMap | null };
export type GoogleCircle = { setMap: (map: GoogleMap | null) => void };
export type GoogleLibraries = {
  Map: new (
    element: HTMLElement,
    options: Record<string, unknown>,
  ) => GoogleMap;
  AdvancedMarkerElement: new (options: Record<string, unknown>) => GoogleMarker;
  Circle: new (options: Record<string, unknown>) => GoogleCircle;
  LatLngBounds: new () => GoogleBounds;
  clearListeners: (instance: unknown) => void;
};
type MapsRoot = {
  importLibrary: (name: string) => Promise<unknown>;
  event: { clearInstanceListeners: (instance: unknown) => void };
};
type MapWindow = {
  google?: { maps?: MapsRoot };
  joyrideSafetyMapsReady?: () => void;
  gm_authFailure?: () => void;
};
const validRecord = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("MAP_UNAVAILABLE");
  }
  return value as Record<string, unknown>;
};
let loading: Promise<GoogleLibraries> | null = null;

export function loadGoogleMaps(): Promise<GoogleLibraries> {
  if (loading) return loading;
  loading = (async () => {
    const production = typeof process !== "undefined" &&
      process.env.EXPO_PUBLIC_JOYRIDE_WEB_PRODUCTION === "1";
    const origin = production
      ? process.env.EXPO_PUBLIC_JOYRIDE_WEB_ORIGIN
      : "http://localhost:8081";
    if (
      !origin || window.location.origin !== origin ||
      (production && (
        !origin.startsWith("https://") ||
        process.env.EXPO_PUBLIC_JOYRIDE_WEB_SAFETY_TEST === "1" ||
        Boolean(process.env.EXPO_PUBLIC_JOYRIDE_VARIANT)
      ))
    ) {
      throw new Error("MAP_ORIGIN_REFUSED");
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 15000);
    let key: string;
    try {
      const response = await fetch("/__joyride/maps-config", {
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok) throw new Error("MAP_CONFIG_UNAVAILABLE");
      const value = validRecord(await response.json());
      if (
        (production
          ? value.production !== true || value.safetyTest !== false || value.origin !== origin
          : value.safetyTest !== true || value.production === true) ||
        typeof value.key !== "string" ||
        !/^AIza[0-9A-Za-z_-]{35}$/.test(value.key)
      ) {
        throw new Error("MAP_CONFIG_INVALID");
      }
      key = value.key;
    } finally {
      window.clearTimeout(timer);
    }
    const mapWindow = window as unknown as MapWindow;
    mapWindow.gm_authFailure = () => {
      window.dispatchEvent(new Event("joyride-maps-auth-failure"));
    };
    if (!mapWindow.google?.maps?.importLibrary) {
      await new Promise<void>((resolve, reject) => {
        const script = document.createElement("script");
        const timeout = window.setTimeout(() => fail(), 20000);
        const cleanup = () => {
          window.clearTimeout(timeout);
          delete mapWindow.joyrideSafetyMapsReady;
          script.onerror = null;
          window.removeEventListener("joyride-maps-auth-failure", fail);
        };
        const fail = () => {
          cleanup();
          script.remove();
          reject(new Error("MAP_LOAD_FAILED"));
        };
        mapWindow.joyrideSafetyMapsReady = () => {
          cleanup();
          resolve();
        };
        window.addEventListener("joyride-maps-auth-failure", fail);
        const url = new URL("https://maps.googleapis.com/maps/api/js");
        url.searchParams.set("key", key);
        url.searchParams.set("v", "weekly");
        url.searchParams.set("loading", "async");
        url.searchParams.set("callback", "joyrideSafetyMapsReady");
        url.searchParams.set("auth_referrer_policy", "origin");
        script.src = url.toString();
        script.async = true;
        script.referrerPolicy = "strict-origin-when-cross-origin";
        script.onerror = fail;
        document.head.appendChild(script);
      });
    }
    const maps = mapWindow.google?.maps;
    if (!maps?.importLibrary) throw new Error("MAP_LIBRARY_UNAVAILABLE");
    const [mapValue, markerValue, coreValue] = await Promise.all([
      maps.importLibrary("maps"),
      maps.importLibrary("marker"),
      maps.importLibrary("core"),
    ]);
    const map = validRecord(mapValue);
    const marker = validRecord(markerValue);
    const core = validRecord(coreValue);
    if (
      typeof map.Map !== "function" ||
      typeof map.Circle !== "function" ||
      typeof marker.AdvancedMarkerElement !== "function" ||
      typeof core.LatLngBounds !== "function" ||
      typeof maps.event?.clearInstanceListeners !== "function"
    ) {
      throw new Error("MAP_LIBRARY_INVALID");
    }
    return {
      Map: map.Map as GoogleLibraries["Map"],
      Circle: map.Circle as GoogleLibraries["Circle"],
      AdvancedMarkerElement:
        marker.AdvancedMarkerElement as GoogleLibraries["AdvancedMarkerElement"],
      LatLngBounds: core.LatLngBounds as GoogleLibraries["LatLngBounds"],
      clearListeners: (instance) => maps.event.clearInstanceListeners(instance),
    };
  })();
  return loading;
}
