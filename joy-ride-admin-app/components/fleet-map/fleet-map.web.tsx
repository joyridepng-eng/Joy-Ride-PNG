import { createFleetMarkerMotion } from "@/services/fleet-marker-motion";
import type { AdminActiveRide } from "@/services/admin-active-rides";
import type { AdminDrivingRoute } from "@/services/admin-driving-route";
import type { FleetDriverLocation } from "@/services/fleet-locations";
import type * as Leaflet from "leaflet";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import "./leaflet.web.css";

type FleetMapProps = {
  locations: FleetDriverLocation[];
  selectedDriverId: string | null;
  selectedRide: AdminActiveRide | null;
  route: AdminDrivingRoute | null;
  onSelectDriver: (driverId: string) => void;
};

export type FleetMapHandle = {
  showFleet: () => void;
  recenterSelectedDriver: () => void;
  fitSelectedTrip: () => void;
};

type Coordinate = [latitude: number, longitude: number];

const PORT_MORESBY_CENTER: Coordinate = [-9.4438, 147.1803];
const STALE_LOCATION_MS = 60_000;

function isStale(recordedAt: string): boolean {
  const timestamp = new Date(recordedAt).getTime();

  return (
    !Number.isFinite(timestamp) || Date.now() - timestamp > STALE_LOCATION_MS
  );
}

function validCoordinate(
  latitude: number | null | undefined,
  longitude: number | null | undefined,
): latitude is number {
  return (
    latitude !== null &&
    latitude !== undefined &&
    longitude !== null &&
    longitude !== undefined &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude)
  );
}

function getStatus(location: FleetDriverLocation): string {
  if (isStale(location.recordedAt)) {
    return "STALE";
  }

  if (!location.driver.isOnline) {
    return "OFFLINE";
  }

  return location.driver.isAvailable ? "AVAILABLE" : "BUSY";
}

function getStatusColor(location: FleetDriverLocation): string {
  switch (getStatus(location)) {
    case "AVAILABLE":
      return "#16a34a";

    case "BUSY":
      return "#2563eb";

    case "STALE":
      return "#d97706";

    case "OFFLINE":
    default:
      return "#64748b";
  }
}

function createMarkerIcon(
  leaflet: typeof import("leaflet"),
  label: string,
  color: string,
  selected = false,
): Leaflet.DivIcon {
  const size = selected ? 34 : 30;
  const borderColor = selected ? "#facc15" : "#ffffff";
  const borderWidth = selected ? 5 : 3;

  return leaflet.divIcon({
    className: "",
    html: `
      <div
        style="
          width:${size}px;
          height:${size}px;
          display:flex;
          align-items:center;
          justify-content:center;
          color:#ffffff;
          font-family:Arial,sans-serif;
          font-size:12px;
          font-weight:900;
          background:${color};
          border:${borderWidth}px solid ${borderColor};
          border-radius:50%;
          box-sizing:border-box;
          box-shadow:0 3px 8px rgba(15,23,42,0.35);
        "
      >
        ${label}
      </div>
    `,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    tooltipAnchor: [0, -(size / 2)],
  });
}

