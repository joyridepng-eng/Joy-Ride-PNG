import { useRef, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import type { RegistryDriver } from "@/services/fleet-registry";

type Action = "SUSPENDED" | "INACTIVE";
type Props = {
  driver: RegistryDriver;
  disabled: boolean;
  onSubmit: (driver: RegistryDriver, status: Action) => Promise<boolean>;
};

export default function DriverDisciplineActions({
  driver, disabled, onSubmit,
}: Props) {
  const [pending, setPending] = useState<Action | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const busy = useRef(false);
  const locked = disabled || submitting;
  const actionName = pending === "SUSPENDED" ? "Suspend" : "Deactivate";

  async function confirm() {
    if (!pending || locked || busy.current) return;
    busy.current = true;
    setSubmitting(true);
    try {
      if (await onSubmit(driver, pending)) setPending(null);
    } finally {
      busy.current = false;
      setSubmitting(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        {driver.status === "APPROVED" ? (
          <TouchableOpacity
            accessibilityRole="button"
            disabled={locked}
            onPress={() => setPending("SUSPENDED")}
            style={[styles.button, styles.suspend, locked && styles.disabled]}
          >
            <Text style={styles.buttonText}>Suspend Driver</Text>
          </TouchableOpacity>
        ) : null}
        {driver.status !== "INACTIVE" ? (
          <TouchableOpacity
            accessibilityRole="button"
            disabled={locked}
            onPress={() => setPending("INACTIVE")}
            style={[styles.button, styles.deactivate, locked && styles.disabled]}
          >
            <Text style={styles.buttonText}>Deactivate Driver</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      {pending ? (
        <View style={styles.confirmation}>
          <Text style={styles.title}>{actionName} {driver.fullName}?</Text>
          <Text style={styles.description}>
            This will take the driver offline and prevent new assignments.
            Their active vehicle will become inactive. Driver and trip records
            will be retained. Resolve any active ride before proceeding.
          </Text>
          <View style={styles.row}>
            <TouchableOpacity
              accessibilityRole="button"
              disabled={locked}
              onPress={() => setPending(null)}
              style={[styles.button, styles.cancel, locked && styles.disabled]}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="button"
              disabled={locked}
              onPress={() => { void confirm(); }}
              style={[styles.button, styles.deactivate, locked && styles.disabled]}
            >
              <Text style={styles.buttonText}>
                {submitting ? "Updating..." : "Confirm " + actionName}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: 8, marginBottom: 8 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  button: { paddingHorizontal: 14, paddingVertical: 11, borderRadius: 8 },
  suspend: { backgroundColor: "#92400E" },
  deactivate: { backgroundColor: "#B91C1C" },
  cancel: { backgroundColor: "#E2E8F0" },
  buttonText: { color: "#FFFFFF", fontWeight: "600" },
  cancelText: { color: "#0F172A", fontWeight: "600" },
  disabled: { opacity: 0.5 },
  confirmation: {
    marginTop: 10, padding: 12, borderRadius: 8,
    borderWidth: 1, borderColor: "#CBD5E1", backgroundColor: "#F8FAFC",
  },
  title: { color: "#0F172A", fontSize: 16, fontWeight: "700" },
  description: { color: "#334155", marginVertical: 10, lineHeight: 21 },
});
