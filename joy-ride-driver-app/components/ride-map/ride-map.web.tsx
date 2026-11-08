import { StyleSheet, Text, View } from "react-native";

import type { RideMapProps } from "./ride-map.types";

export function RideMap(_props: RideMapProps) {
  return (
    <View style={styles.notice}>
      <Text style={styles.title}>Live GPS map available on mobile</Text>

      <Text style={styles.text}>
        Install the Joy Ride Driver Android app to view the driver&apos;s live
        position, pickup marker and drop-off marker.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  notice: {
    width: "100%",
    marginTop: 14,
    padding: 16,
    borderRadius: 12,
    backgroundColor: "#e2e8f0",
    borderWidth: 1,
    borderColor: "#cbd5e1",
  },
  title: {
    color: "#0f172a",
    fontSize: 15,
    fontWeight: "900",
    marginBottom: 6,
  },
  text: {
    color: "#475569",
    fontSize: 14,
    lineHeight: 20,
  },
});