function createVehicleMarkerIcon(leaflet: typeof import("leaflet"), color: string, selected = false
): Leaflet.DivIcon {
  const size = selected ? 34 : 30;
  const borderColor = selected ? "#facc15" : "#ffffff";
  const borderWidth = selected ? 5 : 3;

  return leaflet.divIcon({
    className: "",
    html: `<div style="box-sizing:border-box;width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;border-radius:50%;background:${color};border:${borderWidth}px solid ${borderColor};box-shadow:0 2px 6px rgba(0,0,0,0.3);"><svg xmlns="http://www.w3.org/2000/svg" width="${size - 8}" height="${size - 8}" viewBox="0 0 32 32" aria-hidden="true" focusable="false" style="display:block;"><path d="M5 9h3v6H5zM24 9h3v6h-3zM5 20h3v6H5zM24 20h3v6h-3z" fill="#172554"/><rect x="7" y="2" width="18" height="28" rx="6" fill="#7DD3FC"/><path d="M10 9h12l-1 6H11zM11 21h10l1 5H10z" fill="${color}"/><path d="M10 5h3M19 5h3M10 28h3M19 28h3" stroke="#fbbf24" stroke-width="2" stroke-linecap="round"/></svg></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    tooltipAnchor: [0, -(size / 2)],
  });
}


function createTooltip(text: string): HTMLSpanElement {
  const element = document.createElement("span");
  element.textContent = text;
  return element;
}

const FleetMap = forwardRef<FleetMapHandle, FleetMapProps>(function FleetMap(
  { locations, selectedDriverId, selectedRide, route, onSelectDriver },
  ref,
) {
  const mapElementRef = useRef<HTMLDivElement | null>(null);
  const leafletRef = useRef<typeof import("leaflet") | null>(null);
  const mapRef = useRef<Leaflet.Map | null>(null);
  const tileLayerRef = useRef<Leaflet.TileLayer | null>(null);
  const driverMarkersRef = useRef<Map<string, Leaflet.Marker>>(new Map());
    const markerMotionRef = useRef(createFleetMarkerMotion());
    const driverAppearanceRef = useRef<Map<string, string>>(new Map());
    const onSelectDriverRef = useRef(onSelectDriver);
    useEffect(() => {
      onSelectDriverRef.current = onSelectDriver;
    }, [onSelectDriver]);

  const tripMarkersRef = useRef<Leaflet.Marker[]>([]);
  const routeLineRef = useRef<Leaflet.Polyline | null>(null);
  const hasInitialFleetFitRef = useRef(false);

  const [mapReady, setMapReady] = useState(false);
  const [loadError, setLoadError] = useState("");

  const selectedLocation = useMemo(
    () =>
      locations.find((location) => location.driverId === selectedDriverId) ??
      null,
    [locations, selectedDriverId],
  );

  const pickupCoordinate = useMemo<Coordinate | null>(() => {
    if (
      !selectedRide ||
      !validCoordinate(
        selectedRide.pickupLatitude,
        selectedRide.pickupLongitude,
      )
    ) {
      return null;
    }

    return [
      selectedRide.pickupLatitude,
      selectedRide.pickupLongitude as number,
    ];
  }, [selectedRide]);

  const dropoffCoordinate = useMemo<Coordinate | null>(() => {
    if (
      !selectedRide ||
      !validCoordinate(
        selectedRide.dropoffLatitude,
        selectedRide.dropoffLongitude,
      )
    ) {
      return null;
    }

    return [
      selectedRide.dropoffLatitude,
      selectedRide.dropoffLongitude as number,
    ];
  }, [selectedRide]);

  const fitCoordinates = useCallback((coordinates: Coordinate[]): void => {
    const map = mapRef.current;
    const leaflet = leafletRef.current;

    if (!map || !leaflet) {
      return;
    }

    if (coordinates.length === 0) {
      map.setView(PORT_MORESBY_CENTER, 12);
      return;
    }

    if (coordinates.length === 1) {
      map.setView(coordinates[0], 15);
      return;
    }

    map.fitBounds(leaflet.latLngBounds(coordinates), {
      padding: [70, 70],
      maxZoom: 16,
    });
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      showFleet() {
        fitCoordinates(
          locations.map((location) => [location.latitude, location.longitude]),
        );
      },

      recenterSelectedDriver() {
        if (!selectedLocation || !mapRef.current) {
          return;
        }

        mapRef.current.setView(
          [selectedLocation.latitude, selectedLocation.longitude],
          16,
        );
      },

      fitSelectedTrip() {
        if (!selectedLocation) {
          return;
        }

        const coordinates: Coordinate[] = [
          [selectedLocation.latitude, selectedLocation.longitude],
        ];

        if (pickupCoordinate) {
          coordinates.push(pickupCoordinate);
        }

        if (dropoffCoordinate) {
          coordinates.push(dropoffCoordinate);
        }

        if (route) {
          coordinates.push(
            ...route.coordinates.map(([longitude, latitude]): Coordinate => [
              latitude,
              longitude,
            ]),
          );
        }

        fitCoordinates(coordinates);
      },
    }),
    [
      dropoffCoordinate,
      fitCoordinates,
      locations,
      pickupCoordinate,
      route,
      selectedLocation,
    ],
  );

  useEffect(() => {
      const markerMotion = markerMotionRef.current;
      const driverAppearance = driverAppearanceRef.current;

    let active = true;
    let initializedMap: Leaflet.Map | null = null;

    const driverMarkers = driverMarkersRef.current;
    const tripMarkers = tripMarkersRef.current;

    void import("leaflet")
      .then((leafletModule) => {
        if (!active || !mapElementRef.current) {
          return;
        }

        const leaflet = (leafletModule.default ??
          leafletModule) as typeof import("leaflet");

        leafletRef.current = leaflet;

        initializedMap = leaflet.map(mapElementRef.current, {
          attributionControl: true,
          zoomControl: true,
        });

        initializedMap.setView(PORT_MORESBY_CENTER, 12);

        tileLayerRef.current = leaflet
          .tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
            attribution:
              '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            maxZoom: 19,
          })
          .addTo(initializedMap);

        mapRef.current = initializedMap;
        setMapReady(true);
        setLoadError("");

        window.setTimeout(() => {
          initializedMap?.invalidateSize();
        }, 0);
      })
      .catch(() => {
        if (active) {
          setLoadError(
            "The OpenStreetMap fleet map could not be loaded. Check the browser connection and try again.",
          );
        }
      });

    return () => {
      active = false;


        markerMotion.clear();
        driverAppearance.clear();
        driverMarkers.clear();

      tripMarkers.length = 0;
      routeLineRef.current = null;
      tileLayerRef.current = null;
      leafletRef.current = null;
      mapRef.current = null;

      initializedMap?.remove();
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const leaflet = leafletRef.current;
    if (!mapReady || !map || !leaflet) return;

    const present = new Set<string>();
    locations.forEach((location) => {
      if (!validCoordinate(location.latitude, location.longitude) ||
          Math.abs(location.latitude) > 90 ||
          Math.abs(location.longitude) > 180 ||
          !Number.isFinite(Date.parse(location.recordedAt))) return;

      present.add(location.driverId);
      const selected = location.driverId === selectedDriverId;
const status = getStatus(location);
      const appearance = JSON.stringify([selected, getStatusColor(location)]);
      let marker = driverMarkersRef.current.get(location.driverId);

      if (!marker) {
        marker = leaflet
        .marker([location.latitude, location.longitude], {
          icon: createVehicleMarkerIcon(leaflet, getStatusColor(location), selected),
          keyboard: true,
          riseOnHover: true,
          title: `${location.driver.fullName} - ${status}`,
        })
        .addTo(map);
        marker.on("click", () => {
          onSelectDriverRef.current(location.driverId);
        });
        driverMarkersRef.current.set(location.driverId, marker);
        driverAppearanceRef.current.set(location.driverId, appearance);
      } else if (driverAppearanceRef.current.get(location.driverId) !== appearance) {
        marker.setIcon(createVehicleMarkerIcon(leaflet, getStatusColor(location), selected));
        driverAppearanceRef.current.set(location.driverId, appearance);
      }

      marker.options.title = `${location.driver.fullName} - ${status}`;
      const element = marker.getElement();
      if (element) element.setAttribute("title", marker.options.title ?? "");

      if (marker.getTooltip()) {
        marker.setTooltipContent(createTooltip(`${location.driver.fullName} - ${status}`));
      } else {
        marker.bindTooltip(
        createTooltip(`${location.driver.fullName} - ${status}`),
        {
          direction: "top",
          opacity: 0.95,
        },
      );
      }

      markerMotionRef.current.move(
        location.driverId,
        marker,
        [location.latitude, location.longitude],
        location.recordedAt,
        !isStale(location.recordedAt),
      );
    });

    driverMarkersRef.current.forEach((marker, driverId) => {
      if (!present.has(driverId)) {
        markerMotionRef.current.remove(driverId);
        driverAppearanceRef.current.delete(driverId);
        marker.removeFrom(map);
        driverMarkersRef.current.delete(driverId);
      }
    });
  }, [locations, mapReady, onSelectDriver, selectedDriverId]);

  useEffect(() => {
    const map = mapRef.current;
    const leaflet = leafletRef.current;

    if (!mapReady || !map || !leaflet) {
      return;
    }

    tripMarkersRef.current.forEach((marker) => {
      marker.removeFrom(map);
    });

    tripMarkersRef.current.length = 0;

    if (pickupCoordinate) {
      const pickupMarker = leaflet
        .marker(pickupCoordinate, {
          icon: createMarkerIcon(leaflet, "P", "#16a34a"),
          keyboard: true,
          title:
            selectedRide?.pickupAddress ||
            selectedRide?.pickupLabel ||
            "Pickup",
        })
        .addTo(map);

      pickupMarker.bindTooltip(
        createTooltip(
          selectedRide?.pickupAddress || selectedRide?.pickupLabel || "Pickup",
        ),
        {
          direction: "top",
        },
      );

      tripMarkersRef.current.push(pickupMarker);
    }

    if (dropoffCoordinate) {
      const dropoffMarker = leaflet
        .marker(dropoffCoordinate, {
          icon: createMarkerIcon(leaflet, "D", "#dc2626"),
          keyboard: true,
          title:
            selectedRide?.dropoffAddress ||
            selectedRide?.dropoffLabel ||
            "Drop-off",
        })
        .addTo(map);

      dropoffMarker.bindTooltip(
        createTooltip(
          selectedRide?.dropoffAddress ||
            selectedRide?.dropoffLabel ||
            "Drop-off",
        ),
        {
          direction: "top",
        },
      );

      tripMarkersRef.current.push(dropoffMarker);
    }
  }, [dropoffCoordinate, mapReady, pickupCoordinate, selectedRide]);

  useEffect(() => {
    const map = mapRef.current;
    const leaflet = leafletRef.current;

    if (routeLineRef.current) {
      routeLineRef.current.remove();
      routeLineRef.current = null;
    }

    if (
      !mapReady ||
      !map ||
      !leaflet ||
      !route ||
      route.coordinates.length < 2
    ) {
      return;
    }

    routeLineRef.current = leaflet
      .polyline(
        route.coordinates.map(([longitude, latitude]): Coordinate => [
          latitude,
          longitude,
        ]),
        {
          color: "#2563eb",
          opacity: 0.9,
          weight: 5,
        },
      )
      .addTo(map);
  }, [mapReady, route]);

  useEffect(() => {
    if (!mapReady || locations.length === 0 || hasInitialFleetFitRef.current) {
      return;
    }

    hasInitialFleetFitRef.current = true;

    fitCoordinates(
      locations.map((location) => [location.latitude, location.longitude]),
    );
  }, [fitCoordinates, locations, mapReady]);

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: 560,
        minHeight: 420,
        overflow: "hidden",
        border: "1px solid #cbd5e1",
        borderRadius: 16,
        backgroundColor: "#e2e8f0",
      }}
    >
      <div
        ref={mapElementRef}
        aria-label="Joy Ride live fleet map"
        style={{
          width: "100%",
          height: "100%",
        }}
      />

      {!mapReady && !loadError ? (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#334155",
            fontWeight: 700,
            backgroundColor: "rgba(248,250,252,0.92)",
          }}
        >
          Loading live fleet map...
        </div>
      ) : null}

      {loadError ? (
        <div
          role="alert"
          style={{
            position: "absolute",
            inset: 20,
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
            color: "#991b1b",
            textAlign: "center",
            fontWeight: 700,
            backgroundColor: "#fee2e2",
            border: "1px solid #fca5a5",
            borderRadius: 12,
          }}
        >
          {loadError}
        </div>
      ) : null}

      <div
        aria-label="Fleet status legend"
        style={{
          position: "absolute",
          left: 14,
          bottom: 28,
          zIndex: 1000,
          display: "flex",
          flexWrap: "wrap",
          gap: 10,
          padding: "8px 10px",
          color: "#0f172a",
          fontSize: 12,
          fontWeight: 700,
          backgroundColor: "rgba(255,255,255,0.94)",
          border: "1px solid #cbd5e1",
          borderRadius: 10,
          boxShadow: "0 4px 12px rgba(15,23,42,0.15)",
        }}
      >
        <span style={{ color: "#16a34a" }}>Available</span>
        <span style={{ color: "#2563eb" }}>Busy</span>
        <span style={{ color: "#64748b" }}>Offline</span>
        <span style={{ color: "#d97706" }}>Stale GPS</span>
        <span style={{ color: "#16a34a" }}>P Pickup</span>
        <span style={{ color: "#dc2626" }}>D Drop-off</span>
      </div>
    </div>
  );
});

export default FleetMap;
