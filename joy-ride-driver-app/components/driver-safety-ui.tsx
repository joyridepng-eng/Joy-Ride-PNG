import { Pressable, StyleSheet, Text, View } from "react-native";
import type { Emergency } from "@/services/driver-safety-core";
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
      accessibilityLabel={title}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[s.button, danger && s.danger, disabled && s.disabled]}
    >
      <Text style={s.buttonText}>{title}</Text>
    </Pressable>
  );
}
export function AlertStatus({ item }: { item: Emergency }) {
  return (
    <View style={s.card}>
      <Text selectable style={s.heading}>
        Alert {item.id}
      </Text>
      <Text style={s.text}>
        Server received: {new Date(item.createdAt).toLocaleString()}
      </Text>
      <Text style={s.heading}>
        {item.status === "OPEN"
          ? "Awaiting Admin acknowledgement"
          : item.status === "ACKNOWLEDGED"
            ? "Acknowledged by Admin"
            : "Marked resolved by Admin"}
      </Text>
      {item.acknowledgedAt && (
        <Text style={s.text}>
          Acknowledged: {new Date(item.acknowledgedAt).toLocaleString()}
        </Text>
      )}
      {item.resolvedAt && (
        <Text style={s.text}>
          Resolved: {new Date(item.resolvedAt).toLocaleString()}
        </Text>
      )}
      {item.status === "OPEN" && (
        <Text style={s.warning}>
          Server receipt does not mean a person has seen this alert or help has
          been dispatched.
        </Text>
      )}
      {item.adminInboxItemCount === 0 && (
        <Text style={s.warning}>
          No Admin inbox received this alert. Contact Admin directly.
        </Text>
      )}
      <Text style={s.text}>
        {item.latitude === null
          ? "No location attached."
          : `${item.locationSource === "MANUAL_PIN" ? "Selected incident pin (fixed)" : item.locationSource === "GPS" ? "Device GPS snapshot" : "Location (source unknown)"} ${item.locationIsStale ? "(stale)" : "(recent when checked)"}: ${item.latitude}, ${item.longitude}`}
      </Text>
      {item.locationSource === "MANUAL_PIN" && (
        <Text style={s.text}>
          Selected by the Driver; not a live GPS fix. No measured GPS accuracy.
        </Text>
      )}
      {item.locationRecordedAt && (
        <Text style={s.text}>
          {item.locationSource === "MANUAL_PIN"
            ? "Pin selected:"
            : "Location recorded:"}{" "}
          {new Date(item.locationRecordedAt).toLocaleString()}
        </Text>
      )}
      {item.message && <Text style={s.text}>{item.message}</Text>}
    </View>
  );
}
export const s = StyleSheet.create({
  page: {
    padding: 20,
    paddingTop: 48,
    paddingBottom: 40,
    gap: 14,
    backgroundColor: "#f8fafc",
    flexGrow: 1,
  },
  title: { fontSize: 26, fontWeight: "800", color: "#0f172a" },
  heading: { fontSize: 17, fontWeight: "700", color: "#0f172a" },
  text: { fontSize: 16, color: "#334155", lineHeight: 24 },
  warning: { color: "#991b1b", fontSize: 16, lineHeight: 24 },
  card: {
    padding: 16,
    borderRadius: 12,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    gap: 10,
  },
  button: {
    backgroundColor: "#0f766e",
    borderRadius: 10,
    padding: 15,
    minHeight: 48,
  },
  danger: { backgroundColor: "#b91c1c" },
  disabled: { opacity: 0.5 },
  buttonText: {
    color: "#fff",
    fontWeight: "700",
    textAlign: "center",
    fontSize: 16,
  },
  input: {
    padding: 12,
    borderWidth: 1,
    borderColor: "#64748b",
    borderRadius: 8,
    minHeight: 90,
    color: "#0f172a",
    backgroundColor: "#fff",
  },
});
