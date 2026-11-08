import { useDriverAuth } from "@/contexts/driver-auth-context";
import { DriverAuthenticationError } from "@/services/driver-auth";
import { router } from "expo-router";
import {
  formatPngDriverPhone,
  normalizePngDriverPhone,
} from "@/services/png-driver-phone";
import { useState } from "react";
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

export default function DriverLoginScreen() {
  const { signIn } = useDriverAuth();

  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSignIn(): Promise<void> {
    if (!phone.trim() || !password) {
      setErrorMessage("Enter your phone number and password.");
      return;
    }

    const loginPhone = normalizePngDriverPhone(phone);
    if (!loginPhone) {
      setErrorMessage("Enter your 8-digit mobile number after +675.");
      return;
    }

    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      await signIn(loginPhone, password);

      router.replace("/");
    } catch (error: unknown) {
      setErrorMessage(
        error instanceof DriverAuthenticationError
          ? error.message
          : "Could not sign in to your Driver account.",
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
          <Text style={styles.logo}>Joy Ride Driver</Text>

          <Text style={styles.title}>Driver Sign In</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Phone number</Text>

          <View style={styles.phoneRow}>
            <Text style={styles.countryCode}>+675</Text>
            <TextInput
              accessibilityLabel="Driver mobile number, Papua New Guinea country code +675"
              autoCapitalize="none"
              autoComplete="tel"
              keyboardType="phone-pad"
              onChangeText={(value) => setPhone(formatPngDriverPhone(value))}
              placeholder="7000 0000"
              style={styles.phoneInput}
              value={phone}
            />
          </View>

          <Text style={styles.label}>Password</Text>

          <TextInput
            accessibilityLabel="Driver password"
            autoCapitalize="none"
            autoComplete="password"
            onChangeText={setPassword}
            placeholder="Your Driver password"
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
    fontSize: 36,
    fontWeight: "900",
    marginBottom: 10,
    textAlign: "center",
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
    backgroundColor: "#16a34a",
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
  helpText: {
    color: "#64748b",
    fontSize: 13,
    lineHeight: 19,
    marginTop: 16,
    textAlign: "center",
  },
  footer: {
    color: "#94a3b8",
    fontSize: 13,
    fontWeight: "600",
    marginTop: 18,
    textAlign: "center",
  },
});
