import LiveVehicleMarker from "../live-vehicle-marker";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import MapView, {
  Marker,
  Polyline,
  PROVIDER_GOOGLE,
  type LatLng,
} from "react-native-maps";

import { useDrivingRoute } from "../../hooks/use-driving-route";
import { useRideDriverLocation } from "../../hooks/use-ride-driver-location";

const PORT_MORESBY_REGION = {
  latitude: -9.4438,
  longitude: 147.1803,
  latitudeDelta: 0.1,
  longitudeDelta: 0.1,
};

const LIVE_TRACKING_STATUSES = new Set([
  "ACCEPTED",
  "DRIVER_ARRIVED",
  "IN_PROGRESS",
]);

export type RiderMapPoint = {
  latitude: number;
  longitude: number;
  label?: string | null;
};

type RiderLiveTripMapProps = {
  rideId: string;
  status: string;
  pickup: RiderMapPoint | null;
  dropoff: RiderMapPoint | null;
  driverAssigned: boolean;
  driverName?: string | null;
  vehicleLabel?: string | null;
  trackingEnabled?: boolean;
};

function formatDistance(distanceMeters: number) {
  if (distanceMeters < 1000) {
    return `${Math.round(distanceMeters)} m`;
  }

  return `${(distanceMeters / 1000).toFixed(1)} km`;
}

