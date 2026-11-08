import { RiderAuthenticationError } from "@/services/rider-auth";
import { useRiderAuth } from "@/contexts/rider-auth-context";
import { router } from "expo-router";
import type { Href } from "expo-router";
import { useState } from "react";
import {
  formatPngRiderPhone,
  normalizePngRiderPhone,
} from "@/services/png-rider-phone";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

export default function RiderLoginScreen() {
  const { signIn } = useRiderAuth();

  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSignIn(): Promise<void> {
    if (!phone.trim() || !password) {
      setErrorMessage("Enter your phone number and password.");
      return;
    }

    const internationalPhone = normalizePngRiderPhone(phone);
    if (!internationalPhone) {
      setErrorMessage("Enter your 8-digit mobile number after +675.");
      return;
    }

    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      await signIn(internationalPhone, password);

      router.replace("/");
    } catch (error: unknown) {
      setErrorMessage(
        error instanceof RiderAuthenticationError
          ? error.message
          : "Could not sign in to your Rider account.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.keyboardView}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Text style={styles.logo}>Joy Ride</Text>

          <Text style={styles.title}>Rider Sign In</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Phone number</Text>

          <View style={styles.phoneRow}>
            <Text style={styles.countryCode}>+675</Text>
            <TextInput
              accessibilityLabel="Rider mobile number, Papua New Guinea country code +675"
              autoCapitalize="none"
              autoComplete="tel"
              keyboardType="phone-pad"
              onChangeText={(value) => setPhone(formatPngRiderPhone(value))}
              placeholder="7000 0000"
              style={styles.phoneInput}
              value={phone}
            />
          </View>

          <Text style={styles.label}>Password</Text>

          <TextInput
            accessibilityLabel="Rider password"
            autoCapitalize="none"
            autoComplete="password"
            onChangeText={setPassword}
            placeholder="Your password"
            secureTextEntry
            style={styles.input}
            value={password}
          />

          {errorMessage ? (
            <Text accessibilityRole="alert" style={styles.error}>
              {errorMessage}
            </Text>
          ) : null}

          <TouchableOpacity
            accessibilityRole="button"
            disabled={isSubmitting}
            onPress={() => {
              void handleSignIn();
            }}
            style={[
              styles.primaryButton,
              isSubmitting && styles.disabledButton,
            ]}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.primaryButtonText}>Sign In</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            accessibilityRole="button"
            disabled={isSubmitting}
            onPress={() => {
              router.push("/register" as Href);
            }}
            style={styles.secondaryButton}
          >
            <Text style={styles.secondaryButtonText}>Create Account</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  keyboardView: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  container: {
    flexGrow: 1,
    justifyContent: "center",
    padding: 24,
  },
  header: {
    alignItems: "center",
    marginBottom: 24,
  },
  logo: {
    color: "#0f172a",
    fontSize: 42,
    fontWeight: "900",
    marginBottom: 10,
  },
  title: {
    color: "#1e293b",
    fontSize: 25,
    fontWeight: "800",
    marginBottom: 8,
  },
  subtitle: {
    color: "#64748b",
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
  },
  card: {
    backgroundColor: "#ffffff",
    borderColor: "#e2e8f0",
    borderRadius: 18,
    borderWidth: 1,
    padding: 20,
  },
  label: {
    color: "#334155",
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 7,
  },
  phoneRow: {
    flexDirection: "row",
    alignItems: "center",
    borderColor: "#cbd5e1",
    borderWidth: 1,
    borderRadius: 12,
    marginBottom: 16,
    minHeight: 56,
    backgroundColor: "#ffffff",
  },
  countryCode: {
    color: "#0f172a",
    fontSize: 18,
    fontWeight: "700",
    paddingHorizontal: 12,
  },
  phoneInput: {
    flex: 1,
    minWidth: 0,
    minHeight: 56,
    fontSize: 18,
    color: "#0f172a",
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  input: {
    backgroundColor: "#ffffff",
    borderColor: "#cbd5e1",
    borderRadius: 12,
    borderWidth: 1,
    color: "#0f172a",
    fontSize: 16,
    marginBottom: 16,
    minHeight: 56,
    paddingHorizontal: 14,
  },
  error: {
    color: "#b42318",
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 14,
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: "#2563eb",
    borderRadius: 12,
    justifyContent: "center",
    minHeight: 56,
  },
  disabledButton: {
    opacity: 0.65,
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "800",
  },
  secondaryButton: {
    alignItems: "center",
    borderColor: "#bfdbfe",
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: "center",
    marginTop: 12,
    minHeight: 52,
  },
  secondaryButtonText: {
    color: "#1d4ed8",
    fontSize: 15,
    fontWeight: "800",
  },
  footer: {
    color: "#94a3b8",
    fontSize: 13,
    fontWeight: "600",
    marginTop: 18,
    textAlign: "center",
  },
});
