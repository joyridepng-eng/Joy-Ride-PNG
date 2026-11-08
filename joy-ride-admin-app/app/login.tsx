import { useAdminAuth } from "@/contexts/admin-auth-context";
import { AdminAuthenticationError } from "@/services/admin-auth";
import { Image } from "expo-image";
import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";

export default function AdminLoginScreen() {
  const { signIn } = useAdminAuth();
  const { width } = useWindowDimensions();
  const cardWidth = Math.min(width - 48, 420);
  const logoSize = Math.min(144, cardWidth - 80);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [focusedField, setFocusedField] = useState<
    "email" | "password" | null
  >(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canSubmit =
    email.trim().length > 0 && password.length >= 12 && !isSubmitting;

  async function handleSignIn(): Promise<void> {
    if (!canSubmit) {
      return;
    }

    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      await signIn(email, password);
      setPassword("");
    } catch (error: unknown) {
      setPassword("");

      setErrorMessage(
        error instanceof AdminAuthenticationError
          ? error.message
          : "Could not sign in. Check your connection and try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.keyboardContainer}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.card}>
            <View
              style={[
                styles.logoFrame,
                { width: logoSize, height: logoSize },
              ]}
            >
              <Image
                accessibilityLabel="Joy Ride company logo"
                contentFit="contain"
                source={require("../assets/images/company-logo.png")}
                style={styles.logoImage}
              />
            </View>

            <Text accessibilityRole="header" style={styles.title}>
              Welcome back
            </Text>

            <Text style={styles.subtitle}>
              Sign in with your administrator account.
            </Text>

            <Text style={styles.label}>Email</Text>

            <TextInput
              accessibilityLabel="Administrator email"
              autoCapitalize="none"
              autoComplete="email"
              autoCorrect={false}
              keyboardType="email-address"
              onChangeText={setEmail}
              onFocus={() => setFocusedField("email")}
              onBlur={() => setFocusedField(null)}
              placeholder="admin@example.com"
              placeholderTextColor="#94a3b8"
              returnKeyType="next"
              style={[styles.input, focusedField === "email" && styles.inputFocused]}
              value={email}
            />

            <Text style={styles.label}>Password</Text>

            <TextInput
              accessibilityLabel="Administrator password"
              autoCapitalize="none"
              autoComplete="current-password"
              autoCorrect={false}
              onChangeText={setPassword}
              onSubmitEditing={() => {
                void handleSignIn();
              }}
              onFocus={() => setFocusedField("password")}
              onBlur={() => setFocusedField(null)}
              placeholder="Enter your password"
              placeholderTextColor="#94a3b8"
              returnKeyType="go"
              secureTextEntry
              style={[
                styles.input,
                focusedField === "password" && styles.inputFocused,
              ]}
              value={password}
            />

            {errorMessage ? (
              <Text accessibilityRole="alert" style={styles.errorText}>
                {errorMessage}
              </Text>
            ) : null}

            <Pressable
              accessibilityRole="button"
              disabled={!canSubmit}
              onPress={() => {
                void handleSignIn();
              }}
              style={({ hovered, pressed }) => [
                styles.button,
                hovered && canSubmit && styles.buttonHovered,
                pressed && canSubmit && styles.buttonPressed,
                !canSubmit && styles.buttonDisabled,
              ]}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.buttonText}>Sign in securely</Text>
              )}
            </Pressable>

            <Text style={styles.securityNote}>
              Sessions expire automatically after 15 minutes.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  keyboardContainer: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    alignSelf: "center",
    padding: 40,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    backgroundColor: "#ffffff",
    boxShadow: "0 4px 20px rgba(0, 0, 0, 0.05)",
    elevation: 2,
  },
  logoFrame: {
    alignSelf: "center",
    marginBottom: 20,
    borderRadius: 12,
  },
  logoImage: {
    width: "100%",
    height: "100%",
  },
  title: {
    color: "#0f172a",
    fontSize: 26,
    fontWeight: "700",
    marginBottom: 6,
  },
  subtitle: {
    color: "#64748b",
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 24,
  },
  label: {
    color: "#1e293b",
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 8,
  },
  input: {
    minHeight: 50,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 8,
    paddingHorizontal: 14,
    color: "#1e293b",
    backgroundColor: "#ffffff",
    fontSize: 15,
    marginBottom: 18,
  },
  inputFocused: {
    borderColor: "#2563eb",
    outlineColor: "#93c5fd",
  },
  errorText: {
    color: "#b42318",
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 16,
  },
  button: {
    minHeight: 50,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
    backgroundColor: "#2563eb",
  },
  buttonHovered: {
    backgroundColor: "#1d4ed8",
  },
  buttonPressed: {
    backgroundColor: "#1e293b",
  },
  buttonDisabled: {
    backgroundColor: "#94a3b8",
  },
  buttonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "600",
  },
  securityNote: {
    marginTop: 16,
    textAlign: "center",
    color: "#64748b",
    fontSize: 13,
    lineHeight: 19,
  },
});