function formatDuration(durationSeconds: number) {
  const minutes = Math.max(1, Math.ceil(durationSeconds / 60));

  if (minutes < 60) {
    return `${minutes} min`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  return remainingMinutes
    ? `${hours} hr ${remainingMinutes} min`
    : `${hours} hr`;
}

function formatAccuracy(accuracy: number | null) {
  if (accuracy == null || !Number.isFinite(accuracy)) {
    return "Unknown";
  }

  return `±${Math.round(accuracy)} m`;
}

function formatRecordedAt(recordedAt: string) {
  const value = new Date(recordedAt);

  if (Number.isNaN(value.getTime())) {
    return "Unknown";
  }

  return value.toLocaleTimeString();
}

function getStatusText(status: string) {
  switch (status) {
    case "REQUESTED":
      return "Waiting for a Driver to accept your request.";

    case "ACCEPTED":
      return "Your Driver is heading to the pickup location.";

    case "DRIVER_ARRIVED":
      return "Your Driver has arrived at the pickup location.";

    case "IN_PROGRESS":
      return "Your trip is in progress. Tracking the Driver to drop-off.";

    case "COMPLETED":
      return "This trip has been completed.";

    case "CANCELLED":
      return "This trip has been cancelled.";

    default:
      return "Trip location information is updating.";
  }
}

export function RiderLiveTripMap({
  rideId,
  status,
  pickup,
  dropoff,
  driverAssigned,
  driverName,
  vehicleLabel,
  trackingEnabled = true,
}: RiderLiveTripMapProps) {
  const mapRef = useRef<MapView | null>(null);
  const lastAutoFitKeyRef = useRef("");

  const [mapReady, setMapReady] = useState(false);
  const [followDriver, setFollowDriver] = useState(false);

  const shouldTrackDriver =
    trackingEnabled && driverAssigned && LIVE_TRACKING_STATUSES.has(status);

  const {
    location: driverLocation,
    isLoading: isDriverLocationLoading,
    error: driverLocationError,
  } = useRideDriverLocation({
    rideId,
    enabled: shouldTrackDriver,
    pollIntervalMs: 2000,
  });

  const driverLatitude = driverLocation?.latitude;
  const driverLongitude = driverLocation?.longitude;

  const driverCoordinate = useMemo<LatLng | null>(
    () =>
      driverLatitude != null && driverLongitude != null
        ? {
            latitude: driverLatitude,
            longitude: driverLongitude,
          }
        : null,
    [driverLatitude, driverLongitude],
  );

  const activeDestination =
    status === "ACCEPTED" ? pickup : status === "IN_PROGRESS" ? dropoff : null;

  const shouldLoadRoadRoute =
    shouldTrackDriver &&
    driverCoordinate != null &&
    activeDestination != null &&
    (status === "ACCEPTED" || status === "IN_PROGRESS");

  const {
    route,
    isLoading: isRouteLoading,
    error: routeError,
  } = useDrivingRoute({
    origin: driverCoordinate,
    destination: activeDestination,
    enabled: shouldLoadRoadRoute,
    refreshIntervalMs: 15000,
  });

  const moveToDriver = useCallback(() => {
    if (!driverCoordinate) {
      return;
    }

    mapRef.current?.animateCamera(
      {
        center: driverCoordinate,
        zoom: 16,
        heading: driverLocation?.heading ?? 0,
      },
      {
        duration: 650,
      },
    );
  }, [driverCoordinate, driverLocation?.heading]);

  const fitCoordinates = useCallback(
    (
      coordinates: LatLng[],
      edgePadding = {
        top: 70,
        right: 55,
        bottom: 70,
        left: 55,
      },
    ) => {
      if (!mapReady || coordinates.length === 0) {
        return;
      }

      if (coordinates.length === 1) {
        mapRef.current?.animateToRegion(
          {
            ...coordinates[0],
            latitudeDelta: 0.015,
            longitudeDelta: 0.015,
          },
          600,
        );

        return;
      }

      mapRef.current?.fitToCoordinates(coordinates, {
        edgePadding,
        animated: true,
      });
    },
    [mapReady],
  );

  const fitTrip = useCallback(() => {
    const coordinates: LatLng[] = [];

    if (driverCoordinate) {
      coordinates.push(driverCoordinate);
    }

    if (pickup) {
      coordinates.push(pickup);
    }

    if (dropoff) {
      coordinates.push(dropoff);
    }

    fitCoordinates(coordinates);
  }, [driverCoordinate, dropoff, fitCoordinates, pickup]);

  const fitActiveRoute = useCallback(() => {
    if (route?.coordinates.length) {
      fitCoordinates(route.coordinates, {
        top: 70,
        right: 55,
        bottom: 70,
        left: 55,
      });

      return;
    }

    const coordinates: LatLng[] = [];

    if (driverCoordinate) {
      coordinates.push(driverCoordinate);
    }

    if (activeDestination) {
      coordinates.push(activeDestination);
    }

    if (coordinates.length === 0) {
      if (pickup) {
        coordinates.push(pickup);
      }

      if (dropoff) {
        coordinates.push(dropoff);
      }
    }

    fitCoordinates(coordinates);
  }, [
    activeDestination,
    driverCoordinate,
    dropoff,
    fitCoordinates,
    pickup,
    route?.coordinates,
  ]);

  useEffect(() => {
    if (!followDriver || !mapReady || !driverCoordinate) {
      return;
    }

    moveToDriver();
  }, [driverCoordinate, followDriver, mapReady, moveToDriver]);

  const autoFitKey = [
    status,
    driverCoordinate ? "driver" : "no-driver",
    route?.coordinates.length ? "route" : "no-route",
    pickup ? `${pickup.latitude}:${pickup.longitude}` : "no-pickup",
    dropoff ? `${dropoff.latitude}:${dropoff.longitude}` : "no-dropoff",
  ].join("|");

  useEffect(() => {
    if (!mapReady) {
      return;
    }

    if (lastAutoFitKeyRef.current === autoFitKey) {
      return;
    }

    lastAutoFitKeyRef.current = autoFitKey;

    fitActiveRoute();
  }, [autoFitKey, fitActiveRoute, mapReady]);

  const gpsLabel = !driverAssigned
    ? "Waiting for Driver"
    : !shouldTrackDriver
      ? "Tracking inactive"
      : !driverLocation
        ? "Waiting for Driver GPS"
        : driverLocation.isFresh
          ? "Live GPS"
          : "GPS stale";

  const gpsBadgeStyle = driverLocation?.isFresh
    ? styles.gpsBadgeLive
    : styles.gpsBadgeWaiting;

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View style={styles.headerTextContainer}>
          <Text style={styles.title}>Live Map</Text>

          <Text style={styles.subtitle}>{getStatusText(status)}</Text>
        </View>

        <View style={[styles.gpsBadge, gpsBadgeStyle]}>
          <Text style={styles.gpsBadgeText}>{gpsLabel}</Text>
        </View>
      </View>

      <View style={styles.mapContainer}>
        <MapView
          ref={mapRef}
          provider={PROVIDER_GOOGLE}
          style={styles.map}
          initialRegion={PORT_MORESBY_REGION}
          mapType="standard"
          showsCompass
          showsBuildings
          onMapReady={() => {
            setMapReady(true);
          }}
          onPanDrag={() => {
            if (followDriver) {
              setFollowDriver(false);
            }
          }}
        >
          {pickup ? (
            <Marker
              coordinate={pickup}
              pinColor="#16a34a"
              title="PICKUP"
              description={pickup.label ?? "Pickup location"}
            />
          ) : null}

          {dropoff ? (
            <Marker
              coordinate={dropoff}
              pinColor="#dc2626"
              title="DROP-OFF"
              description={dropoff.label ?? "Drop-off location"}
            />
          ) : null}

          {route?.coordinates.length ? (
            <Polyline
              coordinates={route.coordinates}
              strokeWidth={5}
              strokeColor="#2563eb"
              lineCap="round"
              lineJoin="round"
            />
          ) : null}

          {driverCoordinate ? (
            <LiveVehicleMarker
              key={rideId + ":" + driverLocation?.driverId}
              coordinate={driverCoordinate}
              anchor={{
                x: 0.5,
                y: 0.5,
              }}
              rotation={driverLocation?.heading ?? 0}
              flat
              title={driverName ? `${driverName}'s vehicle` : "Your Driver"}
              description={vehicleLabel ?? "Assigned Joy Ride vehicle"}
            >
              <View style={styles.vehicleMarker}>
                <Text style={styles.vehicleMarkerText}>🚙</Text>
              </View>
            </LiveVehicleMarker>
          ) : null}
        </MapView>

        {isDriverLocationLoading || isRouteLoading ? (
          <View style={styles.loadingBadge}>
            <ActivityIndicator size="small" color="#ffffff" />

            <Text style={styles.loadingBadgeText}>Updating live trip...</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.metricsRow}>
        <View style={styles.metric}>
          <Text style={styles.metricLabel}>Distance</Text>

          <Text style={styles.metricValue}>
            {route ? formatDistance(route.distanceMeters) : "—"}
          </Text>
        </View>

        <View style={styles.metricDivider} />

        <View style={styles.metric}>
          <Text style={styles.metricLabel}>ETA</Text>

          <Text style={styles.metricValue}>
            {route ? formatDuration(route.durationSeconds) : "—"}
          </Text>
        </View>

        <View style={styles.metricDivider} />

        <View style={styles.metric}>
          <Text style={styles.metricLabel}>Accuracy</Text>

          <Text style={styles.metricValue}>
            {driverLocation ? formatAccuracy(driverLocation.accuracy) : "—"}
          </Text>
        </View>
      </View>

      {driverLocation ? (
        <View style={styles.gpsDetails}>
          <Text style={styles.gpsDetailsText}>
            GPS updated: {formatRecordedAt(driverLocation.recordedAt)}
          </Text>

          <Text style={styles.gpsDetailsText}>
            {driverLocation.isFresh
              ? "Driver location is up to date."
              : "Driver location may be out of date."}
          </Text>
        </View>
      ) : driverAssigned && shouldTrackDriver ? (
        <View style={styles.waitingBox}>
          <Text style={styles.waitingText}>
            Waiting for the driver location.
          </Text>
        </View>
      ) : null}

      {vehicleLabel ? (
        <View style={styles.vehicleBox}>
          <Text style={styles.vehicleLabel}>Assigned Vehicle</Text>

          <Text style={styles.vehicleValue}>{vehicleLabel}</Text>
        </View>
      ) : null}

      <View style={styles.controls}>
        <TouchableOpacity
          style={[
            styles.controlButton,
            followDriver ? styles.controlButtonActive : null,
          ]}
          onPress={() => {
            if (!driverCoordinate) {
              return;
            }

            const nextValue = !followDriver;

            setFollowDriver(nextValue);

            if (nextValue) {
              moveToDriver();
            }
          }}
          disabled={!driverCoordinate}
        >
          <Text
            style={[
              styles.controlButtonText,
              !driverCoordinate ? styles.controlButtonTextDisabled : null,
            ]}
          >
            {followDriver ? "Following Driver" : "Follow Driver"}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.controlButton}
          onPress={() => {
            if (!driverCoordinate) {
              return;
            }

            setFollowDriver(false);
            moveToDriver();
          }}
          disabled={!driverCoordinate}
        >
          <Text
            style={[
              styles.controlButtonText,
              !driverCoordinate ? styles.controlButtonTextDisabled : null,
            ]}
          >
            Recenter Driver
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.controlButton}
          onPress={() => {
            setFollowDriver(false);
            fitTrip();
          }}
          disabled={!pickup && !dropoff}
        >
          <Text
            style={[
              styles.controlButtonText,
              !pickup && !dropoff ? styles.controlButtonTextDisabled : null,
            ]}
          >
            Fit Trip
          </Text>
        </TouchableOpacity>
      </View>

      {routeError ? (
        <Text style={styles.warningText}>
          Road route is temporarily unavailable. Live Driver GPS can still
          continue updating.
        </Text>
      ) : null}

      {driverLocationError ? (
        <Text style={styles.warningText}>
          Live Driver GPS is temporarily unavailable.
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 16,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#dbeafe",
    borderRadius: 20,
    padding: 8,
  },

  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 12,
  },

  headerTextContainer: {
    flex: 1,
  },

  title: {
    color: "#0f172a",
    fontSize: 19,
    fontWeight: "900",
  },

  subtitle: {
    marginTop: 4,
    color: "#64748b",
    fontSize: 13,
    lineHeight: 18,
  },

  gpsBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },

  gpsBadgeLive: {
    backgroundColor: "#dcfce7",
  },

  gpsBadgeWaiting: {
    backgroundColor: "#e2e8f0",
  },

  gpsBadgeText: {
    color: "#0f172a",
    fontSize: 14,
    fontWeight: "900",
  },

  mapContainer: {
    height: 500,
    overflow: "hidden",
    borderRadius: 16,
    backgroundColor: "#e2e8f0",
  },

  map: {
    flex: 1,
  },

  vehicleMarker: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 21,
    borderWidth: 3,
    borderColor: "#ffffff",
    backgroundColor: "#2563eb",
  },

  vehicleMarkerText: {
    fontSize: 22,
  },

  loadingBadge: {
    position: "absolute",
    top: 10,
    left: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: "rgba(15, 23, 42, 0.82)",
  },

  loadingBadgeText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "800",
  },

  metricsRow: {
    flexDirection: "row",
    alignItems: "stretch",
    marginTop: 12,
    borderRadius: 14,
    backgroundColor: "#f8fafc",
    paddingVertical: 11,
  },

  metric: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: 5,
  },

  metricDivider: {
    width: 1,
    backgroundColor: "#e2e8f0",
  },

  metricLabel: {
    color: "#64748b",
    fontSize: 14,
    fontWeight: "700",
  },

  metricValue: {
    marginTop: 4,
    color: "#0f172a",
    fontSize: 15,
    fontWeight: "900",
  },

  gpsDetails: {
    marginTop: 10,
    borderRadius: 12,
    padding: 10,
    backgroundColor: "#f8fafc",
  },

  gpsDetailsText: {
    color: "#475569",
    fontSize: 14,
    lineHeight: 18,
  },

  waitingBox: {
    marginTop: 10,
    borderRadius: 12,
    padding: 10,
    backgroundColor: "#eff6ff",
  },

  waitingText: {
    color: "#1d4ed8",
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 18,
  },

  vehicleBox: {
    marginTop: 10,
    borderRadius: 12,
    padding: 10,
    backgroundColor: "#eff6ff",
  },

  vehicleLabel: {
    color: "#64748b",
    fontSize: 11,
    fontWeight: "700",
  },

  vehicleValue: {
    marginTop: 3,
    color: "#0f172a",
    fontSize: 14,
    fontWeight: "900",
  },

  controls: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
  },

  controlButton: {
    flex: 1,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#bfdbfe",
    borderRadius: 11,
    paddingHorizontal: 5,
    paddingVertical: 8,
    backgroundColor: "#eff6ff",
  },

  controlButtonActive: {
    borderColor: "#2563eb",
    backgroundColor: "#dbeafe",
  },

  controlButtonText: {
    color: "#1d4ed8",
    fontSize: 14,
    fontWeight: "900",
    textAlign: "center",
  },

  controlButtonTextDisabled: {
    color: "#94a3b8",
  },

  warningText: {
    marginTop: 10,
    color: "#b45309",
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 17,
  },
});

export default RiderLiveTripMap;
