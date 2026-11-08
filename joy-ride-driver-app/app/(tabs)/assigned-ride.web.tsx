import { driverFetch } from "@/services/driver-auth";
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
  vehicle?: {
    plateNumber: string;
    make: string;
    model: string;
    color: string;
  } | null;
  driver?: {
    id: string;
  } | null;
};

const ACTIVE_DRIVER_STATUSES = ["ACCEPTED", "DRIVER_ARRIVED", "IN_PROGRESS"];

export default function AssignedRideWebScreen() {
  const [assignedRide, setAssignedRide] = useState<Ride | null>(null);
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function findAssignedRide() {
    try {
      setIsLoading(true);
      setMessage("");
      setAssignedRide(null);

      const response = await driverFetch("/rides/driver/me/active");
      const data: unknown = await response.json();

      if (!response.ok) {
        const errorMessage =
          typeof data === "object" &&
          data !== null &&
          "message" in data &&
          typeof data.message === "string"
            ? data.message
            : "Could not load rides.";

        setMessage(errorMessage);
        return;
      }

      if (
        typeof data !== "object" ||
        data === null ||
        !("id" in data) ||
        !("status" in data)
      ) {
        setMessage("No active assigned ride found for this driver.");
        return;
      }

      const matchedRide = data as Ride;

      if (!ACTIVE_DRIVER_STATUSES.includes(matchedRide.status)) {
        setMessage("No active assigned ride found for this driver.");
        return;
      }

      setAssignedRide(matchedRide);
      setMessage("Assigned ride loaded.");
    } catch {
      setMessage(
        "Could not load the assigned ride. Check your internet connection and Driver session.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>My Ride</Text>

      <Text style={styles.subtitle}>
        Ride details only. Use the Android app for live navigation.
      </Text>

      <TouchableOpacity
        style={[styles.button, isLoading ? styles.disabledButton : null]}
        onPress={findAssignedRide}
        disabled={isLoading}
      >
        <Text style={styles.buttonText}>
          {isLoading ? "Checking..." : "Find Ride"}
        </Text>
      </TouchableOpacity>

      {message ? (
        <View style={assignedRide ? styles.successBox : styles.messageBox}>
          <Text style={assignedRide ? styles.successText : styles.messageText}>
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

          <Text style={styles.detailLabel}>Ride ID</Text>
          <Text style={styles.detailText}>{assignedRide.id}</Text>

          <Text style={styles.detailLabel}>Rider</Text>
          <Text style={styles.detailText}>{assignedRide.riderName}</Text>
          <Text style={styles.detailText}>{assignedRide.riderPhone}</Text>

          <Text style={styles.detailLabel}>Pickup</Text>
          <Text style={styles.detailText}>
            {assignedRide.pickupLabel || assignedRide.pickupAddress || "-"}
          </Text>

          <Text style={styles.detailLabel}>Drop-off</Text>
          <Text style={styles.detailText}>
            {assignedRide.dropoffLabel || assignedRide.dropoffAddress || "-"}
          </Text>

          <Text style={styles.detailLabel}>Estimated Fare</Text>
          <Text style={styles.detailText}>
            K{assignedRide.estimatedFare ?? "-"}
          </Text>

          {assignedRide.vehicle ? (
            <>
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
  container: {
    padding: 16,
    backgroundColor: "#f8fafc",
    minHeight: "100%",
  },
  title: {
    marginTop: 24,
    marginBottom: 12,
    color: "#0f172a",
    fontSize: 26,
    fontWeight: "900",
    textAlign: "center",
  },
  subtitle: {
    marginBottom: 24,
    color: "#475569",
    fontSize: 16,
    lineHeight: 24,
    textAlign: "center",
  },
  label: {
    marginBottom: 6,
    color: "#334155",
    fontSize: 14,
    fontWeight: "700",
  },
  input: {
    marginBottom: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: "#ffffff",
    borderColor: "#cbd5e1",
    borderRadius: 12,
    borderWidth: 1,
    fontSize: 16,
  },
  button: {
    minHeight: 52,
    justifyContent: "center",
    marginBottom: 18,
    paddingVertical: 16,
    backgroundColor: "#16a34a",
    borderRadius: 14,
  },
  disabledButton: {
    backgroundColor: "#94a3b8",
  },
  buttonText: {
    color: "#ffffff",
    fontSize: 17,
    fontWeight: "800",
    textAlign: "center",
  },
  messageBox: {
    marginBottom: 20,
    padding: 16,
    backgroundColor: "#fee2e2",
    borderColor: "#fca5a5",
    borderRadius: 12,
    borderWidth: 1,
  },
  messageText: {
    color: "#991b1b",
    fontSize: 15,
    fontWeight: "600",
  },
  successBox: {
    marginBottom: 20,
    padding: 16,
    backgroundColor: "#dcfce7",
    borderColor: "#86efac",
    borderRadius: 12,
    borderWidth: 1,
  },
  successText: {
    color: "#166534",
    fontSize: 15,
    fontWeight: "700",
  },
  card: {
    marginBottom: 40,
    padding: 18,
    backgroundColor: "#ffffff",
    borderColor: "#e2e8f0",
    borderRadius: 16,
    borderWidth: 1,
  },
  cardTitle: {
    marginBottom: 10,
    color: "#0f172a",
    fontSize: 20,
    fontWeight: "900",
  },
  status: {
    marginBottom: 12,
    color: "#16a34a",
    fontSize: 24,
    fontWeight: "900",
  },
  detailLabel: {
    marginTop: 10,
    marginBottom: 4,
    color: "#334155",
    fontSize: 13,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  detailText: {
    marginBottom: 3,
    color: "#0f172a",
    fontSize: 16,
  },
  mobileNotice: {
    marginTop: 18,
    padding: 14,
    backgroundColor: "#e0f2fe",
    borderColor: "#7dd3fc",
    borderRadius: 10,
    borderWidth: 1,
  },
  mobileNoticeTitle: {
    marginBottom: 4,
    color: "#075985",
    fontSize: 14,
    fontWeight: "900",
  },
  mobileNoticeText: {
    color: "#075985",
    fontSize: 14,
    lineHeight: 20,
  },
});
