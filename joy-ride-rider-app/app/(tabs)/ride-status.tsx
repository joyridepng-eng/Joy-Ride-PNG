import { useActiveRiderRide as useRideRecovery } from "../../hooks/use-active-rider-ride";
import { loadRiderSession as loadRecoverySession } from "../../services/rider-session";
import { useRef as useRef, useCallback, useEffect, useState } from "react";
import {
  AppState as RecoveryAppState,
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useFocusEffect as useRecoveryScreenFocus } from "expo-router";
import { riderFetch } from "@/services/rider-auth";
import { router, useLocalSearchParams, type Href } from "expo-router";

import { RiderLiveTripMap } from "../../components/rider-live-trip-map";

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

const ACTIVE_REFRESH_INTERVAL_MS = 5000;

export default function RideStatusScreen() {
  const activeRideRecovery = useRideRecovery();
  const rideRequestSequence = useRef(0);
  const rideRequestController = useRef<AbortController | null>(null);
  const rideStatusFocused = useRef(false);

  useRecoveryScreenFocus(
    useCallback(() => {
      rideStatusFocused.current = true;
      return () => {
        rideStatusFocused.current = false;
        ++rideRequestSequence.current;
        rideRequestController.current?.abort();
      };
    }, []),
  );

  const params = useLocalSearchParams<{
    rideId?: string | string[];
  }>();

  const rideId = Array.isArray(params.rideId)
    ? params.rideId[0]
    : params.rideId;

  const [ride, setRide] = useState<Ride | null>(null);
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const checkRideStatusById = useCallback(
    async (idToCheck: string, isAutoRefresh = false) => {
      const cleanRideId = idToCheck.trim();
      if (
        !cleanRideId ||
        !rideStatusFocused.current ||
        RecoveryAppState.currentState !== "active"
      )
        return;

      const request = ++rideRequestSequence.current;
      rideRequestController.current?.abort();
      const controller = new AbortController();
      rideRequestController.current = controller;
      const timeout = setTimeout(() => controller.abort(), 12000);

      if (isAutoRefresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
        setMessage("");
        setRide(null);
      }

      try {
        const session = await loadRecoverySession();
        if (!session) throw new Error("Sign-in required.");

        const response = await riderFetch(
          `/rides/me/${encodeURIComponent(cleanRideId)}`,
          {
            signal: controller.signal,
          },
        );
        if (!response.ok) throw new Error("Ride lookup failed.");
        const data = await response.json();
        const current = await loadRecoverySession();

        if (
          request !== rideRequestSequence.current ||
          controller.signal.aborted ||
          !rideStatusFocused.current
        )
          return;

        if (
          !current ||
          current.rider.id !== session.rider.id ||
          current.accessToken !== session.accessToken
        ) {
          throw new Error("Session changed.");
        }
        if (
          !data ||
          data.id !== cleanRideId ||
          typeof data.status !== "string"
        ) {
          throw new Error("Invalid ride response.");
        }

        setRide(data);
        setMessage("");
      } catch {
        if (
          request === rideRequestSequence.current &&
          rideStatusFocused.current
        ) {
          setMessage("Unable to refresh your ride. Retry when connected.");
        }
      } finally {
        clearTimeout(timeout);
        if (
          request === rideRequestSequence.current &&
          rideStatusFocused.current
        ) {
          setIsLoading(false);
          setIsRefreshing(false);
          rideRequestController.current = null;
        }
      }
    },
    [],
  );

  useEffect(() => {
    if (rideId) {
      void checkRideStatusById(rideId);
      return;
    }

    setRide(null);
    if (activeRideRecovery.state.phase === "checking") {
      setIsLoading(true);
      setMessage("");
    } else if (activeRideRecovery.state.phase === "active") {
      const restoredId = activeRideRecovery.state.ride.id;
      router.setParams({ rideId: restoredId });
      void checkRideStatusById(restoredId);
    } else {
      setIsLoading(false);
      setIsRefreshing(false);
      setMessage(
        activeRideRecovery.state.phase === "error"
          ? activeRideRecovery.state.message
          : "No active ride found for this account.",
      );
    }
  }, [rideId, activeRideRecovery.state, checkRideStatusById]);

  useEffect(() => {
    if (
      !ride ||
      !["REQUESTED", "ACCEPTED", "DRIVER_ARRIVED", "IN_PROGRESS"].includes(
        ride.status,
      )
    ) {
      return;
    }

    const interval = setInterval(() => {
      checkRideStatusById(ride.id, true);
    }, ACTIVE_REFRESH_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [ride, checkRideStatusById]);

  function getStatusMessage(status: string) {
    switch (status) {
      case "REQUESTED":
        return "Your ride request has been received. Waiting for a driver to be assigned.";

      case "ACCEPTED":
        return "A driver has accepted your ride and is heading to the pickup location.";

      case "DRIVER_ARRIVED":
        return "Your driver has arrived at the pickup location.";

      case "IN_PROGRESS":
        return "Your ride is currently in progress.";

      case "COMPLETED":
        return "Your ride has been completed.";

      case "CANCELLED":
        return "This ride has been cancelled.";

      default:
        return "Your ride status is being updated.";
    }
  }

  function getStatusLabel(status: string) {
    return status.replaceAll("_", " ");
  }

  const rideIsActive = Boolean(
    ride &&
    ["REQUESTED", "ACCEPTED", "DRIVER_ARRIVED", "IN_PROGRESS"].includes(
      ride.status,
    ),
  );

  const pickupMapPoint =
    ride && ride.pickupLatitude != null && ride.pickupLongitude != null
      ? {
          latitude: ride.pickupLatitude,
          longitude: ride.pickupLongitude,
          label: ride.pickupLabel ?? ride.pickupAddress,
        }
      : null;

  const dropoffMapPoint =
    ride && ride.dropoffLatitude != null && ride.dropoffLongitude != null
      ? {
          latitude: ride.dropoffLatitude,
          longitude: ride.dropoffLongitude,
          label: ride.dropoffLabel ?? ride.dropoffAddress,
        }
      : null;

  const vehicleLabel = ride?.vehicle
    ? `${ride.vehicle.color} ${ride.vehicle.make} ${ride.vehicle.model} - ${ride.vehicle.plateNumber}`
    : null;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>My Ride</Text>

      {isLoading ? (
        <View style={styles.loadingCard}>
          <ActivityIndicator size="large" />

          <Text style={styles.loadingText}>Loading your ride...</Text>
        </View>
      ) : null}

      {message ? (
        <View style={styles.messageBox}>
          <TouchableOpacity
            style={styles.refreshButton}
            onPress={() => {
              if (rideId) void checkRideStatusById(rideId);
              else void activeRideRecovery.refresh();
            }}
          >
            <Text style={styles.refreshButtonText}>
              Retry current ride check
            </Text>
          </TouchableOpacity>

          <Text style={styles.messageText}>{message}</Text>

          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.replace("/request-ride")}
          >
            <Text style={styles.backButtonText}>Request a Ride</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {ride ? (
        <>
          <View style={styles.statusCard}>
            <View style={styles.statusHeader}>
              <View style={styles.statusTextArea}>
                <Text style={styles.statusLabel}>CURRENT STATUS</Text>

                <Text style={styles.status}>{getStatusLabel(ride.status)}</Text>
              </View>

              {isRefreshing ? <ActivityIndicator size="small" /> : null}
            </View>

            <Text style={styles.statusMessage}>
              {getStatusMessage(ride.status)}
            </Text>

            <View
              style={[
                styles.refreshNotice,
                !rideIsActive ? styles.refreshNoticeInactive : null,
              ]}
            >
              <Text style={styles.refreshNoticeText}>
                {rideIsActive
                  ? "Updating automatically"
                  : "Ride ended. Live updates stopped."}
              </Text>
            </View>

            <TouchableOpacity
              style={styles.refreshButton}
              onPress={() => checkRideStatusById(ride.id)}
              disabled={isLoading || isRefreshing}
            >
              <Text style={styles.refreshButtonText}>
                {isRefreshing ? "Refreshing..." : "Refresh Now"}
              </Text>
            </TouchableOpacity>
          </View>

          <RiderLiveTripMap
            rideId={ride.id}
            status={ride.status}
            pickup={pickupMapPoint}
            dropoff={dropoffMapPoint}
            driverAssigned={Boolean(ride.driver?.id)}
            driverName={ride.driver?.fullName}
            vehicleLabel={vehicleLabel}
            trackingEnabled={Boolean(rideIsActive)}
          />

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Trip Details</Text>

            <Text style={styles.detailLabel}>Pickup</Text>

            <Text style={styles.detailPrimary}>
              {ride.pickupLabel || "Pickup location"}
            </Text>

            <Text style={styles.detailSecondary}>
              {ride.pickupAddress || "Address unavailable"}
            </Text>

            <View style={styles.routeLine} />

            <Text style={styles.detailLabel}>Drop-off</Text>

            <Text style={styles.detailPrimary}>
              {ride.dropoffLabel || "Drop-off location"}
            </Text>

            <Text style={styles.detailSecondary}>
              {ride.dropoffAddress || "Address unavailable"}
            </Text>

            <View style={styles.divider} />

            <Text style={styles.detailLabel}>Estimated Fare</Text>

            <Text style={styles.fareText}>
              {ride.estimatedFare == null
                ? "Not available"
                : `K${ride.estimatedFare}`}
            </Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Driver and Vehicle</Text>

            {ride.driver ? (
              <>
                <Text style={styles.detailLabel}>Driver</Text>

                <Text style={styles.detailPrimary}>{ride.driver.fullName}</Text>

                <Text style={styles.detailSecondary}>{ride.driver.phone}</Text>
              </>
            ) : (
              <View style={styles.waitingBox}>
                <Text style={styles.waitingText}>
                  A driver has not been assigned yet.
                </Text>
              </View>
            )}

            {ride.vehicle ? (
              <>
                <View style={styles.divider} />

                <Text style={styles.detailLabel}>Vehicle</Text>

                <Text style={styles.detailPrimary}>
                  {ride.vehicle.color} {ride.vehicle.make} {ride.vehicle.model}
                </Text>

                <Text style={styles.detailSecondary}>
                  Plate: {ride.vehicle.plateNumber}
                </Text>
              </>
            ) : null}
          </View>

          {ride.status === "COMPLETED" &&
          ride.driver &&
          ride.id === rideId?.trim() ? (
            <TouchableOpacity
              style={styles.receiptButton}
              accessibilityRole="button"
              accessibilityLabel="Rate this ride"
              onPress={() =>
                router.push(
                  `/feedback?rideId=${encodeURIComponent(ride.id)}` as Href,
                )
              }
            >
              <Text style={styles.receiptButtonText}>
                Rate this ride / View feedback
              </Text>
            </TouchableOpacity>
          ) : null}

          {ride.status === "COMPLETED" ? (
            <TouchableOpacity
              style={styles.receiptButton}
              onPress={() =>
                router.push({
                  pathname: "/receipt",
                  params: {
                    rideId: ride.id,
                  },
                })
              }
            >
              <Text style={styles.receiptButtonText}>View Receipt</Text>
            </TouchableOpacity>
          ) : null}
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: 12,
    paddingTop: 44,
    backgroundColor: "#f8fafc",
  },

  title: {
    fontSize: 26,
    fontWeight: "900",
    color: "#0f172a",
    textAlign: "center",
  },

  subtitle: {
    marginTop: 6,
    marginBottom: 22,
    fontSize: 15,
    lineHeight: 22,
    color: "#64748b",
    textAlign: "center",
  },

  loadingCard: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 18,
    padding: 28,
  },

  loadingText: {
    marginTop: 12,
    fontSize: 15,
    fontWeight: "700",
    color: "#475569",
  },

  messageBox: {
    backgroundColor: "#fff1f2",
    borderWidth: 1,
    borderColor: "#fda4af",
    borderRadius: 16,
    padding: 18,
  },

  messageText: {
    color: "#9f1239",
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "700",
  },

  backButton: {
    marginTop: 16,
    backgroundColor: "#2563eb",
    borderRadius: 12,
    paddingVertical: 13,
  },

  backButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "800",
    textAlign: "center",
  },

  statusCard: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#dbeafe",
    borderRadius: 18,
    padding: 12,
    marginBottom: 16,
  },

  statusHeader: {
    flexDirection: "row",
    alignItems: "center",
  },

  statusTextArea: {
    flex: 1,
  },

  statusLabel: {
    fontSize: 12,
    fontWeight: "900",
    color: "#64748b",
    letterSpacing: 0.8,
  },

  status: {
    marginTop: 4,
    fontSize: 25,
    fontWeight: "900",
    color: "#2563eb",
  },

  statusMessage: {
    marginTop: 8,
    color: "#475569",
    fontSize: 15,
    lineHeight: 22,
  },

  refreshNotice: {
    marginTop: 14,
    backgroundColor: "#ecfeff",
    borderWidth: 1,
    borderColor: "#a5f3fc",
    borderRadius: 12,
    padding: 12,
  },

  refreshNoticeInactive: {
    backgroundColor: "#f1f5f9",
    borderColor: "#cbd5e1",
  },

  refreshNoticeText: {
    color: "#155e75",
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "700",
  },

  refreshButton: {
    marginTop: 14,
    backgroundColor: "#0f172a",
    borderRadius: 12,
    paddingVertical: 13,
  },

  refreshButtonText: {
    color: "#ffffff",
    textAlign: "center",
    fontSize: 15,
    fontWeight: "800",
  },

  card: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 18,
    padding: 18,
    marginBottom: 16,
  },

  cardTitle: {
    marginBottom: 12,
    color: "#0f172a",
    fontSize: 20,
    fontWeight: "900",
  },

  detailLabel: {
    marginTop: 8,
    marginBottom: 4,
    color: "#64748b",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.7,
    textTransform: "uppercase",
  },

  detailPrimary: {
    color: "#0f172a",
    fontSize: 17,
    lineHeight: 23,
    fontWeight: "800",
  },

  detailSecondary: {
    marginTop: 2,
    color: "#475569",
    fontSize: 15,
    lineHeight: 22,
  },

  routeLine: {
    width: 3,
    height: 25,
    marginVertical: 4,
    marginLeft: 6,
    backgroundColor: "#bfdbfe",
    borderRadius: 10,
  },

  divider: {
    height: 1,
    backgroundColor: "#e2e8f0",
    marginVertical: 16,
  },

  fareText: {
    color: "#166534",
    fontSize: 22,
    fontWeight: "900",
  },

  waitingBox: {
    backgroundColor: "#fffbeb",
    borderWidth: 1,
    borderColor: "#fde68a",
    borderRadius: 12,
    padding: 13,
  },

  waitingText: {
    color: "#92400e",
    fontSize: 15,
    lineHeight: 21,
    fontWeight: "700",
  },

  receiptButton: {
    backgroundColor: "#16a34a",
    paddingVertical: 15,
    borderRadius: 14,
    marginBottom: 40,
  },

  receiptButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "900",
    textAlign: "center",
  },
});
