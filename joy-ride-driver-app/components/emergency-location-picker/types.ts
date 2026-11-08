import type { Position } from "@/services/driver-safety-core";
export type EmergencyLocationPickerProps = {
  position?: Position;
  gps?: Position;
  disabled?: boolean;
  onInteraction?: () => void;
  onSelect?: (position: Position) => void;
};
