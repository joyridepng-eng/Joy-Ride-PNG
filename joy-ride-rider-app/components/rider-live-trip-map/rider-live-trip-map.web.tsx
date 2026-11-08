import { StyleSheet, Text, View } from "react-native";

export type RiderMapPoint = {
  latitude: number;
  longitude: number;
  label?: string | null;
};

type RiderLiveTripMapProps = {
  rideId: string;
  status: string;
  pickup: RiderMapPoint | null;
  dropoff: RiderMapPoint | null;
  driverAssigned: boolean;
  driverName?: string | null;
  vehicleLabel?: string | null;
  trackingEnabled?: boolean;
};

export function RiderLiveTripMap({
  status,
  pickup,
  dropoff,
  driverAssigned,
  driverName,
  vehicleLabel,
}: RiderLiveTripMapProps) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>Trip Details</Text>

      <Text style={styles.description}>
        Use the Android app to see your driver on the map.
      </Text>

      <View style={styles.row}>
        <Text style={styles.label}>Ride status</Text>
        <Text style={styles.value}>{status}</Text>
      </View>

      <View style={styles.row}>
        <Text style={styles.label}>Driver</Text>
        <Text style={styles.value}>
          {driverAssigned
            ? driverName || "Assigned Driver"
            : "Waiting for assignment"}
        </Text>
      </View>

      {vehicleLabel ? (
        <View style={styles.row}>
          <Text style={styles.label}>Vehicle</Text>
          <Text style={styles.value}>{vehicleLabel}</Text>
        </View>
      ) : null}

      <View style={styles.row}>
        <Text style={styles.label}>Pickup</Text>
        <Text style={styles.value}>{pickup?.label || "Pickup location"}</Text>
      </View>

      <View style={styles.row}>
        <Text style={styles.label}>Drop-off</Text>
        <Text style={styles.value}>
          {dropoff?.label || "Drop-off location"}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: "100%",
    marginTop: 16,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#f8fafc",
    gap: 12,
  },
  title: {
    color: "#0f172a",
    fontSize: 17,
    fontWeight: "800",
  },
  description: {
    color: "#475569",
    fontSize: 14,
    lineHeight: 21,
  },
  row: {
    gap: 3,
  },
  label: {
    color: "#64748b",
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  value: {
    color: "#0f172a",
    fontSize: 15,
    fontWeight: "600",
  },
});

export default RiderLiveTripMap;
