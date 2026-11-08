import { riderFetch } from "@/services/rider-auth";
import { router, useLocalSearchParams, type Href } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

type ReceiptResponse = {
  rideId: string;
  rideStatus: string;
  riderName: string;
  riderPhone: string;
  pickupLabel: string | null;
  pickupAddress: string | null;
  dropoffLabel: string | null;
  dropoffAddress: string | null;
  requestedAt: string;
  completedAt: string;
  driver: {
    id: string;
    fullName: string;
    phone: string;
  } | null;
  vehicle: {
    id: string;
    plateNumber: string;
    make: string;
    model: string;
    color: string;
  } | null;
  serviceZone: {
    id: string;
    name: string;
  } | null;
  settlement: {
    id: string;
    receiptNumber: string;
    finalFare: string | number;
    driverShare: string | number;
    companyShare: string | number;
    status: string;
    createdAt: string;
  };
};

export default function ReceiptScreen() {
  const params = useLocalSearchParams<{
    rideId?: string | string[];
  }>();

  const rideId = Array.isArray(params.rideId)
    ? params.rideId[0]
    : params.rideId;

  const [receipt, setReceipt] = useState<ReceiptResponse | null>(null);
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  const fetchReceipt = useCallback(async () => {
    if (!rideId?.trim()) {
      setReceipt(null);
      setMessage(
        "No completed ride was selected. Open the receipt from your completed ride status.",
      );
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setMessage("");

      const response = await riderFetch(
        `/rides/me/${encodeURIComponent(rideId.trim())}/settlement`,
      );

      const data = await response.json();

      if (!response.ok) {
        setReceipt(null);
        setMessage(
          data.message ||
            "Your receipt is not available yet. Please check again after the ride has been completed.",
        );
        return;
      }

      setReceipt(data);
    } catch {
      setReceipt(null);
      setMessage(
        "Could not load the receipt. Check your internet connection and Rider session.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [rideId]);

  useEffect(() => {
    fetchReceipt();
  }, [fetchReceipt]);

  function formatDate(value?: string) {
    if (!value) {
      return "Not available";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return value;
    }

    return date.toLocaleString();
  }

  function formatMoney(value: string | number) {
    const amount = Number(value);

    if (Number.isNaN(amount)) {
      return `K${value}`;
    }

    return `K${amount.toFixed(2)}`;
  }

  function formatStatus(value: string) {
    return value.replaceAll("_", " ");
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Ride Receipt</Text>

      {isLoading ? (
        <View style={styles.loadingCard}>
          <ActivityIndicator size="large" />

          <Text style={styles.loadingText}>Loading your receipt...</Text>
        </View>
      ) : null}

      {!isLoading && message ? (
        <View style={styles.messageBox}>
          <Text style={styles.messageText}>{message}</Text>

          {rideId ? (
            <TouchableOpacity style={styles.retryButton} onPress={fetchReceipt}>
              <Text style={styles.retryButtonText}>Try Again</Text>
            </TouchableOpacity>
          ) : null}

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => router.replace("/request-ride")}
          >
            <Text style={styles.secondaryButtonText}>
              Return to Ride Request
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {!isLoading && receipt ? (
        <View style={styles.card}>
          <Text style={styles.receiptTitle}>Joy Ride Receipt</Text>

          <Text style={styles.receiptNumber}>
            Receipt {receipt.settlement.receiptNumber}
          </Text>

          <View style={styles.divider} />

          <View style={styles.statusBadge}>
            <Text style={styles.status}>
              {formatStatus(receipt.rideStatus)}
            </Text>
          </View>

          <Text style={styles.sectionTitle}>Rider</Text>

          <Text style={styles.detailPrimary}>{receipt.riderName}</Text>

          <Text style={styles.detailSecondary}>{receipt.riderPhone}</Text>

          <View style={styles.divider} />

          <Text style={styles.detailLabel}>Pickup</Text>

          <Text style={styles.detailPrimary}>
            {receipt.pickupLabel || "Pickup location"}
          </Text>

          <Text style={styles.detailSecondary}>
            {receipt.pickupAddress || "Address unavailable"}
          </Text>

          <View style={styles.routeLine} />

          <Text style={styles.detailLabel}>Drop-off</Text>

          <Text style={styles.detailPrimary}>
            {receipt.dropoffLabel || "Drop-off location"}
          </Text>

          <Text style={styles.detailSecondary}>
            {receipt.dropoffAddress || "Address unavailable"}
          </Text>

          <View style={styles.divider} />

          {receipt.driver ? (
            <>
              <Text style={styles.sectionTitle}>Driver</Text>

              <Text style={styles.detailPrimary}>
                {receipt.driver.fullName}
              </Text>

              <Text style={styles.detailSecondary}>{receipt.driver.phone}</Text>
            </>
          ) : null}

          {receipt.vehicle ? (
            <>
              <Text style={styles.detailLabel}>Vehicle</Text>

              <Text style={styles.detailPrimary}>
                {receipt.vehicle.color} {receipt.vehicle.make}{" "}
                {receipt.vehicle.model}
              </Text>

              <Text style={styles.detailSecondary}>
                Plate: {receipt.vehicle.plateNumber}
              </Text>
            </>
          ) : null}

          {receipt.serviceZone ? (
            <>
              <Text style={styles.detailLabel}>Service Zone</Text>

              <Text style={styles.detailPrimary}>
                {receipt.serviceZone.name}
              </Text>
            </>
          ) : null}

          <View style={styles.divider} />

          <Text style={styles.sectionTitle}>Payment Summary</Text>

          <View style={styles.amountRow}>
            <Text style={styles.amountLabel}>Final Fare</Text>

            <Text style={styles.fareValue}>
              {formatMoney(receipt.settlement.finalFare)}
            </Text>
          </View>

          <View style={styles.amountRow}>
            <Text style={styles.amountLabel}>Settlement Status</Text>

            <Text style={styles.amountValue}>
              {formatStatus(receipt.settlement.status)}
            </Text>
          </View>

          <View style={styles.divider} />

          <Text style={styles.detailLabel}>Ride Requested</Text>

          <Text style={styles.detailSecondary}>
            {formatDate(receipt.requestedAt)}
          </Text>

          <Text style={styles.detailLabel}>Ride Completed</Text>

          <Text style={styles.detailSecondary}>
            {formatDate(receipt.completedAt)}
          </Text>

          {receipt.rideStatus === "COMPLETED" &&
          receipt.driver &&
          receipt.rideId === rideId?.trim() ? (
            <TouchableOpacity
              style={styles.retryButton}
              accessibilityRole="button"
              accessibilityLabel="Rate this ride"
              onPress={() =>
                router.push(
                  `/feedback?rideId=${encodeURIComponent(receipt.rideId)}` as Href,
                )
              }
            >
              <Text style={styles.retryButtonText}>
                Rate this ride / View feedback
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: 16,
    paddingTop: 48,
    backgroundColor: "#f8fafc",
  },

  title: {
    fontSize: 30,
    fontWeight: "900",
    color: "#0f172a",
    textAlign: "center",
  },

  subtitle: {
    marginTop: 8,
    marginBottom: 24,
    fontSize: 16,
    lineHeight: 23,
    color: "#64748b",
    textAlign: "center",
  },

  loadingCard: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 18,
    padding: 30,
  },

  loadingText: {
    marginTop: 14,
    fontSize: 15,
    fontWeight: "700",
    color: "#475569",
  },

  messageBox: {
    backgroundColor: "#fff7ed",
    borderWidth: 1,
    borderColor: "#fdba74",
    borderRadius: 16,
    padding: 18,
  },

  messageText: {
    color: "#9a3412",
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "700",
  },

  retryButton: {
    marginTop: 16,
    backgroundColor: "#2563eb",
    borderRadius: 12,
    paddingVertical: 13,
  },

  retryButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "800",
    textAlign: "center",
  },

  secondaryButton: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 12,
    paddingVertical: 13,
    backgroundColor: "#ffffff",
  },

  secondaryButtonText: {
    color: "#334155",
    fontSize: 15,
    fontWeight: "800",
    textAlign: "center",
  },

  card: {
    backgroundColor: "#ffffff",
    borderRadius: 18,
    padding: 20,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    marginBottom: 40,
  },

  receiptTitle: {
    fontSize: 24,
    fontWeight: "900",
    color: "#0f172a",
    textAlign: "center",
  },

  receiptNumber: {
    marginTop: 6,
    fontSize: 14,
    color: "#475569",
    textAlign: "center",
    fontWeight: "700",
  },

  divider: {
    height: 1,
    backgroundColor: "#e2e8f0",
    marginVertical: 18,
  },

  statusBadge: {
    alignSelf: "flex-start",
    backgroundColor: "#dcfce7",
    borderWidth: 1,
    borderColor: "#86efac",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 7,
    marginBottom: 8,
  },

  status: {
    fontSize: 14,
    fontWeight: "900",
    color: "#166534",
  },

  sectionTitle: {
    fontSize: 19,
    fontWeight: "900",
    color: "#0f172a",
    marginBottom: 8,
  },

  detailLabel: {
    marginTop: 12,
    marginBottom: 4,
    fontSize: 12,
    fontWeight: "900",
    color: "#64748b",
    letterSpacing: 0.7,
    textTransform: "uppercase",
  },

  detailPrimary: {
    fontSize: 17,
    lineHeight: 23,
    color: "#0f172a",
    fontWeight: "800",
  },

  detailSecondary: {
    marginTop: 2,
    fontSize: 15,
    lineHeight: 22,
    color: "#475569",
  },

  routeLine: {
    width: 3,
    height: 25,
    marginVertical: 5,
    marginLeft: 6,
    borderRadius: 10,
    backgroundColor: "#bfdbfe",
  },

  amountRow: {
    flexWrap: "wrap",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 14,
  },

  amountLabel: {
    flex: 1,
    fontSize: 16,
    color: "#334155",
    fontWeight: "700",
  },

  amountValue: {
    flexShrink: 1,
    fontSize: 16,
    color: "#0f172a",
    fontWeight: "900",
    textAlign: "right",
  },

  fareValue: {
    fontSize: 21,
    color: "#166534",
    fontWeight: "900",
  },

  footerNote: {
    marginTop: 24,
    textAlign: "center",
    color: "#475569",
    fontSize: 15,
    fontWeight: "700",
  },
});
