import { useRiderAuth } from "@/contexts/rider-auth-context";
import { RiderAuthenticationError } from "@/services/rider-auth";
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

export default function RiderRegisterScreen() {
  const { register } = useRiderAuth();

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleRegistration(): Promise<void> {
    if (!fullName.trim() || !phone.trim() || !password) {
      setErrorMessage("Full name, phone number and password are required.");
      return;
    }

    if (password.length < 12) {
      setErrorMessage("Password must contain at least 12 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage("The password confirmation does not match.");
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
      await register({
        fullName: fullName.trim(),
        phone: internationalPhone,
        email: email.trim() || undefined,
        password,
      });

      router.replace("/");
    } catch (error: unknown) {
      setErrorMessage(
        error instanceof RiderAuthenticationError
          ? error.message
          : "Could not create your Rider account.",
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

          <Text style={styles.title}>Create Account</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Full name</Text>

          <TextInput
            accessibilityLabel="Rider full name"
            autoCapitalize="words"
            autoComplete="name"
            onChangeText={setFullName}
            placeholder="Your full name"
            style={styles.input}
            value={fullName}
          />

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

          <Text style={styles.label}>Email (optional)</Text>

          <TextInput
            accessibilityLabel="Rider email"
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            onChangeText={setEmail}
            placeholder="name@example.com"
            style={styles.input}
            value={email}
          />

          <Text style={styles.label}>Password</Text>

          <TextInput
            accessibilityLabel="Rider password"
            autoCapitalize="none"
            autoComplete="new-password"
            onChangeText={setPassword}
            placeholder="At least 12 characters"
            secureTextEntry
            style={styles.input}
            value={password}
          />

          <Text style={styles.label}>Confirm password</Text>

          <TextInput
            accessibilityLabel="Confirm Rider password"
            autoCapitalize="none"
            autoComplete="new-password"
            onChangeText={setConfirmPassword}
            placeholder="Enter the password again"
            secureTextEntry
            style={styles.input}
            value={confirmPassword}
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
              void handleRegistration();
            }}
            style={[
              styles.primaryButton,
              isSubmitting && styles.disabledButton,
            ]}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.primaryButtonText}>Create Account</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            accessibilityRole="button"
            disabled={isSubmitting}
            onPress={() => {
              router.replace("/login" as Href);
            }}
            style={styles.secondaryButton}
          >
            <Text style={styles.secondaryButtonText}>Sign In</Text>
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
    fontSize: 38,
    fontWeight: "900",
    marginBottom: 10,
  },
  title: {
    color: "#1e293b",
    fontSize: 24,
    fontWeight: "800",
    marginBottom: 8,
    textAlign: "center",
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
    borderColor: "#cbd5e1",
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: "center",
    marginTop: 12,
    minHeight: 52,
  },
  secondaryButtonText: {
    color: "#334155",
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
