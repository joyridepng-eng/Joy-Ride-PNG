import { adminFetch } from "@/services/admin-auth";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

type AuditPeriod = "daily" | "weekly" | "monthly";

type AuditSummary = {
  totalTrips: number;
  completedTrips: number;
  cancelledTrips: number;
  drivers: number;
  grossFare: number;
  driverShare: number;
  companyShare: number;
  knownDistanceKm: number;
  tripsWithoutDistance: number;
  approximateHistoricalTrips: number;
};

type DriverSummary = {
  driverId: string;
  driverName: string;
  driverPhone: string;
  vehiclePlate: string | null;
  trips: number;
  completed: number;
  cancelled: number;
  completionRate: number;
  grossFare: number;
  driverShare: number;
  companyShare: number;
  knownDistanceKm: number;
  tripsWithoutDistance: number;
};

type AuditTrip = {
  rideId: string;
  status: string;
  rideType: string;
  requestedAt: string;
  assignedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
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
  rider: {
    fullName: string;
    maskedPhone: string | null;
  };
  pickup: {
    label: string | null;
    address: string | null;
  };
  dropoff: {
    label: string | null;
    address: string | null;
  };
  quotedDistanceKm: number | null;
  farePolicyVersion: string | null;
  estimatedFare: number | null;
  finalFare: number;
  settlement: {
    receiptNumber: string;
    status: string;
    driverShare: number;
    companyShare: number;
  } | null;
  containsApproximateHistory: boolean;
};

type AuditReport = {
  period: AuditPeriod;
  timezone: string;
  range: {
    from: string;
    toExclusive: string;
  };
  generatedAt: string;
  summary: AuditSummary;
  drivers: DriverSummary[];
  trips: AuditTrip[];
};

const PERIODS: {
  value: AuditPeriod;
  label: string;
}[] = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
];

function money(value: number): string {
  return `K${Number(value || 0).toFixed(2)}`;
}

function dateTime(value: string | null): string {
  if (!value) {
    return "-";
  }

  return new Date(value).toLocaleString("en-PG", {
    timeZone: "Pacific/Port_Moresby",
  });
}

