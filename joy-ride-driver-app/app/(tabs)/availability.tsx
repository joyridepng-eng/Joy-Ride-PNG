import {
  enableBackgroundGPS,
  stopBackgroundGPS,
  usesBackgroundGPS,
} from "@/services/background-gps";
import { useDriverAuth } from "@/contexts/driver-auth-context";
import { useDriverLocationTracking } from "@/hooks/use-driver-location-tracking";
import { driverFetch } from "@/services/driver-auth";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

type Driver = {
  id: string;
  fullName: string;
  phone: string;
  status: string;
  isOnline: boolean;
  isAvailable: boolean;
};

export default function AvailabilityScreen() {
  const { session } = useDriverAuth();
  const [driver, setDriver] = useState<Driver | null>(null);
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const [screenFocused, setScreenFocused] = useState(false);

  useEffect(() => {
    setDriver(null);
  }, [session?.driver.id]);

  // Keep this subscription scoped to Availability to avoid leaving it active
  // when the driver switches to the ride screen's own GPS tracker.
  useFocusEffect(
    useCallback(() => {
      setScreenFocused(true);
      // Require a fresh server response after returning or changing accounts.
      setDriver(null);
      return () => setScreenFocused(false);
    }, []),
  );

  const gpsEnabled =
    screenFocused &&
    Platform.OS !== "web" &&
    driver !== null &&
    driver.id === session?.driver.id &&
    driver.status === "APPROVED" &&
    driver.isOnline;

  const {
    latestLocation,
    errorMessage: gpsError,
    status: gpsStatus,
  } = useDriverLocationTracking({ enabled: gpsEnabled });

  async function updateAvailability(isOnline: boolean, isAvailable?: boolean) {
    try {
      setIsLoading(true);
      setMessage("");
      if (!isOnline) await stopBackgroundGPS();

      const body =
        isAvailable === undefined ? { isOnline } : { isOnline, isAvailable };

      const response = await driverFetch("/drivers/me/availability", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      const data: unknown = await response.json();

      if (!response.ok) {
        const errorMessage =
          typeof data === "object" &&
          data !== null &&
          "message" in data &&
          typeof data.message === "string"
            ? data.message
            : "Could not update availability.";

        setMessage(errorMessage);
        return;
      }

      setDriver(data as Driver);
      setMessage("Driver availability updated.");
      if (isOnline && usesBackgroundGPS) await enableBackgroundGPS();
    } catch {
      setMessage(
        "Could not update availability. Check your internet connection and Driver session.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  async function refreshDriver() {
    try {
      setIsLoading(true);
      setMessage("");

      const response = await driverFetch("/drivers/me");
      const data: unknown = await response.json();

      if (!response.ok) {
        const errorMessage =
          typeof data === "object" &&
          data !== null &&
          "message" in data &&
          typeof data.message === "string"
            ? data.message
            : "Could not load Driver status.";

        setMessage(errorMessage);
        return;
      }

      setDriver(data as Driver);
      setMessage("Driver status loaded.");
    } catch {
      setMessage(
        "Could not load Driver status. Check your internet connection and Driver session.",
      );
    } finally {
      setIsLoading(false);
    }
  }
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Availability</Text>
      <View style={styles.testDriverBox}>
        <Text style={styles.testDriverName}>{session?.driver.fullName}</Text>
      </View>
      <TouchableOpacity
        style={[
          styles.secondaryButton,
          isLoading ? styles.disabledButton : null,
        ]}
        onPress={refreshDriver}
        disabled={isLoading}
      >
        <Text style={styles.buttonText}>
          {isLoading ? "Loading..." : "Refresh Status"}
        </Text>
      </TouchableOpacity>

      <View style={styles.buttonGrid}>
        <TouchableOpacity
          style={[
            styles.onlineButton,
            isLoading ? styles.disabledButton : null,
          ]}
          onPress={() => updateAvailability(true, true)}
          disabled={isLoading}
        >
          <Text style={styles.buttonText}>Go Online</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.offlineButton,
            isLoading ? styles.disabledButton : null,
          ]}
          onPress={() => updateAvailability(false)}
          disabled={isLoading}
        >
          <Text style={styles.buttonText}>Go Offline</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.availableButton,
            isLoading ? styles.disabledButton : null,
          ]}
          onPress={() => updateAvailability(true, true)}
          disabled={isLoading}
        >
          <Text style={styles.buttonText}>Ready for Rides</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.unavailableButton,
            isLoading ? styles.disabledButton : null,
          ]}
          onPress={() => updateAvailability(true, false)}
          disabled={isLoading}
        >
          <Text style={styles.buttonText}>Busy</Text>
        </TouchableOpacity>
      </View>

      {usesBackgroundGPS ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Location Sharing</Text>
          <Text style={styles.detailText}>
            When online, your location is shared with Admin, including while
            your screen is locked.
          </Text>
          <Text style={styles.detailText}>
            {gpsError ||
              (gpsStatus === "tracking"
                ? "GPS service is active. Check the latest upload below."
                : "Enable GPS after going online.")}
          </Text>
          <TouchableOpacity
            style={styles.onlineButton}
            disabled={isLoading || gpsStatus === "requesting-permission"}
            onPress={() => {
              void enableBackgroundGPS().catch(() =>
                setMessage("Could not enable GPS. Check your session."),
              );
            }}
          >
            <Text style={styles.buttonText}>
              {gpsStatus === "requesting-permission"
                ? "Waiting for permission..."
                : "Enable GPS"}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.offlineButton}
            onPress={() => {
              void stopBackgroundGPS().catch(() =>
                setMessage("Could not stop GPS. Reopen the app and try again."),
              );
            }}
          >
            <Text style={styles.buttonText}>Stop GPS</Text>
          </TouchableOpacity>
          <Text style={styles.footerNote}>
            Stop GPS stops location sharing. Go Offline also stops new ride
            availability.
          </Text>
        </View>
      ) : null}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>GPS Status</Text>
        <Text style={styles.detailText}>
          {Platform.OS === "web"
            ? "Location sharing is available in the Android app."
            : !gpsEnabled
              ? "Go Online, then refresh your status to check GPS."
              : gpsError
                ? gpsError
                : latestLocation
                  ? "Location sent successfully."
                  : gpsStatus === "requesting-permission"
                    ? "Allow location permission to share your position."
                    : "Waiting to send your location..."}
        </Text>
        {gpsEnabled && latestLocation ? (
          <>
            <Text style={styles.detailLabel}>Last location sent</Text>
            <Text style={styles.detailText}>
              {new Date(latestLocation.recordedAt).toLocaleString()}
            </Text>
            <Text style={styles.detailLabel}>Accuracy</Text>
            <Text style={styles.detailText}>
              {latestLocation.accuracy === null
                ? "Unknown"
                : `${latestLocation.accuracy.toFixed(1)} metres`}
            </Text>
          </>
        ) : null}
        <Text style={styles.footerNote}>
          {usesBackgroundGPS
            ? "Internet is needed to send your location."
            : "Keep this screen open while sharing your location."}
        </Text>
      </View>

      {message ? (
        <View style={driver ? styles.successMessageBox : styles.messageBox}>
          <Text style={driver ? styles.successMessageText : styles.messageText}>
            {message}
          </Text>
        </View>
      ) : null}

      {driver ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{driver.fullName}</Text>
          <Text style={styles.detailText}>{driver.phone}</Text>

          <View style={styles.divider} />

          <Text style={styles.detailLabel}>Driver Status</Text>
          <Text style={styles.detailText}>{driver.status}</Text>

          <Text style={styles.detailLabel}>Online</Text>
          <Text style={driver.isOnline ? styles.goodStatus : styles.badStatus}>
            {driver.isOnline ? "YES" : "NO"}
          </Text>

          <Text style={styles.detailLabel}>Available</Text>
          <Text
            style={driver.isAvailable ? styles.goodStatus : styles.badStatus}
          >
            {driver.isAvailable ? "YES" : "NO"}
          </Text>
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
    paddingBottom: 32,
    backgroundColor: "#f8fafc",
  },
  title: {
    fontSize: 26,
    fontWeight: "900",
    color: "#0f172a",
    textAlign: "center",
    marginBottom: 12,
    marginTop: 16,
  },
  subtitle: {
    fontSize: 16,
    color: "#475569",
    textAlign: "center",
    lineHeight: 24,
    marginBottom: 24,
  },
  label: {
    fontSize: 14,
    fontWeight: "800",
    color: "#334155",
    marginBottom: 6,
  },
  input: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 14,
  },
  secondaryButton: {
    minHeight: 52,
    justifyContent: "center",
    backgroundColor: "#475569",
    paddingVertical: 14,
    borderRadius: 14,
    marginBottom: 14,
  },
  buttonGrid: {
    gap: 12,
    marginBottom: 18,
  },
  onlineButton: {
    minHeight: 52,
    justifyContent: "center",
    backgroundColor: "#16a34a",
    paddingVertical: 14,
    borderRadius: 14,
  },
  offlineButton: {
    minHeight: 52,
    justifyContent: "center",
    backgroundColor: "#dc2626",
    paddingVertical: 14,
    borderRadius: 14,
  },
  availableButton: {
    minHeight: 52,
    justifyContent: "center",
    backgroundColor: "#2563eb",
    paddingVertical: 14,
    borderRadius: 14,
  },
  unavailableButton: {
    minHeight: 52,
    justifyContent: "center",
    backgroundColor: "#92400e",
    paddingVertical: 14,
    borderRadius: 14,
  },
  disabledButton: {
    backgroundColor: "#94a3b8",
  },
  buttonText: {
    color: "#ffffff",
    fontSize: 17,
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
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 22,
    fontWeight: "900",
    color: "#0f172a",
    marginBottom: 4,
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
  goodStatus: {
    fontSize: 22,
    color: "#16a34a",
    fontWeight: "900",
  },
  badStatus: {
    fontSize: 22,
    color: "#dc2626",
    fontWeight: "900",
  },
  footerNote: {
    marginTop: 18,
    textAlign: "center",
    color: "#475569",
    fontWeight: "700",
    lineHeight: 20,
  },
});
