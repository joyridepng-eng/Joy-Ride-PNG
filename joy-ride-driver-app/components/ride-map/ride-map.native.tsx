import { useDrivingRoute } from "@/hooks/use-driving-route";
import LiveVehicleMarker from "@/components/live-vehicle-marker";
import MapView, {
  Circle,
  Marker,
  Polyline,
  PROVIDER_GOOGLE,
  type LatLng,
} from "react-native-maps";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { RideMapPoint, RideMapProps } from "./ride-map.types";

const DEFAULT_REGION = {
  latitude: -9.4438,
  longitude: 147.1803,
  latitudeDelta: 0.08,
  longitudeDelta: 0.08,
};

function isValidPoint(
  point: RideMapPoint | null | undefined,
): point is RideMapPoint {
  return (
    point !== null &&
    point !== undefined &&
    Number.isFinite(point.latitude) &&
    Number.isFinite(point.longitude) &&
    Math.abs(point.latitude) <= 90 &&
    Math.abs(point.longitude) <= 180
  );
}

function toLatLng(point: RideMapPoint): LatLng {
  return {
    latitude: point.latitude,
    longitude: point.longitude,
  };
}

function formatDistance(distanceMeters: number): string {
  if (!Number.isFinite(distanceMeters) || distanceMeters < 0) {
    return "--";
  }

  if (distanceMeters < 1000) {
    return `${Math.round(distanceMeters)} m`;
  }

  return `${(distanceMeters / 1000).toFixed(1)} km`;
}

