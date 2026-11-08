import { useRef, useState } from "react";
import { StyleSheet, Text, TouchableOpacity } from "react-native";
import { printSettlementReceipt } from "@/services/settlement-print";
import type { PrintableSettlementRide } from "@/services/settlement-receipt";

type Props = {
  ride: PrintableSettlementRide;
  disabled: boolean;
  onError: () => void;
};

export default function SettlementPrintButton({
  ride, disabled, onError,
}: Props) {
  const [printing, setPrinting] = useState(false);
  const busy = useRef(false);

  async function print() {
    if (disabled || busy.current) return;
    busy.current = true;
    setPrinting(true);
    try {
      await printSettlementReceipt(ride);
    } catch {
      onError();
    } finally {
      busy.current = false;
      setPrinting(false);
    }
  }

  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel="Print settlement receipt"
      disabled={disabled || printing}
      onPress={() => { void print(); }}
      style={[styles.button, (disabled || printing) && styles.disabled]}
    >
      <Text style={styles.text}>{printing ? "Opening..." : "Print"}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: "#0369A1", paddingHorizontal: 18,
    paddingVertical: 12, borderRadius: 8,
    marginTop: 8, marginBottom: 8,
  },
  text: { color: "#FFFFFF", fontWeight: "700" },
  disabled: { opacity: 0.5 },
});
