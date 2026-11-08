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
  updatedAt: string;
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
  settlement?: {
    id: string;
    receiptNumber: string;
    finalFare: string | number;
    driverShare: string | number;
    companyShare: string | number;
    status: string;
  } | null;
};

const OPERATION_STATUSES = [
  "ACCEPTED",
  "DRIVER_ARRIVED",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
];

export default function RideOperationsScreen() {
  const [rides, setRides] = useState<Ride[]>([]);
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function loadRideOperations() {
    try {
      setIsLoading(true);
      setMessage("");
      setRides([]);

      const response = await adminFetch(`/rides`);
      const data = await response.json();

      if (!response.ok) {
        setMessage(data.message || "Could not load rides.");
        return;
      }

      const allRides = Array.isArray(data) ? data : [];
      const filteredRides = allRides.filter((ride: Ride) =>
        OPERATION_STATUSES.includes(ride.status),
      );

      setRides(filteredRides);

      if (filteredRides.length === 0) {
        setMessage("No active, completed, or cancelled rides found.");
      }
    } catch {
      setMessage(
        `Could not connect to the backend. Make sure the backend server is running on .`,
      );
    } finally {
      setIsLoading(false);
    }
  }

  function getStatusStyle(status: string) {
    if (status === "COMPLETED") {
      return styles.completedStatus;
    }

    if (status === "CANCELLED") {
      return styles.cancelledStatus;
    }

    if (status === "IN_PROGRESS") {
      return styles.inProgressStatus;
    }

    return styles.activeStatus;
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Ride Operations</Text>

      <Text style={styles.subtitle}>
        Monitor assigned, active, completed, and cancelled rides.
      </Text>

      <TouchableOpacity
        style={[styles.primaryButton, isLoading ? styles.disabledButton : null]}
        onPress={loadRideOperations}
        disabled={isLoading}
      >
        <Text style={styles.primaryButtonText}>
          {isLoading ? "Loading..." : "Load Ride Operations"}
        </Text>
      </TouchableOpacity>

      {message ? (
        <View
          style={
            rides.length > 0 ? styles.successMessageBox : styles.messageBox
          }
        >
          <Text
            style={
              rides.length > 0 ? styles.successMessageText : styles.messageText
            }
          >
            {message}
          </Text>
        </View>
      ) : null}

      {rides.length > 0 ? (
        <View style={styles.countBox}>
          <Text style={styles.countText}>
            {rides.length} operational ride{rides.length === 1 ? "" : "s"} found
          </Text>
        </View>
      ) : null}

      {rides.map((ride) => (
        <View key={ride.id} style={styles.card}>
          <Text style={styles.cardTitle}>Ride Operation</Text>

          <Text style={[styles.status, getStatusStyle(ride.status)]}>
            {ride.status}
          </Text>

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

          <Text style={styles.detailLabel}>Fare</Text>
          <Text style={styles.detailText}>
            Estimated: K{ride.estimatedFare ?? "-"} | Final: K
            {ride.finalFare ?? "-"}
          </Text>

          {ride.driver ? (
            <>
              <View style={styles.divider} />
              <Text style={styles.detailLabel}>Driver</Text>
              <Text style={styles.detailText}>{ride.driver.fullName}</Text>
              <Text style={styles.detailText}>{ride.driver.phone}</Text>
            </>
          ) : (
            <>
              <View style={styles.divider} />
              <Text style={styles.warningText}>No driver assigned.</Text>
            </>
          )}

          {ride.vehicle ? (
            <>
              <Text style={styles.detailLabel}>Vehicle</Text>
              <Text style={styles.detailText}>
                {ride.vehicle.color} {ride.vehicle.make} {ride.vehicle.model}
              </Text>
              <Text style={styles.detailText}>
                Plate: {ride.vehicle.plateNumber}
              </Text>
            </>
          ) : null}

          {ride.settlement ? (
            <>
              <View style={styles.divider} />
              <Text style={styles.detailLabel}>Settlement / Receipt</Text>
              <Text style={styles.detailText}>
                Receipt: {ride.settlement.receiptNumber}
              </Text>
              <Text style={styles.detailText}>
                Final Fare: K{ride.settlement.finalFare}
              </Text>
              <Text style={styles.detailText}>
                Driver Share: K{ride.settlement.driverShare}
              </Text>
              <Text style={styles.detailText}>
                Company Share: K{ride.settlement.companyShare}
              </Text>
              <Text style={styles.detailText}>
                Status: {ride.settlement.status}
              </Text>
            </>
          ) : ride.status === "COMPLETED" ? (
            <>
              <View style={styles.divider} />
              <Text style={styles.warningText}>
                Completed ride has no settlement displayed.
              </Text>
            </>
          ) : null}

          <Text style={styles.detailLabel}>Last Updated</Text>
          <Text style={styles.detailText}>
            {new Date(ride.updatedAt).toLocaleString()}
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
    marginBottom: 6,
  },
  activeStatus: {
    color: "#7c3aed",
  },
  inProgressStatus: {
    color: "#2563eb",
  },
  completedStatus: {
    color: "#16a34a",
  },
  cancelledStatus: {
    color: "#dc2626",
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
  warningText: {
    fontSize: 15,
    color: "#92400e",
    backgroundColor: "#fef3c7",
    borderRadius: 10,
    padding: 12,
    fontWeight: "700",
  },
});
