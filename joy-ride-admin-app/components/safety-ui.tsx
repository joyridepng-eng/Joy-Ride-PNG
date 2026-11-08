import type { PropsWithChildren } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

export function safetyTime(value: string | number | null) {
  if (value === null) return "Not recorded";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Unknown time";
  return (
    date.toLocaleString("en-PG", { timeZone: "Pacific/Port_Moresby" }) +
    " (Port Moresby)"
  );
}
export function SafetyPage({
  title,
  children,
}: PropsWithChildren<{ title: string }>) {
  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      style={s.screen}
      contentContainerStyle={s.container}
    >
      <Text accessibilityRole="header" style={s.title}>
        {title}
      </Text>
      {children}
    </ScrollView>
  );
}
export function SafetyButton({
  title,
  onPress,
  disabled = false,
  danger = false,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        s.button,
        danger && s.danger,
        (disabled || pressed) && s.dim,
      ]}
    >
      <Text style={s.buttonText}>{title}</Text>
    </Pressable>
  );
}
export function SafetyNotice({
  text,
  error = false,
}: {
  text: string;
  error?: boolean;
}) {
  return (
    <Text
      accessibilityLiveRegion={error ? "assertive" : "polite"}
      style={[s.notice, error && s.error]}
    >
      {text}
    </Text>
  );
}
export function SafetyLoadState({
  busy,
  error,
  checkedAt,
}: {
  busy: boolean;
  error: string;
  checkedAt: number | null;
}) {
  return (
    <View>
      {busy ? (
        <ActivityIndicator
          accessibilityLabel="Checking server"
          color="#1d4ed8"
        />
      ) : null}
      {error ? (
        <SafetyNotice
          error
          text={
            error +
            (checkedAt
              ? " Displayed information is last known and may be out of date."
              : "")
          }
        />
      ) : null}
      <Text style={s.muted}>
        {checkedAt
          ? `Last checked: ${safetyTime(checkedAt)}`
          : "No successful server check yet."}
      </Text>
    </View>
  );
}
export const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f1f5f9" },
  container: {
    width: "100%",
    maxWidth: 1000,
    alignSelf: "center",
    padding: 20,
    paddingTop: 36,
    paddingBottom: 64,
    gap: 14,
  },
  title: { fontSize: 28, fontWeight: "800", color: "#0f172a" },
  heading: { fontSize: 20, fontWeight: "700", color: "#0f172a" },
  text: { color: "#1e293b", fontSize: 16, lineHeight: 24 },
  muted: { color: "#475569", fontSize: 13, lineHeight: 20 },
  card: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 14,
    backgroundColor: "white",
    padding: 18,
    gap: 10,
  },
  urgentCard: { borderColor: "#b91c1c", borderLeftWidth: 5 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  button: {
    backgroundColor: "#1e40af",
    borderRadius: 10,
    padding: 14,
    minHeight: 48,
    justifyContent: "center",
  },
  danger: { backgroundColor: "#b91c1c" },
  buttonText: {
    color: "white",
    fontWeight: "700",
    fontSize: 15,
    textAlign: "center",
  },
  dim: { opacity: 0.5 },
  notice: {
    backgroundColor: "#e0f2fe",
    padding: 14,
    borderRadius: 10,
    color: "#0c4a6e",
    lineHeight: 22,
  },
  error: { backgroundColor: "#fef2f2", color: "#991b1b" },
  input: {
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: "#64748b",
    borderRadius: 10,
    padding: 14,
    minHeight: 110,
    textAlignVertical: "top",
    fontSize: 16,
    color: "#0f172a",
  },
});
