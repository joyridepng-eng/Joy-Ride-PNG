import { Text } from "react-native";
import { s } from "@/components/driver-safety-ui";
import { incidentLocationText } from "@/services/emergency-map-core";
import type { EmergencyLocationPickerProps } from "./types";
export default function EmergencyLocationPicker({
  position,
}: EmergencyLocationPickerProps) {
  return (
    <Text style={s.text}>
      {incidentLocationText(position)} Use the installed Driver app to select an
      incident pin.
    </Text>
  );
}
