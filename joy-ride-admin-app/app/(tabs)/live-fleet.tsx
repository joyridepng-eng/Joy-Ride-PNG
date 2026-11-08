import FleetMap, {
  type FleetMapHandle,
} from "@/components/fleet-map/fleet-map";

import {
  type AdminActiveRide,
  loadActiveRides,
} from "@/services/admin-active-rides";

import {
  type AdminDrivingRoute,
  loadAdminDrivingRoute,
} from "@/services/admin-driving-route";

import {
  type FleetDriverLocation,
  loadFleetLocations,
} from "@/services/fleet-locations";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

function gpsDistanceMeters(
  start: { latitude: number; longitude: number },
  end: { latitude: number; longitude: number },
): number | null {
  if (![start.latitude, start.longitude, end.latitude, end.longitude].every(Number.isFinite)
    || Math.abs(start.latitude) > 90 || Math.abs(end.latitude) > 90
    || Math.abs(start.longitude) > 180 || Math.abs(end.longitude) > 180) return null;
  const radians = Math.PI / 180;
  const deltaLat = (end.latitude - start.latitude) * radians;
  const deltaLon = (end.longitude - start.longitude) * radians;
  const a = Math.sin(deltaLat / 2) ** 2
    + Math.cos(start.latitude * radians) * Math.cos(end.latitude * radians)
    * Math.sin(deltaLon / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(Math.min(1, a)), Math.sqrt(Math.max(0, 1 - a)));
}

export default function LiveFleetScreen() {
  const mounted = useRef(false);
  const fleetPending = useRef(false);
  const ridesPending = useRef(false);
  const [rideRefreshMessage, setRideRefreshMessage] = useState("");
  const fleetMapRef = useRef<FleetMapHandle | null>(null);
  const [locations, setLocations] = useState<FleetDriverLocation[]>([]);

  const [activeRides, setActiveRides] = useState<AdminActiveRide[]>([]);

  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);

  const [route, setRoute] = useState<AdminDrivingRoute | null>(null);

  const [routeMessage, setRouteMessage] = useState("");

  const [message, setMessage] = useState("");

  const [isLoading, setIsLoading] = useState(false);
  // Comparison stays on this screen; no coordinates are printed to logs.
  const [gpsBaseline, setGpsBaseline] = useState<{
    driverId: string;
    latitude: number;
    longitude: number;
  } | null>(null);
  const [lastFleetRefreshAt, setLastFleetRefreshAt] = useState<Date | null>(null);


  const selectedLocation = useMemo(
    () => locations.find((item) => item.driverId === selectedDriverId) ?? null,
    [locations, selectedDriverId],
  );

  const gpsDisplacement = selectedLocation && gpsBaseline?.driverId === selectedLocation.driverId
    ? gpsDistanceMeters(gpsBaseline, selectedLocation) : null;

  const selectedRide = useMemo(
    () =>
      activeRides.find((ride) => ride.driver?.id === selectedDriverId) ?? null,
    [activeRides, selectedDriverId],
  );

  async function refreshFleet() {
    if (!mounted.current) return;
    if (!ridesPending.current) {
      ridesPending.current = true;
      void loadActiveRides().then(data => {
        if (mounted.current) { setActiveRides(data); setRideRefreshMessage(""); }
      }).catch(() => {
        if (mounted.current) setRideRefreshMessage("Ride details could not refresh. GPS locations refresh separately.");
      }).finally(() => { ridesPending.current = false; });
    }
    if (fleetPending.current) return;
    fleetPending.current = true;
    setIsLoading(true);
    try {
      const fleetData = await loadFleetLocations();
      if (!mounted.current) return;
      setLocations(fleetData);
      setSelectedDriverId(current =>
        current && !fleetData.some(item => item.driverId === current)
          ? null : current);
      setGpsBaseline(current =>
        current && !fleetData.some(item => item.driverId === current.driverId)
          ? null : current);
      setLastFleetRefreshAt(new Date());
      setMessage("");
    } catch {
      if (mounted.current) setMessage("GPS refresh failed. Displaying the last received positions.");
    } finally {
      fleetPending.current = false;
      if (mounted.current) setIsLoading(false);
    }
  }

  useEffect(() => {
    mounted.current = true;
    void refreshFleet();
    const timer = setInterval(() => void refreshFleet(), 2000);
    return () => { mounted.current = false; clearInterval(timer); };
  }, []);

  const routeDriverId = selectedDriverId;
  const routeRideId = selectedRide?.id;
  const routeRideStatus = selectedRide?.status;
  const originLatitude = selectedLocation?.latitude;
  const originLongitude = selectedLocation?.longitude;
  const destinationLatitude =
    routeRideStatus === "IN_PROGRESS"
      ? selectedRide?.dropoffLatitude
      : selectedRide?.pickupLatitude;
  const destinationLongitude =
    routeRideStatus === "IN_PROGRESS"
      ? selectedRide?.dropoffLongitude
      : selectedRide?.pickupLongitude;


  const latestRouteOriginRef = useRef<{
    latitude: number; longitude: number;
  } | null>(null);
  const routeOriginValid = originLatitude != null &&
    originLongitude != null &&
    Number.isFinite(originLatitude) &&
    Number.isFinite(originLongitude);

  useEffect(() => {
    latestRouteOriginRef.current = routeOriginValid
      ? { latitude: originLatitude!, longitude: originLongitude! }
      : null;
  }, [routeOriginValid, originLatitude, originLongitude]);