function formatEta(durationSeconds: number): string {
  if (!Number.isFinite(durationSeconds) || durationSeconds < 0) {
    return "--";
  }

  const minutes = Math.max(1, Math.round(durationSeconds / 60));

  if (minutes < 60) {
    return `${minutes} min`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  return remainingMinutes === 0
    ? `${hours} hr`
    : `${hours} hr ${remainingMinutes} min`;
}

// Native pins and a bundled bitmap avoid custom-view/emoji marker snapshots.
function PlaceMarker({
  point,
  kind,
  active,
}: {
  point: RideMapPoint;
  kind: "pickup" | "dropoff";
  active: boolean;
}) {
  return (
    <Marker
      coordinate={toLatLng(point)}
      title={kind === "pickup" ? "Pickup" : "Drop-off"}
      description={point.address || point.label || undefined}
      pinColor={kind === "pickup" ? "#16a34a" : "#dc2626"}
      zIndex={active ? 100 : 10}
    />
  );
}
function DriverMarker({ point }: { point: RideMapPoint }) {
  const heading =
    typeof point.heading === "number" &&
    Number.isFinite(point.heading) &&
    point.heading >= 0 &&
    point.heading < 360
      ? point.heading
      : 0;
  return (
    <LiveVehicleMarker
      coordinate={toLatLng(point)}
      image={require("../../assets/images/joyride-vehicle-top.png")}
      anchor={{ x: 0.5, y: 0.5 }}
      rotation={heading}
      zIndex={200}
      title="Driver"
      description="Live driver position"
      flat
    />
  );
}

export function RideMap({
  driverLocation,
  pickupLocation,
  dropoffLocation,
  activeDestination,
  route,
  routeLoading = false,
  routeError = "",
  navigationMode = "pickup",
}: RideMapProps) {
  const mapRef = useRef<MapView | null>(null);
  const [mapReady, setMapReady] = useState(false);
  // A terminal-to-terminal preview does not need the driver's first GPS fix.
  const {
    route: tripRoute,
    errorMessage: tripRouteError,
    isLoading: tripRouteLoading,
  } = useDrivingRoute({
    origin: pickupLocation,
    destination: dropoffLocation,
    enabled: isValidPoint(pickupLocation) && isValidPoint(dropoffLocation),
  });
  const tripCoordinates = useMemo<LatLng[]>(
    () =>
      tripRoute?.coordinates.map(([longitude, latitude]) => ({
        latitude,
        longitude,
      })) ?? [],
    [tripRoute],
  );

  const routeCoordinates = useMemo<LatLng[]>(() => {
    if (!route?.coordinates?.length) {
      return [];
    }

    return route.coordinates
      .map(([longitude, latitude]) => ({
        latitude,
        longitude,
      }))
      .filter(
        (coordinate) =>
          Number.isFinite(coordinate.latitude) &&
          Number.isFinite(coordinate.longitude),
      );
  }, [route]);

  const importantCoordinates = useMemo<LatLng[]>(() => {
    const coordinates: LatLng[] = [];

    if (isValidPoint(driverLocation)) {
      coordinates.push(toLatLng(driverLocation));
    }

    if (isValidPoint(pickupLocation)) {
      coordinates.push(toLatLng(pickupLocation));
    }

    if (isValidPoint(dropoffLocation)) {
      coordinates.push(toLatLng(dropoffLocation));
    }

    if (
      isValidPoint(activeDestination) &&
      !coordinates.some(
        (coordinate) =>
          coordinate.latitude === activeDestination.latitude &&
          coordinate.longitude === activeDestination.longitude,
      )
    ) {
      coordinates.push(toLatLng(activeDestination));
    }

    if (routeCoordinates.length > 0) {
      coordinates.push(...routeCoordinates);
    }

    coordinates.push(...tripCoordinates);
    return coordinates;
  }, [
    driverLocation,
    pickupLocation,
    dropoffLocation,
    activeDestination,
    routeCoordinates,
    tripCoordinates,
  ]);

  const fitEntireTrip = useCallback(() => {
    if (!mapRef.current || importantCoordinates.length === 0) {
      return;
    }

    if (importantCoordinates.length === 1) {
      mapRef.current.animateCamera(
        {
          center: importantCoordinates[0],
          zoom: 16,
        },
        {
          duration: 600,
        },
      );
      return;
    }

    mapRef.current.fitToCoordinates(importantCoordinates, {
      edgePadding: {
        top: 105,
        right: 45,
        bottom: 120,
        left: 45,
      },
      animated: true,
    });
  }, [importantCoordinates]);

  const recenterOnDriver = useCallback(() => {
    const target = isValidPoint(driverLocation)
      ? driverLocation
      : isValidPoint(activeDestination)
        ? activeDestination
        : isValidPoint(pickupLocation)
          ? pickupLocation
          : isValidPoint(dropoffLocation)
            ? dropoffLocation
            : null;

    if (!target || !mapRef.current) {
      return;
    }

    const heading =
      target.heading !== null &&
      target.heading !== undefined &&
      Number.isFinite(target.heading) &&
      target.heading >= 0
        ? target.heading
        : 0;

    mapRef.current.animateCamera(
      {
        center: toLatLng(target),
        zoom: 16.5,
        heading,
        pitch: 20,
      },
      {
        duration: 650,
      },
    );
  }, [driverLocation, activeDestination, pickupLocation, dropoffLocation]);

  const fitTripRef = useRef(fitEntireTrip);
  useEffect(() => {
    fitTripRef.current = fitEntireTrip;
  }, [fitEntireTrip]);

  const hasRoadRoute = routeCoordinates.length >= 2;
  const hasDriverPosition = isValidPoint(driverLocation);
  const hasTripRoute = tripCoordinates.length >= 2;
  const destinationLat = activeDestination?.latitude;
  const destinationLng = activeDestination?.longitude;

  // Fit when the trip target changes or first data arrives, not on every fix.
  useEffect(() => {
    if (!mapReady) return;
    const timeout = setTimeout(() => fitTripRef.current(), 300);
    return () => clearTimeout(timeout);
  }, [
    mapReady,
    navigationMode,
    destinationLat,
    destinationLng,
    hasRoadRoute,
    hasDriverPosition,
    hasTripRoute,
  ]);

  const poorAccuracy =
    isValidPoint(driverLocation) &&
    driverLocation.accuracy !== null &&
    driverLocation.accuracy !== undefined &&
    Number.isFinite(driverLocation.accuracy) &&
    driverLocation.accuracy > 30;

  const routeStrokeColor = "#2563eb";

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={styles.map}
        initialRegion={DEFAULT_REGION}
        mapType="standard"
        showsCompass
        showsBuildings
        showsIndoors
        showsTraffic={false}
        toolbarEnabled={false}
        rotateEnabled
        pitchEnabled
        zoomEnabled
        scrollEnabled
        loadingEnabled
        onMapReady={() => {
          setMapReady(true);
        }}
        onLayout={() => {
          if (mapReady) {
            fitEntireTrip();
          }
        }}
      >
        {isValidPoint(driverLocation) &&
        driverLocation.accuracy !== null &&
        driverLocation.accuracy !== undefined &&
        Number.isFinite(driverLocation.accuracy) &&
        driverLocation.accuracy > 0 ? (
          <Circle
            center={toLatLng(driverLocation)}
            radius={driverLocation.accuracy}
            strokeWidth={2}
            strokeColor={
              poorAccuracy ? "rgba(234,88,12,0.9)" : "rgba(37,99,235,0.65)"
            }
            fillColor={
              poorAccuracy ? "rgba(251,146,60,0.16)" : "rgba(59,130,246,0.10)"
            }
          />
        ) : null}

        {tripCoordinates.length >= 2 ? (
          <Polyline
            coordinates={tripCoordinates}
            strokeWidth={4}
            strokeColor="#60a5fa"
            lineCap="round"
            lineJoin="round"
            zIndex={1}
          />
        ) : null}

        {routeCoordinates.length >= 2 ? (
          <Polyline
            coordinates={routeCoordinates}
            strokeWidth={6}
            zIndex={2}
            strokeColor={routeStrokeColor}
            lineCap="round"
            lineJoin="round"
          />
        ) : null}

        {isValidPoint(pickupLocation) ? (
          <PlaceMarker
            point={pickupLocation}
            kind="pickup"
            active={navigationMode !== "dropoff"}
          />
        ) : null}

        {isValidPoint(dropoffLocation) ? (
          <PlaceMarker
            point={dropoffLocation}
            kind="dropoff"
            active={navigationMode === "dropoff"}
          />
        ) : null}

        {isValidPoint(driverLocation) ? (
          <DriverMarker point={driverLocation} />
        ) : null}
      </MapView>

      <View pointerEvents="none" style={styles.navigationCard}>
        <Text style={styles.navigationTitle}>
          {navigationMode === "dropoff" ? "Go to drop-off" : "Go to pickup"}
        </Text>
        {!hasDriverPosition ? (
          <Text style={styles.loadingText}>
            Waiting for GPS. Check location is on.
          </Text>
        ) : null}
        {tripRouteError ? (
          <Text style={styles.errorText}>{tripRouteError}</Text>
        ) : null}
        {tripRouteLoading && !tripRoute ? (
          <Text style={styles.loadingText}>Loading trip route...</Text>
        ) : null}

        {!route && !routeLoading && !routeError && hasDriverPosition ? (
          <Text style={styles.loadingText}>Waiting for route...</Text>
        ) : null}

        {route ? (
          <View style={styles.routeSummaryRow}>
            <View style={styles.routeSummaryItem}>
              <Text style={styles.routeSummaryLabel}>Remaining</Text>
              <Text style={styles.routeSummaryValue}>
                {formatDistance(route.distanceMeters)}
              </Text>
            </View>

            <View style={styles.routeSummaryDivider} />

            <View style={styles.routeSummaryItem}>
              <Text style={styles.routeSummaryLabel}>ETA</Text>
              <Text style={styles.routeSummaryValue}>
                {formatEta(route.durationSeconds)}
              </Text>
            </View>
          </View>
        ) : null}

        {routeLoading ? (
          <Text style={styles.loadingText}>Updating road route...</Text>
        ) : null}

        {routeError ? <Text style={styles.errorText}>{routeError}</Text> : null}

        {poorAccuracy ? (
          <Text style={styles.accuracyWarning}>
            GPS signal is weak. Your position may be inaccurate.
          </Text>
        ) : null}
      </View>

      <View style={styles.controls}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Recenter map on driver"
          style={styles.controlButton}
          onPress={recenterOnDriver}
        >
          <Text style={styles.controlButtonIcon}>◎</Text>
          <Text style={styles.controlButtonText}>Recenter</Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Show full trip route"
          style={styles.controlButton}
          onPress={fitEntireTrip}
        >
          <Text style={styles.controlButtonIcon}>⌖</Text>
          <Text style={styles.controlButtonText}>Fit Trip</Text>
        </Pressable>
      </View>

      <View pointerEvents="none" style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, styles.legendPickup]} />
          <Text style={styles.legendText}>Pickup</Text>
        </View>

        <View style={styles.legendItem}>
          <View style={[styles.legendDot, styles.legendDriver]} />
          <Text style={styles.legendText}>Driver</Text>
        </View>

        <View style={styles.legendItem}>
          <View style={[styles.legendDot, styles.legendDropoff]} />
          <Text style={styles.legendText}>Drop-off</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 620,
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: "#e2e8f0",
    position: "relative",
  },

  map: {
    ...StyleSheet.absoluteFillObject,
  },

  navigationCard: {
    position: "absolute",
    top: 12,
    left: 12,
    right: 12,
    backgroundColor: "rgba(255,255,255,0.96)",
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },

  navigationTitle: {
    color: "#0f172a",
    fontSize: 17,
    fontWeight: "900",
  },

  navigationSubtitle: {
    marginTop: 3,
    color: "#475569",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
  },

  routeSummaryRow: {
    flexDirection: "row",
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
  },

  routeSummaryItem: {
    flex: 1,
  },

  routeSummaryDivider: {
    width: 1,
    backgroundColor: "#e2e8f0",
    marginHorizontal: 12,
  },

  routeSummaryLabel: {
    color: "#64748b",
    fontSize: 14,
    fontWeight: "800",
    textTransform: "uppercase",
  },

  routeSummaryValue: {
    marginTop: 2,
    color: "#0f172a",
    fontSize: 17,
    fontWeight: "900",
  },

  loadingText: {
    marginTop: 8,
    color: "#1d4ed8",
    fontSize: 14,
    fontWeight: "800",
  },

  errorText: {
    marginTop: 8,
    color: "#b91c1c",
    fontSize: 14,
    lineHeight: 17,
    fontWeight: "700",
  },

  accuracyWarning: {
    marginTop: 8,
    color: "#9a3412",
    fontSize: 14,
    lineHeight: 17,
    fontWeight: "800",
  },

  placeMarkerArea: {
    alignItems: "center",
  },

  placeLabel: {
    borderRadius: 7,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginBottom: 3,
  },

  pickupLabel: {
    backgroundColor: "#15803d",
  },

  dropoffLabel: {
    backgroundColor: "#b91c1c",
  },

  placeLabelText: {
    color: "#ffffff",
    fontSize: 10,
    fontWeight: "900",
  },

  placePin: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: "#ffffff",
  },

  pickupPin: {
    backgroundColor: "#16a34a",
  },

  dropoffPin: {
    backgroundColor: "#dc2626",
  },

  placePinText: {
    color: "#ffffff",
    fontWeight: "900",
    fontSize: 15,
  },

  placePinTip: {
    width: 0,
    height: 0,
    borderLeftWidth: 7,
    borderRightWidth: 7,
    borderTopWidth: 11,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    marginTop: -3,
  },

  pickupPinTip: {
    borderTopColor: "#16a34a",
  },

  dropoffPinTip: {
    borderTopColor: "#dc2626",
  },

  driverMarkerArea: {
    width: 66,
    height: 66,
    alignItems: "center",
    justifyContent: "center",
  },

  driverHalo: {
    position: "absolute",
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: "rgba(37,99,235,0.16)",
    borderWidth: 2,
    borderColor: "rgba(37,99,235,0.45)",
  },

  driverVehicle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#ffffff",
    borderWidth: 3,
    borderColor: "#2563eb",
    alignItems: "center",
    justifyContent: "center",
  },

  driverVehicleIcon: {
    fontSize: 23,
  },

  headingArrowArea: {
    position: "absolute",
    top: -2,
    width: 20,
    height: 34,
    alignItems: "center",
  },

  headingArrow: {
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderBottomWidth: 13,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderBottomColor: "#1d4ed8",
  },

  controls: {
    position: "absolute",
    right: 12,
    bottom: 52,
    gap: 8,
  },

  controlButton: {
    minHeight: 48,
    minWidth: 102,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.96)",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },

  controlButtonIcon: {
    color: "#2563eb",
    fontSize: 18,
    fontWeight: "900",
  },

  controlButtonText: {
    color: "#0f172a",
    fontSize: 14,
    fontWeight: "900",
  },

  legend: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 10,
    flexDirection: "row",
    justifyContent: "center",
    gap: 16,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.92)",
    paddingHorizontal: 12,
    paddingVertical: 7,
  },

  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },

  legendDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },

  legendPickup: {
    backgroundColor: "#16a34a",
  },

  legendDriver: {
    backgroundColor: "#2563eb",
  },

  legendDropoff: {
    backgroundColor: "#dc2626",
  },

  legendText: {
    color: "#334155",
    fontSize: 10,
    fontWeight: "800",
  },

  locationMarkerContainer: {
    alignItems: "center",
    maxWidth: 240,
  },

  secondaryLocationMarker: {
    opacity: 0.68,
  },

  locationTextCard: {
    minWidth: 145,
    maxWidth: 230,
    borderRadius: 9,
    paddingHorizontal: 10,
    paddingVertical: 7,
    marginBottom: 4,
    borderWidth: 2,
    borderColor: "#ffffff",
  },

  pickupTextCard: {
    backgroundColor: "#15803d",
  },

  dropoffTextCard: {
    backgroundColor: "#b91c1c",
  },

  locationTypeText: {
    color: "#ffffff",
    fontSize: 10,
    fontWeight: "900",
  },

  locationNameText: {
    marginTop: 2,
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "900",
  },

  locationAddressText: {
    marginTop: 2,
    color: "#ffffff",
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "700",
  },

  activeLocationPin: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 4,
    borderColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
  },

  inactiveLocationPin: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 3,
    borderColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
  },

  locationPinText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "900",
  },

  locationPinTip: {
    width: 0,
    height: 0,
    borderLeftWidth: 7,
    borderRightWidth: 7,
    borderTopWidth: 11,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    marginTop: -3,
  },
});
