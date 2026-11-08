import { RideMap } from "@/components/ride-map";
import { driverFetch } from "@/services/driver-auth";
import { useDriverLocationTracking } from "@/hooks/use-driver-location-tracking";
import { useDrivingRoute } from "@/hooks/use-driving-route";
import { useCallback, useMemo, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";
import { useDriverAuth } from "@/contexts/driver-auth-context";
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

type Ride = {
  id: string;
  status: string;
  riderName: string;
  riderPhone: string;
  pickupLabel: string | null;
  pickupAddress: string | null;
  pickupLatitude: number | null;
  pickupLongitude: number | null;
  dropoffLabel: string | null;
  dropoffAddress: string | null;
  dropoffLatitude: number | null;
  dropoffLongitude: number | null;
  estimatedFare: number | null;
  finalFare: number | null;
  driver?: {
    id: string;
    fullName: string;
    phone: string;
  } | null;
  vehicle?: {
    id: string;
    plateNumber: string;
    make: string;
    model: string;
    color: string;
  } | null;
};

const ACTIVE_DRIVER_STATUSES = ["ACCEPTED", "DRIVER_ARRIVED", "IN_PROGRESS"];

export default function AssignedRideScreen() {
  const { session } = useDriverAuth();
  const driverId = session?.driver.id;
  const focusedRef = useRef(false);
  const generationRef = useRef(0);
  const loadingRef = useRef(false);
  const updatingRef = useRef(false);
  const [screenFocused, setScreenFocused] = useState(false);
  const [assignedRide, setAssignedRide] = useState<Ride | null>(null);
  const [message, setMessage] = useState("");
  const [showDetails, setShowDetails] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  const trackingEnabled =
    screenFocused &&
    assignedRide?.driver?.id === driverId &&
    Platform.OS !== "web" &&
    assignedRide !== null &&
    ACTIVE_DRIVER_STATUSES.includes(assignedRide.status);

  const {
    status: trackingStatus,
    errorMessage: trackingError,
    latestLocation,
    isTracking,
  } = useDriverLocationTracking({
    rideId: assignedRide?.id,
    enabled: trackingEnabled,
  });

  const driverMapLocation = useMemo(
    () =>
      latestLocation
        ? {
            latitude: latestLocation.latitude,
            longitude: latestLocation.longitude,
            accuracy: latestLocation.accuracy,
            heading: latestLocation.heading,
            speed: latestLocation.speed,
            label: "Your live location",
          }
        : null,
    [latestLocation],
  );

  const pickupMapLocation = useMemo(
    () =>
      assignedRide?.pickupLatitude !== null &&
      assignedRide?.pickupLatitude !== undefined &&
      assignedRide?.pickupLongitude !== null &&
      assignedRide?.pickupLongitude !== undefined
        ? {
            latitude: assignedRide.pickupLatitude,
            longitude: assignedRide.pickupLongitude,
            label: assignedRide.pickupLabel || "Pickup",
            address:
              assignedRide.pickupAddress ||
              assignedRide.pickupLabel ||
              "Pickup location",
          }
        : null,
    [
      assignedRide?.pickupLatitude,
      assignedRide?.pickupLongitude,
      assignedRide?.pickupLabel,
      assignedRide?.pickupAddress,
    ],
  );

  const dropoffMapLocation = useMemo(
    () =>
      assignedRide?.dropoffLatitude !== null &&
      assignedRide?.dropoffLatitude !== undefined &&
      assignedRide?.dropoffLongitude !== null &&
      assignedRide?.dropoffLongitude !== undefined
        ? {
            latitude: assignedRide.dropoffLatitude,
            longitude: assignedRide.dropoffLongitude,
            label: assignedRide.dropoffLabel || "Drop-off",
            address:
              assignedRide.dropoffAddress ||
              assignedRide.dropoffLabel ||
              "Drop-off location",
          }
        : null,
    [
      assignedRide?.dropoffLatitude,
      assignedRide?.dropoffLongitude,
      assignedRide?.dropoffLabel,
      assignedRide?.dropoffAddress,
    ],
  );

  const navigationMode =
    assignedRide?.status === "IN_PROGRESS"
      ? "dropoff"
      : assignedRide?.status === "DRIVER_ARRIVED"
        ? "waiting"
        : "pickup";

  const activeDestination =
    navigationMode === "dropoff" ? dropoffMapLocation : pickupMapLocation;

  const {
    route: drivingRoute,
    errorMessage: routeError,
    isLoading: routeLoading,
  } = useDrivingRoute({
    rideId: assignedRide?.id,
    origin: driverMapLocation,
    destination: activeDestination,
    enabled:
      trackingEnabled &&
      driverMapLocation !== null &&
      activeDestination !== null,
  });

  const findAssignedRide = useCallback(
    async (isAutoRefresh = false) => {
      if (!focusedRef.current || loadingRef.current || updatingRef.current)
        return;
      if (!driverId) {
        setMessage("Sign in to load your assigned ride.");
        return;
      }
      const generation = generationRef.current;
      const current = () =>
        focusedRef.current && generation === generationRef.current;
      loadingRef.current = true;
      if (!isAutoRefresh) setIsLoading(true);
      try {
        const response = await driverFetch("/rides/driver/me/active");
        if (!current()) return;
        if (!response.ok) {
          setMessage(
            response.status === 401 || response.status === 403
              ? `Assigned ride access was rejected (HTTP ${response.status}). Sign in again.`
              : `Assigned ride request failed (HTTP ${response.status}).`,
          );
          return;
        }
        const text = await response.text();
        if (!current()) return;
        if (!text.trim()) {
          setAssignedRide(null);
          setMessage(
            "No active ride was returned. Checking again every 5 seconds.",
          );
          return;
        }
        let data: unknown;
        try {
          data = JSON.parse(text);
        } catch {
          setMessage(
            "Assigned ride response is not valid JSON. The request reached a server, but its response could not be read.",
          );
          return;
        }
        if (data === null) {
          setAssignedRide(null);
          setMessage(
            "No active assigned ride found. Checking again every 5 seconds.",
          );
          return;
        }
        if (
          typeof data !== "object" ||
          !("id" in data) ||
          typeof data.id !== "string" ||
          !("status" in data) ||
          typeof data.status !== "string"
        ) {
          setMessage("The server returned an unexpected assigned ride format.");
          return;
        }
        const ride = data as Ride;
        if (ride.driver?.id !== driverId) {
          setAssignedRide(null);
          setMessage(
            "The returned ride does not match your signed-in driver account. Sign in again.",
          );
          return;
        }
        if (!ACTIVE_DRIVER_STATUSES.includes(ride.status)) {
          setAssignedRide(null);
          setMessage(
            "No active assigned ride found. Checking again every 5 seconds.",
          );
          return;
        }
        setAssignedRide(ride);
        setMessage("Assigned ride loaded.");
      } catch {
        if (current())
          setMessage(
            "Assigned ride request or response reading failed. Refresh Driver Status to check your session, then retry.",
          );
      } finally {
        loadingRef.current = false;
        if (current()) setIsLoading(false);
      }
    },
    [driverId],
  );

  useFocusEffect(
    useCallback(() => {
      generationRef.current += 1;
      focusedRef.current = true;
      setScreenFocused(true);
      setAssignedRide(null);
      setMessage("");
      void findAssignedRide();
      const timer = setInterval(() => void findAssignedRide(true), 5000);
      return () => {
        focusedRef.current = false;
        generationRef.current += 1;
        setScreenFocused(false);
        clearInterval(timer);
      };
    }, [findAssignedRide]),
  );

  async function updateRideStatus(nextStatus: string) {
    if (updatingRef.current || loadingRef.current) return;
    if (!assignedRide) {
      setMessage("No assigned ride selected.");
      return;
    }

    const generation = generationRef.current;
    updatingRef.current = true;
    try {
      setIsUpdatingStatus(true);
      setMessage("");

      const response = await driverFetch(
        `/rides/driver/me/${encodeURIComponent(assignedRide.id)}/status`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            status: nextStatus,
          }),
        },
      );

      const data = await response.json();
      if (!focusedRef.current || generation !== generationRef.current) return;

      if (!response.ok) {
        setMessage(
          `Could not update ride status (HTTP ${response.status}). Refresh before retrying.`,
        );
        return;
      }

      if (ACTIVE_DRIVER_STATUSES.includes(data.status)) {
        setAssignedRide(data);
        setMessage(`Ride updated to ${data.status}.`);
      } else {
        setAssignedRide(null);
        setMessage(
          `Ride updated to ${data.status}. This ride is no longer active.`,
        );
      }
    } catch {
      if (!focusedRef.current || generation !== generationRef.current) return;
      setMessage(
        "Could not update the ride. Check your internet connection and Driver session.",
      );
    } finally {
      updatingRef.current = false;
      setIsUpdatingStatus(false);
    }
  }

  function getDriverActionMessage(status: string) {
    switch (status) {
      case "ACCEPTED":
        return "Go to the pickup location and mark arrived when you reach the rider.";
      case "DRIVER_ARRIVED":
        return "You have arrived. Start the ride when the rider is in the vehicle.";
      case "IN_PROGRESS":
        return "Ride is in progress. Complete the ride when you reach the dropoff location.";
      default:
        return "This ride is not active for driver action.";
    }
  }

  function getAutoRefreshMessage(status: string) {
    if (!ACTIVE_DRIVER_STATUSES.includes(status)) {
      return "Auto-refresh stopped because this ride is no longer active.";
    }

    return "Auto-refresh is active. This screen checks for assigned ride updates every 5 seconds.";
  }

  function renderActionButton() {
    if (!assignedRide) {
      return null;
    }

    if (assignedRide.status === "ACCEPTED") {
      return (
        <TouchableOpacity
          style={[
            styles.actionButton,
            isUpdatingStatus ? styles.disabledButton : null,
          ]}
          onPress={() => updateRideStatus("DRIVER_ARRIVED")}
          disabled={isUpdatingStatus}
        >
          <Text style={styles.actionButtonText}>
            {isUpdatingStatus ? "Updating..." : "Mark Arrived"}
          </Text>
        </TouchableOpacity>
      );
    }

    if (assignedRide.status === "DRIVER_ARRIVED") {
      return (
        <TouchableOpacity
          style={[
            styles.actionButton,
            isUpdatingStatus ? styles.disabledButton : null,
          ]}
          onPress={() => updateRideStatus("IN_PROGRESS")}
          disabled={isUpdatingStatus}
        >
          <Text style={styles.actionButtonText}>
            {isUpdatingStatus ? "Updating..." : "Start Ride"}
          </Text>
        </TouchableOpacity>
      );
    }

    if (assignedRide.status === "IN_PROGRESS") {
      return (
        <TouchableOpacity
          style={[
            styles.completeButton,
            isUpdatingStatus ? styles.disabledButton : null,
          ]}
          onPress={() => updateRideStatus("COMPLETED")}
          disabled={isUpdatingStatus}
        >
          <Text style={styles.actionButtonText}>
            {isUpdatingStatus ? "Updating..." : "Complete Ride"}
          </Text>
        </TouchableOpacity>
      );
    }

    return null;
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>My Ride</Text>

      {!assignedRide ? (
        <TouchableOpacity
          style={[
            styles.primaryButton,
            isLoading ? styles.disabledButton : null,
          ]}
          onPress={() => findAssignedRide()}
          disabled={isLoading}
        >
          <Text style={styles.primaryButtonText}>
            {isLoading ? "Checking..." : "Find Ride"}
          </Text>
        </TouchableOpacity>
      ) : null}

      {assignedRide ? (
        <TouchableOpacity
          style={[
            styles.refreshButton,
            isLoading ? styles.disabledButton : null,
          ]}
          onPress={() => findAssignedRide()}
          disabled={isLoading}
        >
          <Text style={styles.refreshButtonText}>
            {isLoading ? "Refreshing..." : "Refresh"}
          </Text>
        </TouchableOpacity>
      ) : null}

      {message ? (
        <View
          style={assignedRide ? styles.successMessageBox : styles.messageBox}
        >
          <Text
            style={
              assignedRide ? styles.successMessageText : styles.messageText
            }
          >
            {message}
          </Text>
        </View>
      ) : null}

      {assignedRide ? (
        <View style={styles.card}>
          <Text style={styles.status}>
            {assignedRide.status === "ACCEPTED"
              ? "Go to pickup"
              : assignedRide.status === "DRIVER_ARRIVED"
                ? "At pickup"
                : assignedRide.status === "IN_PROGRESS"
                  ? "Ride in progress"
                  : assignedRide.status.replace(/_/g, " ")}
          </Text>
          <Text style={styles.statusMessage}>
            {getDriverActionMessage(assignedRide.status)}
          </Text>

          {showDetails ? (
            <View style={styles.autoRefreshBox}>
              <Text style={styles.autoRefreshText}>
                {getAutoRefreshMessage(assignedRide.status)}
              </Text>
            </View>
          ) : null}

          <View
            style={[
              styles.trackingBox,
              trackingError ? styles.trackingErrorBox : null,
            ]}
          >
            <Text
              style={[
                styles.trackingText,
                trackingError ? styles.trackingErrorText : null,
              ]}
            >
              {Platform.OS === "web"
                ? "Live GPS tracking is disabled on web. Use the Android app for live location sharing."
                : trackingStatus === "requesting-permission"
                  ? "Requesting location permission..."
                  : trackingError
                    ? trackingError
                    : isTracking
                      ? "Live location sharing is active."
                      : "Waiting for live GPS tracking to start."}
            </Text>

            <RideMap
              driverLocation={driverMapLocation}
              pickupLocation={pickupMapLocation}
              dropoffLocation={dropoffMapLocation}
              activeDestination={activeDestination}
              route={drivingRoute}
              routeLoading={routeLoading}
              routeError={routeError}
              navigationMode={navigationMode}
            />

            {showDetails && latestLocation ? (
              <>
                <Text style={styles.trackingCoordinate}>
                  Accuracy:{" "}
                  {latestLocation.accuracy === null
                    ? "Unavailable"
                    : `${latestLocation.accuracy.toFixed(1)} m`}
                </Text>

                <Text style={styles.trackingTimestamp}>
                  Last updated:{" "}
                  {new Date(latestLocation.recordedAt).toLocaleTimeString()}
                </Text>
              </>
            ) : null}
          </View>

          {renderActionButton()}

          <View style={styles.divider} />

          <TouchableOpacity
            accessibilityRole="button"
            accessibilityState={{ expanded: showDetails }}
            style={styles.detailsButton}
            onPress={() => setShowDetails((current) => !current)}
          >
            <Text style={styles.refreshButtonText}>
              {showDetails ? "Hide technical details" : "Technical details"}
            </Text>
          </TouchableOpacity>
          {showDetails ? (
            <View>
              <Text style={styles.detailLabel}>Ride ID</Text>
              <Text style={styles.detailText}>{assignedRide.id}</Text>
            </View>
          ) : null}

          <Text style={styles.detailLabel}>Rider</Text>
          <Text style={styles.detailText}>{assignedRide.riderName}</Text>
          <Text style={styles.detailText}>{assignedRide.riderPhone}</Text>

          <Text style={styles.detailLabel}>Pickup</Text>
          <Text style={styles.detailText}>{assignedRide.pickupLabel}</Text>
          <Text style={styles.detailText}>{assignedRide.pickupAddress}</Text>

          <Text style={styles.detailLabel}>Dropoff</Text>
          <Text style={styles.detailText}>{assignedRide.dropoffLabel}</Text>
          <Text style={styles.detailText}>{assignedRide.dropoffAddress}</Text>

          <Text style={styles.detailLabel}>Estimated Fare</Text>
          <Text style={styles.detailText}>
            K{assignedRide.estimatedFare ?? "-"}
          </Text>

          {assignedRide.vehicle ? (
            <>
              <View style={styles.divider} />
              <Text style={styles.detailLabel}>Vehicle</Text>
              <Text style={styles.detailText}>
                {assignedRide.vehicle.color} {assignedRide.vehicle.make}{" "}
                {assignedRide.vehicle.model}
              </Text>
              <Text style={styles.detailText}>
                Plate: {assignedRide.vehicle.plateNumber}
              </Text>
            </>
          ) : null}
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 12,
    paddingBottom: 24,
    backgroundColor: "#f8fafc",
  },
  title: {
    fontSize: 26,
    fontWeight: "900",
    color: "#0f172a",
    textAlign: "center",
    marginBottom: 12,
    marginTop: 8,
  },
  subtitle: {
    fontSize: 16,
    color: "#475569",
    textAlign: "center",
    lineHeight: 24,
    marginBottom: 24,
  },
  testDriverBox: {
    backgroundColor: "#ecfdf5",
    borderWidth: 1,
    borderColor: "#6ee7b7",
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
  },
  testDriverLabel: {
    color: "#047857",
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    marginBottom: 4,
  },
  testDriverName: {
    color: "#065f46",
    fontSize: 17,
    fontWeight: "900",
  },
  primaryButton: {
    backgroundColor: "#16a34a",
    paddingVertical: 16,
    borderRadius: 14,
    marginTop: 10,
    marginBottom: 12,
  },
  refreshButton: {
    backgroundColor: "#0f172a",
    paddingVertical: 14,
    borderRadius: 14,
    marginBottom: 18,
  },
  disabledButton: {
    backgroundColor: "#94a3b8",
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 17,
    fontWeight: "800",
    textAlign: "center",
  },
  refreshButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "800",
    textAlign: "center",
  },
  actionButton: {
    backgroundColor: "#2563eb",
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 16,
  },
  completeButton: {
    backgroundColor: "#dc2626",
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 16,
  },
  actionButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "900",
    textAlign: "center",
  },
  messageBox: {
    backgroundColor: "#fee2e2",
    borderWidth: 1,
    borderColor: "#fca5a5",
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  messageText: {
    color: "#991b1b",
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "600",
  },
  successMessageBox: {
    backgroundColor: "#dcfce7",
    borderWidth: 1,
    borderColor: "#86efac",
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  successMessageText: {
    color: "#166534",
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "700",
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 8,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    marginBottom: 40,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: "900",
    color: "#0f172a",
    marginBottom: 10,
  },
  status: {
    fontSize: 24,
    fontWeight: "900",
    color: "#16a34a",
    marginBottom: 6,
  },
  statusMessage: {
    fontSize: 15,
    color: "#475569",
    lineHeight: 22,
  },
  autoRefreshBox: {
    backgroundColor: "#e0f2fe",
    borderWidth: 1,
    borderColor: "#7dd3fc",
    borderRadius: 10,
    padding: 12,
    marginTop: 14,
  },
  autoRefreshText: {
    color: "#075985",
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "700",
  },
  trackingBox: {
    backgroundColor: "#ecfdf5",
    borderWidth: 1,
    borderColor: "#6ee7b7",
    borderRadius: 10,
    padding: 0,
    marginTop: 14,
  },
  trackingErrorBox: {
    backgroundColor: "#fef2f2",
    borderColor: "#fca5a5",
  },
  trackingTitle: {
    color: "#065f46",
    fontSize: 15,
    fontWeight: "900",
    marginBottom: 6,
  },
  trackingText: {
    padding: 8,
    color: "#047857",
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "700",
  },
  trackingErrorText: {
    color: "#991b1b",
  },
  trackingCoordinate: {
    color: "#0f172a",
    fontSize: 14,
    marginTop: 5,
  },
  trackingTimestamp: {
    color: "#475569",
    fontSize: 13,
    marginTop: 7,
  },
  detailsButton: {
    backgroundColor: "#334155",
    borderRadius: 12,
    minHeight: 48,
    padding: 12,
    justifyContent: "center",
    marginBottom: 8,
  },
  divider: {
    height: 1,
    backgroundColor: "#e2e8f0",
    marginVertical: 16,
  },
  detailLabel: {
    fontSize: 13,
    fontWeight: "800",
    color: "#334155",
    marginTop: 10,
    marginBottom: 4,
    textTransform: "uppercase",
  },
  detailText: {
    fontSize: 16,
    color: "#0f172a",
    marginBottom: 3,
  },
});