useEffect(() => {
    let cancelled = false;
    let poll: ReturnType<typeof setTimeout> | undefined;
    setRoute(null);

    async function refreshSelectedRoute() {
      const point = latestRouteOriginRef.current;
      const originLatitude = point?.latitude;
      const originLongitude = point?.longitude;


      setRouteMessage("");

      if (
        routeDriverId == null ||
        routeRideId == null ||
        originLatitude == null ||
        originLongitude == null
      ) {
        return;
      }

      if (destinationLatitude == null || destinationLongitude == null) {
        setRouteMessage("This ride does not have usable route coordinates.");
        return;
      }

      const origin = {
        latitude: originLatitude,
        longitude: originLongitude,
      };
      const destination = {
        latitude: destinationLatitude,
        longitude: destinationLongitude,
      };

      try {
        const nextRoute = await loadAdminDrivingRoute(origin, destination);
        if (!cancelled) {
          setRoute(nextRoute);
        }
      } catch (error) {
        if (!cancelled) {

          setRouteMessage(
            error instanceof Error
              ? error.message
              : "Could not load the selected route.",
          );
        }
      }
    }

    async function pollRoute() {
      try {
        await refreshSelectedRoute();
      } finally {
        if (!cancelled) {
          poll = setTimeout(() => { void pollRoute(); }, 15000);
        }
      }
    }

    void pollRoute();
    return () => {
      cancelled = true;
      if (poll !== undefined) clearTimeout(poll);
    };
  }, [
        routeDriverId, routeRideId, routeOriginValid,
        destinationLatitude, destinationLongitude,
      ]);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Live Fleet</Text>

      <View style={styles.summaryRow}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryValue}>{locations.length}</Text>

          <Text style={styles.summaryLabel}>Drivers</Text>
        </View>

        <View style={styles.summaryCard}>
          <Text style={styles.summaryValue}>
            {
              locations.filter(
                (item) => item.driver.isOnline && item.driver.isAvailable,
              ).length
            }
          </Text>

          <Text style={styles.summaryLabel}>Available</Text>
        </View>

        <View style={styles.summaryCard}>
          <Text style={styles.summaryValue}>
            {
              locations.filter(
                (item) => item.driver.isOnline && !item.driver.isAvailable,
              ).length
            }
          </Text>

          <Text style={styles.summaryLabel}>Busy</Text>
        </View>
      </View>

      {rideRefreshMessage ? <Text accessibilityRole="alert">{rideRefreshMessage}</Text> : null}
      <FleetMap
        ref={fleetMapRef}
        locations={locations}
        selectedDriverId={selectedDriverId}
        selectedRide={selectedRide}
        route={route}
        onSelectDriver={setSelectedDriverId}
      />

      <View style={styles.mapControlRow}>
        <TouchableOpacity
          style={styles.mapControlButton}
          onPress={() => fleetMapRef.current?.showFleet()}
        >
          <Text style={styles.mapControlButtonText}>Show Fleet</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.mapControlButton,
            !selectedLocation ? styles.mapControlDisabled : null,
          ]}
          onPress={() => fleetMapRef.current?.recenterSelectedDriver()}
          disabled={!selectedLocation}
        >
          <Text style={styles.mapControlButtonText}>Recenter Driver</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.mapControlButton,
            !selectedLocation ? styles.mapControlDisabled : null,
          ]}
          onPress={() => fleetMapRef.current?.fitSelectedTrip()}
          disabled={!selectedLocation}
        >
          <Text style={styles.mapControlButtonText}>Fit Trip</Text>
        </TouchableOpacity>
      </View>

      {selectedLocation ? (
        <View style={styles.selectedCard}>
          <Text style={styles.selectedCardTitle}>Selected Driver</Text>

          <Text style={styles.driverName}>
            {selectedLocation.driver.fullName}
          </Text>

          <Text style={styles.detailText}>
            Status:{" "}
            {selectedLocation.driver.isOnline
              ? selectedLocation.driver.isAvailable
                ? "AVAILABLE"
                : "BUSY"
              : "OFFLINE"}
          </Text>

          <Text style={styles.detailText}>
            GPS accuracy: {selectedLocation.accuracy ?? "Unknown"}m
          </Text>

          <Text style={styles.detailText}>
            Last GPS: {new Date(selectedLocation.recordedAt).toLocaleString()}
          </Text>

          <View style={styles.routeSummary}>
            <Text style={styles.selectedCardTitle}>Saved GPS comparison</Text>
            <Text style={styles.detailText}>
              Latitude: {selectedLocation.latitude.toFixed(6)}
            </Text>
            <Text style={styles.detailText}>
              Longitude: {selectedLocation.longitude.toFixed(6)}
            </Text>
            <Text style={styles.detailText}>
              Fleet refreshed: {lastFleetRefreshAt?.toLocaleTimeString() ?? 'Not yet'}
            </Text>
            {gpsBaseline?.driverId === selectedDriverId ? (
              <>
                <Text style={styles.detailText}>
                  Comparison point: {gpsBaseline.latitude.toFixed(6)}, {gpsBaseline.longitude.toFixed(6)}
                </Text>
                <Text style={styles.detailText}>
                  Displacement: {gpsDisplacement === null ? 'Unavailable' : `${gpsDisplacement.toFixed(1)} metres`}
                </Text>
              </>
            ) : null}
            <Text style={styles.detailText}>
              Displacement compares saved positions. GPS error can also change it.
            </Text>
            <TouchableOpacity
              accessibilityRole="button"
              style={styles.mapControlButton}
              onPress={() => setGpsBaseline({
                driverId: selectedLocation.driverId,
                latitude: selectedLocation.latitude,
                longitude: selectedLocation.longitude,
              })}
            >
              <Text style={styles.mapControlButtonText}>Set comparison point</Text>
            </TouchableOpacity>
          </View>

          {selectedRide ? (
            <>
              <View style={styles.divider} />

              <Text style={styles.selectedCardTitle}>Active Ride</Text>

              <Text style={styles.rideStatus}>{selectedRide.status}</Text>

              {route ? (
                <View style={styles.routeSummary}>
                  <Text style={styles.routeSummaryText}>
                    Route:{" "}
                    {selectedRide.status === "IN_PROGRESS"
                      ? "Driver → Drop-off"
                      : "Driver → Pickup"}
                  </Text>

                  <Text style={styles.routeSummaryText}>
                    Distance: {(route.distanceMeters / 1000).toFixed(1)} km
                  </Text>

                  <Text style={styles.routeSummaryText}>
                    ETA: {Math.max(1, Math.round(route.durationSeconds / 60))}{" "}
                    min
                  </Text>
                </View>
              ) : null}

              {routeMessage ? (
                <Text style={styles.routeWarning}>{routeMessage}</Text>
              ) : null}

              <Text style={styles.detailLabel}>Rider</Text>

              <Text style={styles.detailText}>{selectedRide.riderName}</Text>

              <Text style={styles.detailLabel}>Pickup</Text>

              <Text style={styles.detailText}>
                {selectedRide.pickupLabel || "-"}
              </Text>

              <Text style={styles.detailText}>
                {selectedRide.pickupAddress || "-"}
              </Text>

              <Text style={styles.detailLabel}>Drop-off</Text>

              <Text style={styles.detailText}>
                {selectedRide.dropoffLabel || "-"}
              </Text>

              <Text style={styles.detailText}>
                {selectedRide.dropoffAddress || "-"}
              </Text>

              {selectedRide.vehicle ? (
                <>
                  <Text style={styles.detailLabel}>Vehicle</Text>

                  <Text style={styles.detailText}>
                    {selectedRide.vehicle.color} {selectedRide.vehicle.make}{" "}
                    {selectedRide.vehicle.model}
                  </Text>

                  <Text style={styles.detailText}>
                    Plate: {selectedRide.vehicle.plateNumber}
                  </Text>
                </>
              ) : null}
            </>
          ) : (
            <Text style={styles.noActiveRideText}>
              No active ride assigned.
            </Text>
          )}
        </View>
      ) : null}

      <TouchableOpacity
        style={styles.refreshButton}
        onPress={() => void refreshFleet()}
        disabled={isLoading}
      >
        <Text style={styles.refreshButtonText}>
          {isLoading ? "Refreshing..." : "Refresh Fleet"}
        </Text>
      </TouchableOpacity>

      {isLoading && locations.length === 0 ? (
        <ActivityIndicator size="large" style={styles.loader} />
      ) : null}

      {message ? (
        <View style={styles.messageBox}>
          <Text style={styles.messageText}>{message}</Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    paddingTop: 28,
    paddingBottom: 40,
    backgroundColor: "#f8fafc",
  },

  title: {
    fontSize: 28,
    fontWeight: "900",
    color: "#0f172a",
    marginBottom: 16,
  },

  summaryRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },

  summaryCard: {
    flex: 1,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    padding: 10,
    alignItems: "center",
  },

  summaryValue: {
    fontSize: 22,
    fontWeight: "900",
    color: "#0f172a",
  },

  summaryLabel: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: "800",
    color: "#64748b",
  },
  mapControlRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 10,
  },

  mapControlButton: {
    flex: 1,
    backgroundColor: "#0f172a",
    borderRadius: 10,
    paddingVertical: 11,
    paddingHorizontal: 6,
  },

  mapControlDisabled: {
    opacity: 0.4,
  },

  mapControlButtonText: {
    color: "#ffffff",
    textAlign: "center",
    fontSize: 11,
    fontWeight: "900",
  },

  selectedCard: {
    marginTop: 12,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 14,
    padding: 14,
  },

  selectedCardTitle: {
    fontSize: 15,
    fontWeight: "900",
    color: "#334155",
    textTransform: "uppercase",
    marginBottom: 6,
  },

  driverName: {
    fontSize: 20,
    fontWeight: "900",
    color: "#0f172a",
    marginBottom: 6,
  },

  rideStatus: {
    color: "#2563eb",
    fontSize: 18,
    fontWeight: "900",
    marginBottom: 8,
  },

  routeSummary: {
    backgroundColor: "#eff6ff",
    borderWidth: 1,
    borderColor: "#93c5fd",
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
  },

  routeSummaryText: {
    color: "#1e3a8a",
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 19,
  },

  routeWarning: {
    color: "#92400e",
    backgroundColor: "#fef3c7",
    borderRadius: 8,
    padding: 8,
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 8,
  },

  detailLabel: {
    color: "#64748b",
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase",
    marginTop: 8,
  },

  detailText: {
    color: "#0f172a",
    fontSize: 14,
    lineHeight: 20,
  },

  divider: {
    height: 1,
    backgroundColor: "#e2e8f0",
    marginVertical: 12,
  },

  noActiveRideText: {
    color: "#64748b",
    fontSize: 14,
    fontWeight: "700",
    marginTop: 10,
  },

  refreshButton: {
    backgroundColor: "#2563eb",
    borderRadius: 12,
    paddingVertical: 14,
    marginTop: 12,
  },

  refreshButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "900",
    textAlign: "center",
  },

  loader: {
    marginTop: 20,
  },

  messageBox: {
    marginTop: 12,
    padding: 12,
    borderRadius: 10,
    backgroundColor: "#fee2e2",
  },

  messageText: {
    color: "#991b1b",
    fontWeight: "700",
    lineHeight: 20,
  },
});
