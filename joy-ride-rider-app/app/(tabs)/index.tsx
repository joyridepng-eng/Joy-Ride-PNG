import { useActiveRiderRide as useRideRecovery } from "../../hooks/use-active-rider-ride";
import { useRiderAuth } from "@/contexts/rider-auth-context";
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

export default function HomeScreen() {
  const activeRideRecovery = useRideRecovery();

  const { session, signOut } = useRiderAuth();

  const [isSigningOut, setIsSigningOut] = useState(false);

  const [signOutError, setSignOutError] = useState<string | null>(null);

  async function handleSignOut(): Promise<void> {
    setSignOutError(null);
    setIsSigningOut(true);

    try {
      await signOut();
      router.replace("/login" as never);
    } catch {
      setSignOutError("Could not clear the Rider session.");
      setIsSigningOut(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Current ride</Text>
        {activeRideRecovery.state.phase === "checking" ? (
          <Text>Checking your current ride...</Text>
        ) : activeRideRecovery.state.phase === "error" ? (
          <>
            <Text>{activeRideRecovery.state.message}</Text>
            <TouchableOpacity
              onPress={() => {
                void activeRideRecovery.refresh();
              }}
            >
              <Text>Retry current ride check</Text>
            </TouchableOpacity>
          </>
        ) : activeRideRecovery.state.phase === "active" ? (
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => {
              if (activeRideRecovery.state.phase === "active") {
                router.push({
                  pathname: "/ride-status",
                  params: { rideId: activeRideRecovery.state.ride.id },
                });
              }
            }}
          >
            <Text style={styles.secondaryButtonText}>Resume current ride</Text>
          </TouchableOpacity>
        ) : (
          <Text>No active ride.</Text>
        )}
      </View>

      <Text style={styles.logo}>Joy Ride PNG</Text>

      <Text style={styles.sessionText}>Hello, {session?.rider.fullName}</Text>

      <Text style={styles.phoneText}>{session?.rider.phone}</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Your Ride</Text>

        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => router.push("/request-ride")}
        >
          <Text style={styles.primaryButtonText}>Request a Ride</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => router.push("/ride-status")}
        >
          <Text style={styles.secondaryButtonText}>My Ride</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => router.push("/receipt")}
        >
          <Text style={styles.secondaryButtonText}>Receipt</Text>
        </TouchableOpacity>
      </View>

      {signOutError ? (
        <Text accessibilityRole="alert" style={styles.signOutError}>
          {signOutError}
        </Text>
      ) : null}

      <TouchableOpacity
        accessibilityRole="button"
        disabled={isSigningOut}
        onPress={() => {
          void handleSignOut();
        }}
        style={[
          styles.signOutButton,
          isSigningOut && styles.signOutButtonDisabled,
        ]}
      >
        {isSigningOut ? (
          <ActivityIndicator color="#991b1b" />
        ) : (
          <Text style={styles.signOutButtonText}>Sign Out</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: 16,
    justifyContent: "center",
    backgroundColor: "#f8fafc",
  },
  logo: {
    fontSize: 42,
    fontWeight: "900",
    color: "#0f172a",
    textAlign: "center",
    marginBottom: 12,
  },
  title: {
    fontSize: 23,
    fontWeight: "800",
    color: "#1e293b",
    textAlign: "center",
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 16,
    color: "#475569",
    textAlign: "center",
    lineHeight: 24,
    marginBottom: 18,
  },
  sessionText: {
    color: "#334155",
    fontSize: 14,
    fontWeight: "800",
    textAlign: "center",
  },
  phoneText: {
    color: "#64748b",
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 20,
    marginTop: 3,
    textAlign: "center",
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
    backgroundColor: "#2563eb",
    paddingVertical: 16,
    paddingHorizontal: 14,
    borderRadius: 14,
    marginBottom: 14,
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 17,
    fontWeight: "800",
    textAlign: "center",
  },
  buttonHint: {
    color: "#dbeafe",
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
    marginTop: 4,
  },
  secondaryButton: {
    minHeight: 52,
    backgroundColor: "#f8fafc",
    paddingVertical: 16,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    marginBottom: 14,
  },
  secondaryButtonText: {
    color: "#1e293b",
    fontSize: 17,
    fontWeight: "800",
    textAlign: "center",
  },
  secondaryButtonHint: {
    color: "#64748b",
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
    marginTop: 4,
  },
  signOutError: {
    color: "#b42318",
    fontSize: 13,
    marginTop: 12,
    textAlign: "center",
  },
  signOutButton: {
    alignItems: "center",
    backgroundColor: "#fef2f2",
    borderColor: "#fecaca",
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: "center",
    marginTop: 14,
    minHeight: 52,
  },
  signOutButtonDisabled: {
    opacity: 0.65,
  },
  signOutButtonText: {
    color: "#991b1b",
    fontSize: 15,
    fontWeight: "800",
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
