import { StyleSheet, Text, View } from "react-native";

export default function RequestRideWebScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>Request a Ride</Text>

        <Text style={styles.description}>
          Interactive pickup selection, destination selection and route mapping
          are available in the Joy Ride Rider Android app.
        </Text>

        <Text style={styles.notice}>
          Your authenticated Rider account is connected. Install the current
          Android APK to submit a map-based ride request.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    justifyContent: "center",
    backgroundColor: "#f8fafc",
  },
  card: {
    width: "100%",
    maxWidth: 620,
    alignSelf: "center",
    padding: 22,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#ffffff",
    gap: 14,
  },
  title: {
    color: "#0f172a",
    fontSize: 26,
    fontWeight: "900",
  },
  description: {
    color: "#475569",
    fontSize: 16,
    lineHeight: 24,
  },
  notice: {
    color: "#166534",
    fontSize: 14,
    lineHeight: 21,
    fontWeight: "700",
    padding: 14,
    borderRadius: 12,
    backgroundColor: "#dcfce7",
  },
});
