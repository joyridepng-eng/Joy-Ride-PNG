import { adminFetch } from "@/services/admin-auth";
import { useState } from "react";
import {
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
  dropoffLabel: string | null;
  dropoffAddress: string | null;
  estimatedFare: number | null;
  finalFare: number | null;
  requestedAt: string;
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

export default function RequestedRidesScreen() {
  const [requestedRides, setRequestedRides] = useState<Ride[]>([]);
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function loadRequestedRides() {
    try {
      setIsLoading(true);
      setMessage("");
      setRequestedRides([]);

      const response = await adminFetch(`/rides`);
      const data = await response.json();

      if (!response.ok) {
        setMessage(data.message || "Could not load rides.");
        return;
      }

      const rides = Array.isArray(data) ? data : [];
      const filteredRides = rides.filter(
        (ride: Ride) => ride.status === "REQUESTED",
      );

      setRequestedRides(filteredRides);

      if (filteredRides.length === 0) {
        setMessage("No requested rides waiting for assignment.");
      }
    } catch {
      setMessage(
        `Could not connect to the backend. Make sure the backend server is running on .`,
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Requested Rides</Text>

      <Text style={styles.subtitle}>
        View new ride requests waiting for admin driver assignment.
      </Text>

      <TouchableOpacity
        style={[styles.primaryButton, isLoading ? styles.disabledButton : null]}
        onPress={loadRequestedRides}
        disabled={isLoading}
      >
        <Text style={styles.primaryButtonText}>
          {isLoading ? "Loading..." : "Load Requested Rides"}
        </Text>
      </TouchableOpacity>

      {message ? (
        <View
          style={
            requestedRides.length > 0
              ? styles.successMessageBox
              : styles.messageBox
          }
        >
          <Text
            style={
              requestedRides.length > 0
                ? styles.successMessageText
                : styles.messageText
            }
          >
            {message}
          </Text>
        </View>
      ) : null}

      {requestedRides.length > 0 ? (
        <View style={styles.countBox}>
          <Text style={styles.countText}>
            {requestedRides.length} requested ride
            {requestedRides.length === 1 ? "" : "s"} found
          </Text>
        </View>
      ) : null}

      {requestedRides.map((ride) => (
        <View key={ride.id} style={styles.card}>
          <Text style={styles.cardTitle}>Ride Request</Text>

          <Text style={styles.status}>{ride.status}</Text>

          <View style={styles.divider} />

          <Text style={styles.detailLabel}>Ride ID</Text>
          <Text style={styles.detailText}>{ride.id}</Text>

          <Text style={styles.detailLabel}>Rider</Text>
          <Text style={styles.detailText}>{ride.riderName}</Text>
          <Text style={styles.detailText}>{ride.riderPhone}</Text>

          <Text style={styles.detailLabel}>Pickup</Text>
          <Text style={styles.detailText}>{ride.pickupLabel}</Text>
          <Text style={styles.detailText}>{ride.pickupAddress}</Text>

          <Text style={styles.detailLabel}>Dropoff</Text>
          <Text style={styles.detailText}>{ride.dropoffLabel}</Text>
          <Text style={styles.detailText}>{ride.dropoffAddress}</Text>

          <Text style={styles.detailLabel}>Estimated Fare</Text>
          <Text style={styles.detailText}>K{ride.estimatedFare ?? "-"}</Text>

          <Text style={styles.detailLabel}>Requested At</Text>
          <Text style={styles.detailText}>
            {new Date(ride.requestedAt).toLocaleString()}
          </Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 24,
    backgroundColor: "#f8fafc",
  },
  title: {
    fontSize: 30,
    fontWeight: "900",
    color: "#0f172a",
    textAlign: "center",
    marginBottom: 12,
    marginTop: 24,
  },
  subtitle: {
    fontSize: 16,
    color: "#475569",
    textAlign: "center",
    lineHeight: 24,
    marginBottom: 24,
  },
  primaryButton: {
    backgroundColor: "#7c3aed",
    paddingVertical: 16,
    borderRadius: 14,
    marginTop: 10,
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
  countBox: {
    backgroundColor: "#ede9fe",
    borderWidth: 1,
    borderColor: "#c4b5fd",
    borderRadius: 12,
    padding: 14,
    marginBottom: 18,
  },
  countText: {
    color: "#4c1d95",
    fontSize: 15,
    fontWeight: "800",
    textAlign: "center",
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    marginBottom: 18,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: "900",
    color: "#0f172a",
    marginBottom: 10,
  },
  status: {
    fontSize: 22,
    fontWeight: "900",
    color: "#7c3aed",
    marginBottom: 6,
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
