import SettlementPrintButton from "@/components/settlement-print-button";
import { useAdminAuth } from "@/contexts/admin-auth-context";
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
    createdAt?: string;
    updatedAt?: string;
  } | null;
};

export default function SettlementsScreen() {
  const { session, isLoading: isAuthLoading } = useAdminAuth();
  const canMarkPaid =
    !isAuthLoading && session?.admin.role === "SUPER_ADMIN";
  const [settledRides, setSettledRides] = useState<Ride[]>([]);
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [markingPaidRideId, setMarkingPaidRideId] = useState<string | null>(
    null,
  );

  async function loadSettlements() {
    try {
      setIsLoading(true);
      setMessage("");
      setSettledRides([]);

      const response = await adminFetch(`/rides`);
      const data = await response.json();

      if (!response.ok) {
        setMessage(data.message || "Could not load settlements.");
        return;
      }

      const rides = Array.isArray(data) ? data : [];

      const completedWithSettlements = rides.filter(
        (ride: Ride) => ride.status === "COMPLETED" && ride.settlement,
      );

      setSettledRides(completedWithSettlements);

      if (completedWithSettlements.length === 0) {
        setMessage("No completed ride settlements found.");
      }
    } catch {
      setMessage(
        `Could not connect to the backend. Make sure the backend server is running on .`,
      );
    } finally {
      setIsLoading(false);
    }
  }

  async function markSettlementPaid(rideId: string) {
    if (!canMarkPaid) {
      setMessage("Only super administrators can mark settlements paid.");
      return;
    }
    try {
      setMarkingPaidRideId(rideId);
      setMessage("");

      const response = await adminFetch(`/rides/${rideId}/settlement/paid`, {
        method: "PATCH",
      });

      const data = await response.json();

      if (!response.ok) {
        setMessage(data.message || "Could not mark settlement as paid.");
        return;
      }

      setSettledRides((currentRides) =>
        currentRides.map((ride) => (ride.id === rideId ? data : ride)),
      );

      setMessage("Settlement marked as PAID.");
    } catch {
      setMessage(
        `Could not connect to the backend. Make sure the backend server is running on .`,
      );
    } finally {
      setMarkingPaidRideId(null);
    }
  }

  function getTotalCompanyShare() {
    return settledRides.reduce((total, ride) => {
      const companyShare = Number(ride.settlement?.companyShare ?? 0);
      return total + companyShare;
    }, 0);
  }

  function getTotalDriverShare() {
    return settledRides.reduce((total, ride) => {
      const driverShare = Number(ride.settlement?.driverShare ?? 0);
      return total + driverShare;
    }, 0);
  }

  function getTotalFinalFare() {
    return settledRides.reduce((total, ride) => {
      const finalFare = Number(ride.settlement?.finalFare ?? 0);
      return total + finalFare;
    }, 0);
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Settlements</Text>

      <Text style={styles.subtitle}>
        Review completed ride receipts and fare shares.
      </Text>

      <TouchableOpacity
        style={[styles.primaryButton, isLoading ? styles.disabledButton : null]}
        onPress={loadSettlements}
        disabled={isLoading}
      >
        <Text style={styles.primaryButtonText}>
          {isLoading ? "Loading..." : "Load Settlements"}
        </Text>
      </TouchableOpacity>

      {message ? (
        <View
          style={
            settledRides.length > 0
              ? styles.successMessageBox
              : styles.messageBox
          }
        >
          <Text
            style={
              settledRides.length > 0
                ? styles.successMessageText
                : styles.messageText
            }
          >
            {message}
          </Text>
        </View>
      ) : null}

      {settledRides.length > 0 ? (
        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>Settlement Summary</Text>

          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Completed Receipts</Text>
            <Text style={styles.summaryValue}>{settledRides.length}</Text>
          </View>

          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Total Final Fare</Text>
            <Text style={styles.summaryValue}>K{getTotalFinalFare()}</Text>
          </View>

          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Total Driver Share</Text>
            <Text style={styles.summaryValue}>K{getTotalDriverShare()}</Text>
          </View>

          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Total Company Share</Text>
            <Text style={styles.summaryValue}>K{getTotalCompanyShare()}</Text>
          </View>
        </View>
      ) : null}

      {settledRides.map((ride) => (
        <View key={ride.id} style={styles.card}>
          <Text style={styles.cardTitle}>Completed Settlement</Text>

          <Text
            style={
              ride.settlement?.status === "PAID"
                ? styles.paidStatus
                : styles.pendingStatus
            }
          >
            {ride.settlement?.status}
          </Text>


<View style={{
  flexDirection: "row", flexWrap: "wrap", gap: 8,
  alignItems: "center",
}}>
  {canMarkPaid && ride.settlement?.status === "PENDING" ? (
            <TouchableOpacity
              style={[
                styles.markPaidButton,
                markingPaidRideId === ride.id ? styles.disabledButton : null,
              ]}
              onPress={() => markSettlementPaid(ride.id)}
              disabled={markingPaidRideId === ride.id}
            >
              <Text style={styles.markPaidButtonText}>
                {markingPaidRideId === ride.id
                  ? "Marking Paid..."
                  : "Mark Paid"}
              </Text>
            </TouchableOpacity>
          ) : null}
  <SettlementPrintButton
    ride={ride}
    disabled={markingPaidRideId !== null}
    onError={() => setMessage(
      "Unable to open printing. On web, allow the receipt window and try again."
    )}
  />
</View>

          <View style={styles.divider} />

          <Text style={styles.detailLabel}>Receipt Number</Text>
          <Text style={styles.receiptText}>
            {ride.settlement?.receiptNumber}
          </Text>

          <Text style={styles.detailLabel}>Ride ID</Text>
          <Text style={styles.detailText}>{ride.id}</Text>

          <Text style={styles.detailLabel}>Rider</Text>
          <Text style={styles.detailText}>{ride.riderName}</Text>
          <Text style={styles.detailText}>{ride.riderPhone}</Text>

          <Text style={styles.detailLabel}>Driver</Text>
          <Text style={styles.detailText}>
            {ride.driver?.fullName ?? "No driver shown"}
          </Text>
          <Text style={styles.detailText}>{ride.driver?.phone ?? "-"}</Text>

          <Text style={styles.detailLabel}>Vehicle</Text>
          <Text style={styles.detailText}>
            {ride.vehicle
              ? `${ride.vehicle.color} ${ride.vehicle.make} ${ride.vehicle.model}`
              : "No vehicle shown"}
          </Text>
          <Text style={styles.detailText}>
            Plate: {ride.vehicle?.plateNumber ?? "-"}
          </Text>

          <Text style={styles.detailLabel}>Route</Text>
          <Text style={styles.detailText}>From: {ride.pickupLabel}</Text>
          <Text style={styles.detailText}>To: {ride.dropoffLabel}</Text>

          <View style={styles.divider} />

          <View style={styles.moneyRow}>
            <Text style={styles.moneyLabel}>Final Fare</Text>
            <Text style={styles.moneyValue}>K{ride.settlement?.finalFare}</Text>
          </View>

          <View style={styles.moneyRow}>
            <Text style={styles.moneyLabel}>Driver Share</Text>
            <Text style={styles.moneyValue}>
              K{ride.settlement?.driverShare}
            </Text>
          </View>

          <View style={styles.moneyRow}>
            <Text style={styles.moneyLabel}>Company Share</Text>
            <Text style={styles.moneyValue}>
              K{ride.settlement?.companyShare}
            </Text>
          </View>

          <Text style={styles.detailLabel}>Completed At</Text>
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
  markPaidButton: {
    backgroundColor: "#16a34a",
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 12,
  },
  markPaidButtonText: {
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
  summaryCard: {
    backgroundColor: "#ede9fe",
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: "#c4b5fd",
    marginBottom: 18,
  },
  summaryTitle: {
    fontSize: 20,
    fontWeight: "900",
    color: "#4c1d95",
    marginBottom: 14,
    textAlign: "center",
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 10,
  },
  summaryLabel: {
    fontSize: 15,
    color: "#4c1d95",
    fontWeight: "700",
  },
  summaryValue: {
    fontSize: 15,
    color: "#4c1d95",
    fontWeight: "900",
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
  pendingStatus: {
    fontSize: 24,
    fontWeight: "900",
    color: "#f59e0b",
    marginBottom: 6,
  },
  paidStatus: {
    fontSize: 24,
    fontWeight: "900",
    color: "#16a34a",
    marginBottom: 6,
  },
  receiptText: {
    fontSize: 18,
    color: "#7c3aed",
    fontWeight: "900",
    marginBottom: 3,
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
  moneyRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 10,
  },
  moneyLabel: {
    fontSize: 16,
    color: "#334155",
    fontWeight: "800",
  },
  moneyValue: {
    fontSize: 16,
    color: "#0f172a",
    fontWeight: "900",
  },
});
