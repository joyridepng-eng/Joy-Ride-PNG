import { driverFetch } from "@/services/driver-auth";
import { useFocusEffect } from "expo-router";
import { useCallback, useState, useRef } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  AppState,
} from "react-native";

const PORT_MORESBY_OFFSET_MS = 10 * 60 * 60 * 1000;

type VehicleSummary = {
  id: string;
  plateNumber: string;
  make: string;
  model: string;
  color: string;
};

type DailyReceipt = {
  receiptNumber: string;
  rideId: string;
  completedAt: string;
  reconciliationStatus: string;
  reconciliationLabel: string;
  finalFare: number;
  driverOwnerShare: number;
  companyShare: number;
  driverSharePercent: number;
  companySharePercent: number;
  distanceKm: number | null;
  pickup: {
    label: string | null;
    address: string | null;
  };
  dropoff: {
    label: string | null;
    address: string | null;
  };
  vehicle: VehicleSummary | null;
};

type DailyStatement = {
  statementNumber: string;
  statementDate: string;
  timezone: string;
  statementStatus: "PROVISIONAL" | "FINAL";
  range: {
    from: string;
    toExclusive: string;
  };
  generatedAt: string;
  summary: {
    completedTrips: number;
    grossTakings: number;
    driverOwnerShare: number;
    companyShare: number;
    driverSharePercent: number;
    companySharePercent: number;
    pendingReconciliation: number;
    reconciled: number;
  };
  receipts: DailyReceipt[];
};

function getPortMoresbyDate(): string {
  return new Date(Date.now() + PORT_MORESBY_OFFSET_MS)
    .toISOString()
    .slice(0, 10);
}

function shiftDate(dateText: string, days: number): string {
  const date = new Date(`${dateText}T00:00:00.000Z`);

  date.setUTCDate(date.getUTCDate() + days);

  return date.toISOString().slice(0, 10);
}

