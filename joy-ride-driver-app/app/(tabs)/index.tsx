import { useDriverAuth } from "@/contexts/driver-auth-context";
import { router } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

export default function DriverHomeScreen() {
  const { session, isLoading, signOut } = useDriverAuth();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [message, setMessage] = useState("");

  async function handleSignOut() {
    try {
      setIsSigningOut(true);
      setMessage("");

      await signOut();
    } catch {
      setMessage("Could not sign out. Please try again.");
    } finally {
      setIsSigningOut(false);
    }
  }

  if (isLoading || !session) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#16a34a" />
        <Text style={styles.loadingText}>Loading Driver session...</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.logo}>Joy Ride Driver</Text>

      <Text style={styles.title}>Welcome, {session.driver.fullName}</Text>

      <View style={styles.card}>
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => router.push("/assigned-ride")}
        >
          <Text style={styles.primaryButtonText}>My Ride</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => router.push("/availability")}
        >
          <Text style={styles.secondaryButtonText}>Availability</Text>
        </TouchableOpacity>

        <TouchableOpacity
          accessibilityRole="button"
          style={styles.secondaryButton}
          onPress={() => router.push("/daily-takings")}
        >
          <Text style={styles.secondaryButtonText}>Takings</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.signOutButton, isSigningOut && styles.disabledButton]}
          disabled={isSigningOut}
          onPress={() => void handleSignOut()}
        >
          {isSigningOut ? (
            <ActivityIndicator color="#b91c1c" />
          ) : (
            <Text style={styles.signOutButtonText}>Sign Out</Text>
          )}
        </TouchableOpacity>

        {message ? <Text style={styles.errorMessage}>{message}</Text> : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    backgroundColor: "#f8fafc",
  },
  loadingText: {
    color: "#475569",
    fontSize: 15,
    fontWeight: "600",
  },
  container: {
    flexGrow: 1,
    padding: 24,
    justifyContent: "center",
    backgroundColor: "#f8fafc",
  },
  logo: {
    fontSize: 36,
    fontWeight: "900",
    color: "#0f172a",
    textAlign: "center",
    marginBottom: 10,
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    color: "#1e293b",
    textAlign: "center",
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 15,
    color: "#475569",
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 20,
  },
  identityCard: {
    backgroundColor: "#ecfdf5",
    borderColor: "#86efac",
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    marginBottom: 16,
  },
  identityLabel: {
    color: "#166534",
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    textAlign: "center",
  },
  identityName: {
    color: "#14532d",
    fontSize: 18,
    fontWeight: "900",
    textAlign: "center",
    marginTop: 4,
  },
  identityPhone: {
    color: "#166534",
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
    marginTop: 2,
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#0f172a",
    textAlign: "center",
    marginBottom: 16,
  },
  primaryButton: {
    minHeight: 52,
    justifyContent: "center",
    backgroundColor: "#16a34a",
    paddingVertical: 15,
    paddingHorizontal: 14,
    borderRadius: 14,
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 17,
    fontWeight: "800",
    textAlign: "center",
  },
  buttonHint: {
    color: "#dcfce7",
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
    marginTop: 4,
  },
  secondaryButton: {
    minHeight: 52,
    justifyContent: "center",
    backgroundColor: "#e2e8f0",
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 14,
    marginTop: 12,
  },
  secondaryButtonText: {
    color: "#1e293b",
    fontSize: 16,
    fontWeight: "800",
    textAlign: "center",
  },
  signOutButton: {
    minHeight: 52,
    justifyContent: "center",
    backgroundColor: "#fee2e2",
    borderColor: "#fecaca",
    borderWidth: 1,
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderRadius: 14,
    marginTop: 12,
  },
  signOutButtonText: {
    color: "#b91c1c",
    fontSize: 15,
    fontWeight: "800",
    textAlign: "center",
  },
  disabledButton: {
    opacity: 0.6,
  },
  errorMessage: {
    color: "#b91c1c",
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
    marginTop: 12,
  },
  updateStatus: {
    marginTop: 18,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignSelf: "center",
    color: "#166534",
    backgroundColor: "#dcfce7",
    borderColor: "#86efac",
    borderRadius: 999,
    borderWidth: 1,
    fontSize: 12,
    fontWeight: "800",
    textAlign: "center",
  },
  footer: {
    marginTop: 18,
    textAlign: "center",
    color: "#94a3b8",
    fontSize: 13,
    fontWeight: "600",
  },
});