function rangeDate(value: string): string {
  return new Date(value).toLocaleDateString("en-PG", {
    timeZone: "Pacific/Port_Moresby",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function shiftAnchor(
  current: Date,
  period: AuditPeriod,
  direction: number,
): Date {
  const next = new Date(current);

  if (period === "daily") {
    next.setUTCDate(next.getUTCDate() + direction);
  } else if (period === "weekly") {
    next.setUTCDate(next.getUTCDate() + direction * 7);
  } else {
    next.setUTCMonth(next.getUTCMonth() + direction);
  }

  return next;
}

export default function TripAuditScreen() {
  const [period, setPeriod] = useState<AuditPeriod>("daily");
  const [anchor, setAnchor] = useState(() => new Date());
  const [report, setReport] = useState<AuditReport | null>(null);
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState("");

  const loadReport = useCallback(async () => {
    try {
      setIsLoading(true);
      setMessage("");

      const parameters = [
        `period=${encodeURIComponent(period)}`,
        `anchor=${encodeURIComponent(anchor.toISOString())}`,
      ];

      if (selectedDriverId) {
        parameters.push(`driverId=${encodeURIComponent(selectedDriverId)}`);
      }

      const response = await adminFetch(`/trip-audit?${parameters.join("&")}`);

      const data = await response.json();

      if (!response.ok) {
        setReport(null);
        setMessage(data?.message || "Could not load the Trip Audit report.");
        return;
      }

      setReport(data as AuditReport);
    } catch {
      setReport(null);
      setMessage("Could not connect to the Trip Audit service.");
    } finally {
      setIsLoading(false);
    }
  }, [anchor, period, selectedDriverId]);

  useEffect(() => {
    void loadReport();
  }, [loadReport]);

  function selectPeriod(nextPeriod: AuditPeriod): void {
    setPeriod(nextPeriod);
    setAnchor(new Date());
    setSelectedDriverId(null);
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Trip Audit & Reports</Text>

      <Text style={styles.subtitle}>
        Review Driver trip activity, distances, fares, receipts, and settlement
        shares using Port Moresby reporting periods.
      </Text>

      <View style={styles.periodRow}>
        {PERIODS.map((item) => (
          <TouchableOpacity
            key={item.value}
            style={[
              styles.periodButton,
              period === item.value && styles.periodButtonActive,
            ]}
            onPress={() => selectPeriod(item.value)}
          >
            <Text
              style={[
                styles.periodButtonText,
                period === item.value && styles.periodButtonTextActive,
              ]}
            >
              {item.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.navigationRow}>
        <TouchableOpacity
          style={styles.navigationButton}
          onPress={() =>
            setAnchor((current) => shiftAnchor(current, period, -1))
          }
        >
          <Text style={styles.navigationButtonText}>Previous</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.todayButton}
          onPress={() => setAnchor(new Date())}
        >
          <Text style={styles.todayButtonText}>Current Period</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.navigationButton}
          onPress={() =>
            setAnchor((current) => shiftAnchor(current, period, 1))
          }
        >
          <Text style={styles.navigationButtonText}>Next</Text>
        </TouchableOpacity>
      </View>

      {selectedDriverId ? (
        <View style={styles.filterNotice}>
          <Text style={styles.filterNoticeText}>
            Report filtered to one Driver.
          </Text>

          <TouchableOpacity onPress={() => setSelectedDriverId(null)}>
            <Text style={styles.clearFilterText}>Show all Drivers</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <TouchableOpacity
        disabled={isLoading}
        onPress={() => void loadReport()}
        style={[styles.refreshButton, isLoading && styles.disabledButton]}
      >
        {isLoading ? (
          <ActivityIndicator color="#ffffff" />
        ) : (
          <Text style={styles.refreshButtonText}>Refresh Audit Report</Text>
        )}
      </TouchableOpacity>

      {message ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{message}</Text>
        </View>
      ) : null}

      {report ? (
        <>
          <View style={styles.rangeCard}>
            <Text style={styles.rangeTitle}>
              {rangeDate(report.range.from)} to{" "}
              {rangeDate(report.range.toExclusive)}
            </Text>

            <Text style={styles.rangeText}>
              Port Moresby time Â· Generated {dateTime(report.generatedAt)}
            </Text>
          </View>

          {report.summary.approximateHistoricalTrips > 0 ? (
            <View style={styles.warningBox}>
              <Text style={styles.warningTitle}>Historical data notice</Text>
              <Text style={styles.warningText}>
                {report.summary.approximateHistoricalTrips} trip record(s)
                contain approximate timestamps imported from records created
                before the audit ledger was introduced.
              </Text>
            </View>
          ) : null}

          <View style={styles.summaryGrid}>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Total Trips</Text>
              <Text style={styles.summaryValue}>
                {report.summary.totalTrips}
              </Text>
            </View>

            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Completed</Text>
              <Text style={styles.summaryValue}>
                {report.summary.completedTrips}
              </Text>
            </View>

            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Cancelled</Text>
              <Text style={styles.summaryValue}>
                {report.summary.cancelledTrips}
              </Text>
            </View>

            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Drivers</Text>
              <Text style={styles.summaryValue}>{report.summary.drivers}</Text>
            </View>
          </View>

          <View style={styles.financeCard}>
            <Text style={styles.sectionTitle}>Financial Summary</Text>

            <View style={styles.dataRow}>
              <Text style={styles.dataLabel}>Gross completed fares</Text>
              <Text style={styles.moneyValue}>
                {money(report.summary.grossFare)}
              </Text>
            </View>

            <View style={styles.dataRow}>
              <Text style={styles.dataLabel}>Driver shares</Text>
              <Text style={styles.moneyValue}>
                {money(report.summary.driverShare)}
              </Text>
            </View>

            <View style={styles.dataRow}>
              <Text style={styles.dataLabel}>Company shares</Text>
              <Text style={styles.moneyValue}>
                {money(report.summary.companyShare)}
              </Text>
            </View>

            <View style={styles.dataRow}>
              <Text style={styles.dataLabel}>Known trip distance</Text>
              <Text style={styles.dataValue}>
                {report.summary.knownDistanceKm.toFixed(2)} km
              </Text>
            </View>

            <View style={styles.dataRow}>
              <Text style={styles.dataLabel}>Trips missing distance</Text>
              <Text style={styles.dataValue}>
                {report.summary.tripsWithoutDistance}
              </Text>
            </View>
          </View>

          <Text style={styles.sectionHeading}>Driver Summaries</Text>

          {report.drivers.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyText}>
                No Driver trip records were found for this period.
              </Text>
            </View>
          ) : (
            report.drivers.map((driver) => (
              <TouchableOpacity
                key={driver.driverId}
                style={styles.driverCard}
                onPress={() => setSelectedDriverId(driver.driverId)}
              >
                <Text style={styles.driverName}>{driver.driverName}</Text>
                <Text style={styles.driverMeta}>
                  {driver.driverPhone} Â· Plate {driver.vehiclePlate ?? "-"}
                </Text>

                <View style={styles.divider} />

                <Text style={styles.driverMetric}>
                  Trips: {driver.trips} Â· Completed: {driver.completed} Â·
                  Cancelled: {driver.cancelled}
                </Text>

                <Text style={styles.driverMetric}>
                  Completion rate: {driver.completionRate.toFixed(1)}%
                </Text>

                <Text style={styles.driverMetric}>
                  Gross: {money(driver.grossFare)} Â· Driver share:{" "}
                  {money(driver.driverShare)}
                </Text>

                <Text style={styles.driverMetric}>
                  Known distance: {driver.knownDistanceKm.toFixed(2)} km
                </Text>

                <Text style={styles.filterHint}>
                  Tap to filter this report to the Driver
                </Text>
              </TouchableOpacity>
            ))
          )}

          <Text style={styles.sectionHeading}>Trip Records</Text>

          {report.trips.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyText}>
                No trip records were found for this reporting period.
              </Text>
            </View>
          ) : (
            report.trips.map((trip) => (
              <View key={trip.rideId} style={styles.tripCard}>
                <View style={styles.tripHeader}>
                  <Text style={styles.tripTitle}>Trip Record</Text>
                  <Text style={styles.status}>{trip.status}</Text>
                </View>

                {trip.containsApproximateHistory ? (
                  <Text style={styles.approximateBadge}>
                    APPROXIMATE HISTORICAL RECORD
                  </Text>
                ) : null}

                <Text style={styles.detailLabel}>Ride ID</Text>
                <Text selectable style={styles.detailText}>
                  {trip.rideId}
                </Text>

                <Text style={styles.detailLabel}>Driver / Vehicle</Text>
                <Text style={styles.detailText}>
                  {trip.driver?.fullName ?? "No Driver assigned"}
                </Text>
                <Text style={styles.detailText}>
                  Plate: {trip.vehicle?.plateNumber ?? "-"}
                </Text>

                <Text style={styles.detailLabel}>Rider</Text>
                <Text style={styles.detailText}>
                  {trip.rider.fullName} Â· {trip.rider.maskedPhone ?? "-"}
                </Text>

                <Text style={styles.detailLabel}>Route</Text>
                <Text style={styles.detailText}>
                  From: {trip.pickup.label || trip.pickup.address || "-"}
                </Text>
                <Text style={styles.detailText}>
                  To: {trip.dropoff.label || trip.dropoff.address || "-"}
                </Text>

                <Text style={styles.detailLabel}>Distance / Fare</Text>
                <Text style={styles.detailText}>
                  Distance:{" "}
                  {trip.quotedDistanceKm === null
                    ? "Not recorded"
                    : `${trip.quotedDistanceKm.toFixed(2)} km`}
                </Text>
                <Text style={styles.detailText}>
                  Estimated: {money(Number(trip.estimatedFare ?? 0))} Â· Final:{" "}
                  {money(trip.finalFare)}
                </Text>

                <Text style={styles.detailLabel}>Timeline</Text>
                <Text style={styles.detailText}>
                  Requested: {dateTime(trip.requestedAt)}
                </Text>
                <Text style={styles.detailText}>
                  Assigned: {dateTime(trip.assignedAt)}
                </Text>
                <Text style={styles.detailText}>
                  Completed: {dateTime(trip.completedAt)}
                </Text>
                <Text style={styles.detailText}>
                  Cancelled: {dateTime(trip.cancelledAt)}
                </Text>

                {trip.settlement ? (
                  <>
                    <Text style={styles.detailLabel}>Receipt / Settlement</Text>
                    <Text style={styles.receiptText}>
                      {trip.settlement.receiptNumber}
                    </Text>
                    <Text style={styles.detailText}>
                      {trip.settlement.status} Â· Driver{" "}
                      {money(trip.settlement.driverShare)} Â· Company{" "}
                      {money(trip.settlement.companyShare)}
                    </Text>
                  </>
                ) : null}
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
    padding: 20,
    paddingTop: 44,
    paddingBottom: 48,
    backgroundColor: "#f8fafc",
  },
  title: {
    fontSize: 30,
    fontWeight: "900",
    color: "#0f172a",
    textAlign: "center",
    marginBottom: 10,
  },
  subtitle: {
    color: "#475569",
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
    marginBottom: 20,
  },
  periodRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  periodButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#ffffff",
  },
  periodButtonActive: {
    backgroundColor: "#7c3aed",
    borderColor: "#7c3aed",
  },
  periodButtonText: {
    textAlign: "center",
    color: "#334155",
    fontWeight: "800",
  },
  periodButtonTextActive: {
    color: "#ffffff",
  },
  navigationRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 14,
  },
  navigationButton: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 11,
    backgroundColor: "#e2e8f0",
  },
  navigationButtonText: {
    color: "#334155",
    textAlign: "center",
    fontWeight: "800",
  },
  todayButton: {
    flex: 1.3,
    borderRadius: 10,
    paddingVertical: 11,
    backgroundColor: "#ede9fe",
  },
  todayButtonText: {
    color: "#5b21b6",
    textAlign: "center",
    fontWeight: "800",
  },
  refreshButton: {
    minHeight: 50,
    borderRadius: 13,
    backgroundColor: "#7c3aed",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  refreshButtonText: {
    color: "#ffffff",
    fontWeight: "900",
    fontSize: 16,
  },
  disabledButton: {
    opacity: 0.65,
  },
  filterNotice: {
    backgroundColor: "#ede9fe",
    borderColor: "#c4b5fd",
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  filterNoticeText: {
    color: "#4c1d95",
    textAlign: "center",
    fontWeight: "700",
  },
  clearFilterText: {
    color: "#6d28d9",
    textAlign: "center",
    fontWeight: "900",
    marginTop: 7,
  },
  errorBox: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#fca5a5",
    backgroundColor: "#fee2e2",
    marginBottom: 16,
  },
  errorText: {
    color: "#991b1b",
    fontWeight: "700",
  },
  rangeCard: {
    backgroundColor: "#0f172a",
    borderRadius: 15,
    padding: 16,
    marginBottom: 14,
  },
  rangeTitle: {
    color: "#ffffff",
    fontSize: 17,
    fontWeight: "900",
    textAlign: "center",
  },
  rangeText: {
    color: "#cbd5e1",
    fontSize: 12,
    textAlign: "center",
    marginTop: 6,
  },
  warningBox: {
    backgroundColor: "#fef3c7",
    borderColor: "#fcd34d",
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
  },
  warningTitle: {
    color: "#92400e",
    fontWeight: "900",
    marginBottom: 4,
  },
  warningText: {
    color: "#92400e",
    lineHeight: 20,
  },
  summaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 14,
  },
  summaryCard: {
    width: "48%",
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 14,
    padding: 14,
  },
  summaryLabel: {
    color: "#64748b",
    fontWeight: "700",
    fontSize: 13,
  },
  summaryValue: {
    color: "#0f172a",
    fontWeight: "900",
    fontSize: 25,
    marginTop: 5,
  },
  financeCard: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 15,
    padding: 16,
    marginBottom: 20,
  },
  sectionTitle: {
    color: "#0f172a",
    fontSize: 19,
    fontWeight: "900",
    marginBottom: 10,
  },
  dataRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  dataLabel: {
    flex: 1,
    color: "#475569",
    fontWeight: "700",
  },
  dataValue: {
    color: "#0f172a",
    fontWeight: "900",
  },
  moneyValue: {
    color: "#166534",
    fontWeight: "900",
  },
  sectionHeading: {
    color: "#0f172a",
    fontSize: 22,
    fontWeight: "900",
    marginTop: 4,
    marginBottom: 12,
  },
  driverCard: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#c4b5fd",
    borderRadius: 15,
    padding: 16,
    marginBottom: 12,
  },
  driverName: {
    color: "#0f172a",
    fontSize: 18,
    fontWeight: "900",
  },
  driverMeta: {
    color: "#64748b",
    marginTop: 4,
  },
  driverMetric: {
    color: "#334155",
    lineHeight: 21,
    fontWeight: "600",
  },
  filterHint: {
    color: "#6d28d9",
    fontSize: 12,
    fontWeight: "800",
    marginTop: 10,
  },
  tripCard: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 15,
    padding: 16,
    marginBottom: 14,
  },
  tripHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
  },
  tripTitle: {
    color: "#0f172a",
    fontSize: 18,
    fontWeight: "900",
  },
  status: {
    color: "#6d28d9",
    fontSize: 13,
    fontWeight: "900",
  },
  approximateBadge: {
    alignSelf: "flex-start",
    color: "#92400e",
    backgroundColor: "#fef3c7",
    borderRadius: 999,
    paddingVertical: 5,
    paddingHorizontal: 9,
    fontSize: 10,
    fontWeight: "900",
    marginTop: 10,
  },
  detailLabel: {
    color: "#475569",
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase",
    marginTop: 13,
    marginBottom: 3,
  },
  detailText: {
    color: "#0f172a",
    fontSize: 14,
    lineHeight: 20,
  },
  receiptText: {
    color: "#166534",
    fontSize: 16,
    fontWeight: "900",
  },
  divider: {
    height: 1,
    backgroundColor: "#e2e8f0",
    marginVertical: 12,
  },
  emptyBox: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 14,
    padding: 18,
    marginBottom: 18,
  },
  emptyText: {
    color: "#64748b",
    textAlign: "center",
    lineHeight: 21,
  },
});