function formatStatementDate(dateText: string): string {
  const date = new Date(`${dateText}T00:00:00.000Z`);

  return date.toLocaleDateString("en-PG", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

function formatPortMoresbyDateTime(value: string): string {
  const localDate = new Date(
    new Date(value).getTime() + PORT_MORESBY_OFFSET_MS,
  );

  return localDate.toLocaleString("en-PG", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

function formatMoney(value: number): string {
  return `K${Number(value).toFixed(2)}`;
}

function getLocationText(label: string | null, address: string | null): string {
  if (label && address && label !== address) {
    return `${label}\n${address}`;
  }

  return label || address || "Location unavailable";
}

function isDailyStatement(value: unknown): value is DailyStatement {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  if (!("summary" in value) || !("receipts" in value)) {
    return false;
  }

  return (
    typeof value.summary === "object" &&
    value.summary !== null &&
    Array.isArray(value.receipts)
  );
}

function getErrorMessage(value: unknown): string {
  if (typeof value === "object" && value !== null && "message" in value) {
    if (typeof value.message === "string") {
      return value.message;
    }

    if (
      Array.isArray(value.message) &&
      value.message.every((item) => typeof item === "string")
    ) {
      return value.message.join("\n");
    }
  }

  return "Could not load the Driver daily statement.";
}

export default function DailyTakingsScreen() {
  const [today, setToday] = useState(getPortMoresbyDate);
  const takingsDayRef = useRef(today);
  const takingsFocusedRef = useRef(false);
  const takingsRequestPendingRef = useRef(false);
  const takingsGenerationRef = useRef(0);

  const [selectedDate, setSelectedDate] = useState(today);
  const [statement, setStatement] = useState<DailyStatement | null>(null);
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const loadStatement = useCallback(async (dateText: string) => {
    if (!takingsFocusedRef.current || takingsRequestPendingRef.current) {
      return;
    }
    takingsRequestPendingRef.current = true;
    const requestGeneration = ++takingsGenerationRef.current;

    try {
      setIsLoading(true);
      setMessage("");

      const response = await driverFetch(
        `/driver-earnings/me/daily?date=${encodeURIComponent(dateText)}`,
      );

      const data: unknown = await response.json();
      if (
        !takingsFocusedRef.current ||
        requestGeneration !== takingsGenerationRef.current
      ) {
        return;
      }

      if (!response.ok) {
        setStatement(null);
        setMessage(getErrorMessage(data));
        return;
      }

      if (!isDailyStatement(data)) {
        setStatement(null);
        setMessage("The daily statement response was incomplete.");
        return;
      }

      setStatement(data);
    } catch {
      if (
        !takingsFocusedRef.current ||
        requestGeneration !== takingsGenerationRef.current
      ) {
        return;
      }

      setStatement(null);
      setMessage(
        "Could not load Daily Takings. Check your internet connection and Driver session.",
      );
    } finally {
      if (requestGeneration === takingsGenerationRef.current) {
        takingsRequestPendingRef.current = false;
        setIsLoading(false);
      }
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      let disposed = false;

      function invalidateRequest() {
        takingsGenerationRef.current += 1;
        takingsRequestPendingRef.current = false;
      }

      function refreshVisibleStatement() {
        if (disposed || !takingsFocusedRef.current) {
          return;
        }

        const currentDay = getPortMoresbyDate();
        const previousDay = takingsDayRef.current;

        if (currentDay !== previousDay) {
          takingsDayRef.current = currentDay;
          setToday(currentDay);

          if (selectedDate === previousDay) {
            invalidateRequest();
            setStatement(null);
            setIsLoading(false);
            setSelectedDate(currentDay);
            return;
          }
        }

        void loadStatement(selectedDate);
      }

      takingsFocusedRef.current =
        AppState.currentState !== "background" &&
        AppState.currentState !== "inactive";
      setStatement(null);
      setIsLoading(false);
      refreshVisibleStatement();

      const subscription = AppState.addEventListener("change", (state) => {
        const active = state === "active";
        const wasActive = takingsFocusedRef.current;
        takingsFocusedRef.current = active;

        if (!active) {
          invalidateRequest();
          setIsLoading(false);
        } else if (!wasActive) {
          refreshVisibleStatement();
        }
      });

      const timer = setInterval(refreshVisibleStatement, 15000);

      return () => {
        disposed = true;
        takingsFocusedRef.current = false;
        invalidateRequest();
        clearInterval(timer);
        subscription.remove();
      };
    }, [loadStatement, selectedDate]),
  );

  function changeDate(days: number) {
    const nextDate = shiftDate(selectedDate, days);

    if (nextDate > today) {
      return;
    }

    setSelectedDate(nextDate);
  }

  const isToday = selectedDate === today;

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={
        <RefreshControl
          refreshing={isLoading}
          onRefresh={() => void loadStatement(selectedDate)}
        />
      }
    >
      <Text style={styles.title}>Daily Takings</Text>

      <View style={styles.dateCard}>
        <TouchableOpacity
          style={styles.dateButton}
          onPress={() => changeDate(-1)}
          disabled={isLoading}
        >
          <Text style={styles.dateButtonText}>Previous Day</Text>
        </TouchableOpacity>

        <View style={styles.dateCenter}>
          <Text style={styles.dateText}>
            {formatStatementDate(selectedDate)}
          </Text>

          <Text style={styles.timezoneText}>Port Moresby time</Text>
        </View>

        <TouchableOpacity
          style={[
            styles.dateButton,
            isToday || isLoading ? styles.disabledButton : null,
          ]}
          onPress={() => changeDate(1)}
          disabled={isToday || isLoading}
        >
          <Text style={styles.dateButtonText}>Next Day</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={[styles.refreshButton, isLoading ? styles.disabledButton : null]}
        onPress={() => void loadStatement(selectedDate)}
        disabled={isLoading}
      >
        {isLoading ? (
          <ActivityIndicator color="#ffffff" />
        ) : (
          <Text style={styles.refreshButtonText}>Refresh</Text>
        )}
      </TouchableOpacity>

      {message ? (
        <View style={styles.messageBox}>
          <Text style={styles.messageText}>{message}</Text>
        </View>
      ) : null}

      {statement ? (
        <>
          <View style={styles.statementHeader}>
            <View>
              <Text style={styles.statementLabel}>Statement Number</Text>
              <Text style={styles.statementNumber}>
                {statement.statementNumber}
              </Text>
            </View>

            <View
              style={[
                styles.statusBadge,
                statement.statementStatus === "FINAL"
                  ? styles.finalBadge
                  : styles.provisionalBadge,
              ]}
            >
              <Text style={styles.statusBadgeText}>
                {statement.statementStatus === "FINAL"
                  ? "FINAL"
                  : "PROVISIONAL"}
              </Text>
            </View>
          </View>

          <View style={styles.summaryCard}>
            <Text style={styles.sectionTitle}>Daily Summary</Text>

            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Completed Trips</Text>
              <Text style={styles.summaryValue}>
                {statement.summary.completedTrips}
              </Text>
            </View>

            <View style={styles.divider} />

            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Total Takings</Text>
              <Text style={styles.grossValue}>
                {formatMoney(statement.summary.grossTakings)}
              </Text>
            </View>

            <View style={styles.driverShareBox}>
              <View>
                <Text style={styles.shareTitle}>
                  Driver / Vehicle Owner Share
                </Text>
                <Text style={styles.sharePercent}>
                  {statement.summary.driverSharePercent}%
                </Text>
              </View>

              <Text style={styles.driverShareValue}>
                {formatMoney(statement.summary.driverOwnerShare)}
              </Text>
            </View>

            <View style={styles.companyShareBox}>
              <View>
                <Text style={styles.companyShareTitle}>
                  Joy Ride Company Share
                </Text>
                <Text style={styles.companySharePercent}>
                  {statement.summary.companySharePercent}%
                </Text>
              </View>

              <Text style={styles.companyShareValue}>
                {formatMoney(statement.summary.companyShare)}
              </Text>
            </View>

            <View style={styles.reconciliationRow}>
              <Text style={styles.reconciliationText}>
                Pending: {statement.summary.pendingReconciliation}
              </Text>

              <Text style={styles.reconciliationText}>
                Reconciled: {statement.summary.reconciled}
              </Text>
            </View>
          </View>

          <Text style={styles.sectionTitle}>Trip Receipts</Text>

          {statement.receipts.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>No completed trips</Text>
              <Text style={styles.emptyText}>
                No completed rides for this date.
              </Text>
            </View>
          ) : (
            statement.receipts.map((receipt) => (
              <View key={receipt.receiptNumber} style={styles.receiptCard}>
                <View style={styles.receiptHeader}>
                  <View style={styles.receiptHeaderText}>
                    <Text style={styles.receiptNumber}>
                      {receipt.receiptNumber}
                    </Text>
                    <Text style={styles.completedTime}>
                      {formatPortMoresbyDateTime(receipt.completedAt)}
                    </Text>
                  </View>

                  <Text
                    style={[
                      styles.reconciliationBadge,
                      receipt.reconciliationStatus === "PAID"
                        ? styles.reconciledBadge
                        : styles.pendingBadge,
                    ]}
                  >
                    {receipt.reconciliationLabel}
                  </Text>
                </View>

                <Text style={styles.locationLabel}>Pickup</Text>
                <Text style={styles.locationText}>
                  {getLocationText(
                    receipt.pickup.label,
                    receipt.pickup.address,
                  )}
                </Text>

                <Text style={styles.locationLabel}>Drop-off</Text>
                <Text style={styles.locationText}>
                  {getLocationText(
                    receipt.dropoff.label,
                    receipt.dropoff.address,
                  )}
                </Text>

                {receipt.vehicle ? (
                  <>
                    <Text style={styles.locationLabel}>Vehicle</Text>
                    <Text style={styles.locationText}>
                      {receipt.vehicle.color} {receipt.vehicle.make}{" "}
                      {receipt.vehicle.model} · {receipt.vehicle.plateNumber}
                    </Text>
                  </>
                ) : null}

                <View style={styles.receiptDivider} />

                <View style={styles.moneyRow}>
                  <Text style={styles.moneyLabel}>Trip Fare</Text>
                  <Text style={styles.moneyValue}>
                    {formatMoney(receipt.finalFare)}
                  </Text>
                </View>

                <View style={styles.moneyRow}>
                  <Text style={styles.driverMoneyLabel}>
                    Driver / Owner ({receipt.driverSharePercent}%)
                  </Text>
                  <Text style={styles.driverMoneyValue}>
                    {formatMoney(receipt.driverOwnerShare)}
                  </Text>
                </View>

                <View style={styles.moneyRow}>
                  <Text style={styles.companyMoneyLabel}>
                    Joy Ride ({receipt.companySharePercent}%)
                  </Text>
                  <Text style={styles.companyMoneyValue}>
                    {formatMoney(receipt.companyShare)}
                  </Text>
                </View>

                <Text style={styles.distanceText}>
                  Distance:{" "}
                  {receipt.distanceKm === null
                    ? "Unavailable"
                    : `${receipt.distanceKm.toFixed(2)} km`}
                </Text>
              </View>
            ))
          )}
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: 20,
    paddingTop: 42,
    paddingBottom: 48,
    backgroundColor: "#f8fafc",
  },
  title: {
    color: "#0f172a",
    fontSize: 30,
    fontWeight: "900",
  },
  subtitle: {
    color: "#475569",
    fontSize: 15,
    lineHeight: 22,
    marginTop: 6,
    marginBottom: 18,
  },
  dateCard: {
    backgroundColor: "#ffffff",
    borderColor: "#cbd5e1",
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
    gap: 10,
  },
  dateCenter: {
    alignItems: "center",
  },
  dateText: {
    color: "#0f172a",
    fontSize: 17,
    fontWeight: "800",
    textAlign: "center",
  },
  timezoneText: {
    color: "#64748b",
    fontSize: 12,
    marginTop: 3,
  },
  dateButton: {
    minHeight: 48,
    justifyContent: "center",
    backgroundColor: "#e2e8f0",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: "center",
  },
  dateButtonText: {
    color: "#1e293b",
    fontWeight: "800",
  },
  refreshButton: {
    backgroundColor: "#0f766e",
    borderRadius: 12,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    marginBottom: 14,
  },
  refreshButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "900",
  },
  disabledButton: {
    opacity: 0.45,
  },
  messageBox: {
    backgroundColor: "#fff7ed",
    borderColor: "#fdba74",
    borderWidth: 1,
    borderRadius: 12,
    padding: 13,
    marginBottom: 14,
  },
  messageText: {
    color: "#9a3412",
    lineHeight: 20,
  },
  statementHeader: {
    backgroundColor: "#ffffff",
    borderColor: "#cbd5e1",
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
    gap: 12,
  },
  statementLabel: {
    color: "#64748b",
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  statementNumber: {
    color: "#0f172a",
    fontSize: 14,
    fontWeight: "800",
    marginTop: 4,
  },
  statusBadge: {
    alignSelf: "flex-start",
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  provisionalBadge: {
    backgroundColor: "#fef3c7",
  },
  finalBadge: {
    backgroundColor: "#dcfce7",
  },
  statusBadgeText: {
    color: "#334155",
    fontSize: 12,
    fontWeight: "900",
  },
  summaryCard: {
    backgroundColor: "#ffffff",
    borderColor: "#cbd5e1",
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
  },
  sectionTitle: {
    color: "#0f172a",
    fontSize: 19,
    fontWeight: "900",
    marginBottom: 12,
  },
  summaryRow: {
    flexWrap: "wrap",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  summaryLabel: {
    flexShrink: 1,
    color: "#475569",
    fontSize: 15,
    fontWeight: "700",
  },
  summaryValue: {
    color: "#0f172a",
    fontSize: 22,
    fontWeight: "900",
  },
  grossValue: {
    color: "#0f172a",
    fontSize: 25,
    fontWeight: "900",
  },
  divider: {
    height: 1,
    backgroundColor: "#e2e8f0",
    marginVertical: 13,
  },
  driverShareBox: {
    flexWrap: "wrap",
    backgroundColor: "#ecfdf5",
    borderColor: "#6ee7b7",
    borderWidth: 1,
    borderRadius: 12,
    padding: 13,
    marginTop: 15,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  shareTitle: {
    flexShrink: 1,
    color: "#065f46",
    fontSize: 14,
    fontWeight: "800",
  },
  sharePercent: {
    color: "#047857",
    marginTop: 3,
    fontWeight: "700",
  },
  driverShareValue: {
    color: "#047857",
    fontSize: 22,
    fontWeight: "900",
  },
  companyShareBox: {
    flexWrap: "wrap",
    backgroundColor: "#eff6ff",
    borderColor: "#93c5fd",
    borderWidth: 1,
    borderRadius: 12,
    padding: 13,
    marginTop: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  companyShareTitle: {
    flexShrink: 1,
    color: "#1e40af",
    fontSize: 14,
    fontWeight: "800",
  },
  companySharePercent: {
    color: "#2563eb",
    marginTop: 3,
    fontWeight: "700",
  },
  companyShareValue: {
    color: "#1d4ed8",
    fontSize: 22,
    fontWeight: "900",
  },
  reconciliationRow: {
    flexWrap: "wrap",
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    marginTop: 14,
  },
  reconciliationText: {
    color: "#475569",
    fontSize: 14,
    fontWeight: "700",
  },
  emptyCard: {
    backgroundColor: "#ffffff",
    borderColor: "#cbd5e1",
    borderWidth: 1,
    borderRadius: 14,
    padding: 20,
    marginBottom: 16,
  },
  emptyTitle: {
    color: "#0f172a",
    fontSize: 17,
    fontWeight: "900",
    textAlign: "center",
  },
  emptyText: {
    color: "#64748b",
    lineHeight: 20,
    textAlign: "center",
    marginTop: 6,
  },
  receiptCard: {
    backgroundColor: "#ffffff",
    borderColor: "#cbd5e1",
    borderWidth: 1,
    borderRadius: 14,
    padding: 15,
    marginBottom: 13,
  },
  receiptHeader: {
    marginBottom: 13,
    gap: 9,
  },
  receiptHeaderText: {
    gap: 3,
  },
  receiptNumber: {
    color: "#0f172a",
    fontSize: 15,
    fontWeight: "900",
  },
  completedTime: {
    color: "#64748b",
    fontSize: 14,
  },
  reconciliationBadge: {
    alignSelf: "flex-start",
    borderRadius: 999,
    overflow: "hidden",
    paddingVertical: 5,
    paddingHorizontal: 9,
    fontSize: 11,
    fontWeight: "900",
  },
  reconciledBadge: {
    color: "#166534",
    backgroundColor: "#dcfce7",
  },
  pendingBadge: {
    color: "#92400e",
    backgroundColor: "#fef3c7",
  },
  locationLabel: {
    color: "#64748b",
    fontSize: 14,
    fontWeight: "900",
    textTransform: "uppercase",
    marginTop: 8,
  },
  locationText: {
    color: "#1e293b",
    fontSize: 14,
    lineHeight: 20,
    marginTop: 3,
  },
  receiptDivider: {
    height: 1,
    backgroundColor: "#e2e8f0",
    marginVertical: 13,
  },
  moneyRow: {
    flexWrap: "wrap",
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 8,
  },
  moneyLabel: {
    fontSize: 15,
    flexShrink: 1,
    color: "#334155",
    fontWeight: "800",
  },
  moneyValue: {
    fontSize: 15,
    color: "#0f172a",
    fontWeight: "900",
  },
  driverMoneyLabel: {
    fontSize: 15,
    flexShrink: 1,
    color: "#047857",
    fontWeight: "800",
  },
  driverMoneyValue: {
    fontSize: 15,
    color: "#047857",
    fontWeight: "900",
  },
  companyMoneyLabel: {
    fontSize: 15,
    flexShrink: 1,
    color: "#1d4ed8",
    fontWeight: "800",
  },
  companyMoneyValue: {
    fontSize: 15,
    color: "#1d4ed8",
    fontWeight: "900",
  },
  distanceText: {
    color: "#64748b",
    fontSize: 12,
    marginTop: 7,
  },
  footerNote: {
    color: "#64748b",
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
    marginTop: 10,
  },
});
