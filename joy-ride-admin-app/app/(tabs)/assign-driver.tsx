import { adminFetch } from "@/services/admin-auth";
import {
  loadRegistryDrivers,
  loadRegistryVehicles,
  type RegistryDriver,
  type RegistryVehicle,
} from "@/services/fleet-registry";
import { useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

type Ride = {
  id: string;
  status: string;
  riderName: string;
  riderPhone: string;
  pickupLabel: string | null;
  pickupAddress: string | null;
  dropoffLabel: string | null;
  dropoffAddress: string | null;
  requestedAt: string;
  driver?: { id: string; fullName: string } | null;
  vehicle?: { plateNumber: string; make: string | null; model: string | null } | null;
};

function driverBlockReason(driver: RegistryDriver): string {
  if (driver.status !== "APPROVED") return "Driver is not approved";
  if (!driver.isOnline) return "Driver is offline";
  if (!driver.isAvailable) return "Driver is unavailable or busy";
  return "";
}

export default function AssignDriverScreen() {
  const [drivers, setDrivers] = useState<RegistryDriver[]>([]);
  const [vehicles, setVehicles] = useState<RegistryVehicle[]>([]);
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);
  const [selectedRide, setSelectedRide] = useState<Ride | null>(null);
  const [assignedRide, setAssignedRide] = useState<Ride | null>(null);
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isAssigning, setIsAssigning] = useState(false);
  const focused = useRef(false);
  const generation = useRef(0);
  const operation = useRef<"load" | "assign" | null>(null);
  const selectedDriver = drivers.find((item) => item.id === selectedDriverId) ?? null;

  const loadData = useCallback(async () => {
    if (!focused.current || operation.current !== null) return;
    operation.current = "load";
    const requestGeneration = ++generation.current;
    setIsLoading(true);
    setMessage("");
    try {
      const [driverData, vehicleData, rideResponse] = await Promise.all([
        loadRegistryDrivers(), loadRegistryVehicles(), adminFetch("/rides"),
      ]);
      if (!rideResponse.ok) throw new Error("Request failed");
      const data: unknown = await rideResponse.json();
      if (!Array.isArray(data)) throw new Error("Invalid ride list");
      if (!focused.current || requestGeneration !== generation.current) return;
      const requested = (data as Ride[])
        .filter((ride) => ride && typeof ride.id === "string" && ride.status === "REQUESTED")
        .sort((a, b) => new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime());
      setDrivers(driverData);
      setVehicles(vehicleData);
      setSelectedDriverId((previous) => driverData.some((d) => d.id === previous && !driverBlockReason(d)) ? previous : null);
      setSelectedRide(requested[0] ?? null);
      setMessage(requested.length ? "Newest requested ride loaded. Select a driver below." : "No requested rides are waiting. Registered drivers are listed below.");
    } catch {
      if (focused.current && requestGeneration === generation.current) {
        setSelectedRide(null);
        setDrivers([]);
        setVehicles([]);
        setSelectedDriverId(null);
        setMessage("Could not refresh rides and drivers. Check your admin session and API connection.");
      }
    } finally {
      if (requestGeneration === generation.current) {
        operation.current = null;
        if (focused.current) setIsLoading(false);
      }
    }
  }, []);

  useFocusEffect(useCallback(() => {
    focused.current = true;
    setIsAssigning(false);
    setAssignedRide(null);
    void loadData();
    return () => {
      focused.current = false;
      generation.current++;
      operation.current = null;
    };
  }, [loadData]));

  async function assignSelectedDriver() {
    if (operation.current !== null || !selectedRide || !selectedDriver) return;
    if (driverBlockReason(selectedDriver)) {
      setMessage(driverBlockReason(selectedDriver));
      return;
    }
    const rideId = selectedRide.id;
    const driverId = selectedDriver.id;
    operation.current = "assign";
    const requestGeneration = ++generation.current;
    setIsAssigning(true);
    setAssignedRide(null);
    setMessage("");
    try {
      // Recheck availability before submitting; the backend remains authoritative.
      const currentDrivers = await loadRegistryDrivers();
      if (!focused.current || requestGeneration !== generation.current) return;
      setDrivers(currentDrivers);
      const currentDriver = currentDrivers.find((item) => item.id === driverId);
      if (!currentDriver || driverBlockReason(currentDriver)) {
        setSelectedDriverId(null);
        setMessage("That driver is no longer available. Refresh and select an eligible driver.");
        return;
      }
      const response = await adminFetch(`/rides/${encodeURIComponent(rideId)}/assign-driver`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ driverId }),
      });
      if (!focused.current || requestGeneration !== generation.current) return;
      if (!response.ok) {
        const rejection: unknown = await response.json().catch(() => null);
        if (!focused.current || requestGeneration !== generation.current) return;
        // Only translate known business errors. Never display arbitrary server content.
        const value = rejection && typeof rejection === "object" && "message" in rejection
          ? rejection.message : undefined;
        const messages = typeof value === "string" ? [value]
          : Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
        const safeReasons: Record<string, string> = {
          "Selected driver has no active vehicle": "This driver has no ACTIVE vehicle. Activate their linked vehicle in Fleet Registry, then refresh and retry.",
          "Driver is not online": "This driver is offline. Ask them to go online, then refresh the driver list.",
          "Driver is not available": "This driver is unavailable. Check their current ride before marking them available.",
          "Driver is not assigned to the ride service zone": "The driver and ride have different service zones. Select a driver assigned to the ride's service zone.",
          "Driver not found": "The selected driver could not be found. Refresh the driver list.",
          "Ride not found": "The selected ride could not be found. Refresh the ride list.",
          "Ride already has an assigned driver and vehicle": "This ride already has a driver and vehicle. Refresh to see its current assignment.",
          "Driver is no longer available and may have been assigned to another ride": "Another assignment may have claimed this driver. Refresh and select an available driver.",
          "Ride is no longer available for driver assignment": "This ride is no longer waiting for assignment. Refresh the ride list.",
        };
        let reason = `Assignment was rejected (HTTP ${response.status}). Refresh the ride and driver list before retrying.`;
        if (response.status === 401 || response.status === 403) {
          reason = "Assignment was not authorized. Check your admin session.";
        } else if (response.status >= 500) {
          reason = "The server could not complete the assignment. Refresh the ride to check its state before retrying.";
        } else {
          for (const message of messages) {
            if (Object.prototype.hasOwnProperty.call(safeReasons, message)) {
              reason = safeReasons[message];
              break;
            }
            if (message.startsWith("Driver is not approved. Current status is ")) {
              reason = "This driver is not APPROVED. Check their approval status in Fleet Registry.";
              break;
            }
            if (message.startsWith("Driver can only be assigned while ride is REQUESTED. Current status is ")) {
              reason = "This ride is no longer REQUESTED. Refresh and select a ride waiting for assignment.";
              break;
            }
          }
        }
        setMessage(reason);
        return;
      }
      const data: unknown = await response.json();
      if (!focused.current || requestGeneration !== generation.current) return;
      if (!data || typeof data !== "object" || !("id" in data) || data.id !== rideId) {
        setSelectedRide(null);
        setMessage("The server accepted the request but returned an unexpected response. Check the ride before retrying.");
        return;
      }
      setAssignedRide(data as Ride);
      setSelectedRide(null);
      setSelectedDriverId(null);
      setMessage("Selected driver assigned successfully.");
    } catch {
      if (focused.current && requestGeneration === generation.current) {
        setSelectedRide(null);
        setMessage("Could not confirm the assignment. Refresh the ride before retrying.");
      }
    } finally {
      if (requestGeneration === generation.current) {
        operation.current = null;
        if (focused.current) setIsAssigning(false);
      }
    }
  }

  const busy = isLoading || isAssigning;
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Assign Driver</Text>
      <Text style={styles.subtitle}>Registered driver assignment</Text>
      <TouchableOpacity accessibilityRole="button" style={[styles.button, busy && styles.disabled]} disabled={busy} onPress={() => { setAssignedRide(null); void loadData(); }}>
        <Text style={styles.buttonText}>{isLoading ? "Refreshing..." : "Refresh Drivers and Requests"}</Text>
      </TouchableOpacity>
      {message ? <Text style={styles.message}>{message}</Text> : null}

      {selectedRide ? (
        <View style={styles.card}>
          <Text style={styles.heading}>Newest requested ride</Text>
          <Text style={styles.text}>{selectedRide.riderName}</Text>
          <Text style={styles.text}>Pickup: {selectedRide.pickupLabel || selectedRide.pickupAddress || "Not provided"}</Text>
          <Text style={styles.text}>Drop-off: {selectedRide.dropoffLabel || selectedRide.dropoffAddress || "Not provided"}</Text>
          <Text style={styles.small}>Requested: {new Date(selectedRide.requestedAt).toLocaleString()}</Text>
        </View>
      ) : null}

      <Text style={styles.heading}>Registered drivers ({drivers.length})</Text>
      <Text style={styles.small}>Select an approved, online, available driver. The server checks vehicle and ride eligibility when assigning.</Text>
      {drivers.map((driver) => {
        const reason = driverBlockReason(driver);
        const linkedVehicles = vehicles.filter((vehicle) => vehicle.driverId === driver.id);
        const selected = selectedDriverId === driver.id;
        return (
          <TouchableOpacity
            key={driver.id}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected, disabled: Boolean(reason) || busy }}
            disabled={Boolean(reason) || busy}
            onPress={() => setSelectedDriverId(driver.id)}
            style={[styles.card, selected && styles.selected, Boolean(reason) && styles.ineligible]}
          >
            <Text style={styles.heading}>{driver.fullName}{selected ? " - Selected" : ""}</Text>
            <Text style={styles.text}>Approval: {driver.status}</Text>
            <Text style={styles.text}>Online: {driver.isOnline ? "Yes" : "No"} | Available: {driver.isAvailable ? "Yes" : "No"}</Text>
            {linkedVehicles.map((vehicle) => (
              <Text key={vehicle.id} style={styles.small}>
                Vehicle: {vehicle.plateNumber} - {vehicle.make ?? ""} {vehicle.model ?? ""} ({vehicle.status})
              </Text>
            ))}
            {!linkedVehicles.length ? <Text style={styles.small}>No linked vehicle returned by the registry.</Text> : null}
            <Text style={styles.small}>{reason || "Available for selection"}</Text>
          </TouchableOpacity>
        );
      })}
      {!isLoading && !drivers.length ? <Text style={styles.small}>No registered drivers loaded.</Text> : null}

      <TouchableOpacity
        accessibilityRole="button"
        disabled={busy || !selectedRide || !selectedDriver || Boolean(selectedDriver && driverBlockReason(selectedDriver))}
        style={[styles.button, (busy || !selectedRide || !selectedDriver) && styles.disabled]}
        onPress={() => void assignSelectedDriver()}
      >
        <Text style={styles.buttonText}>{isAssigning ? "Assigning..." : selectedDriver ? `Assign ${selectedDriver.fullName}` : "Select a driver to assign"}</Text>
      </TouchableOpacity>
      {assignedRide ? (
        <View style={styles.card}>
          <Text style={styles.heading}>Assignment successful</Text>
          <Text style={styles.text}>Status: {assignedRide.status}</Text>
          <Text style={styles.text}>Driver: {assignedRide.driver?.fullName ?? "Selected driver"}</Text>
          {assignedRide.vehicle ? <Text style={styles.text}>Vehicle: {assignedRide.vehicle.plateNumber}</Text> : null}
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, paddingBottom: 48, backgroundColor: "#f8fafc" },
  title: { marginTop: 24, fontSize: 28, fontWeight: "900", color: "#0f172a" },
  subtitle: { fontSize: 16, color: "#475569", marginVertical: 12 },
  heading: { fontSize: 17, fontWeight: "800", color: "#0f172a", marginBottom: 6 },
  card: { padding: 16, marginVertical: 8, backgroundColor: "#fff", borderRadius: 12, borderWidth: 2, borderColor: "#e2e8f0" },
  selected: { borderColor: "#7c3aed", backgroundColor: "#f5f3ff" },
  ineligible: { backgroundColor: "#f1f5f9" },
  text: { fontSize: 14, lineHeight: 21, color: "#0f172a" },
  small: { fontSize: 12, lineHeight: 18, color: "#475569", marginBottom: 4 },
  button: { backgroundColor: "#7c3aed", padding: 15, borderRadius: 12, marginVertical: 12 },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "800", textAlign: "center" },
  disabled: { backgroundColor: "#94a3b8" },
  message: { color: "#334155", backgroundColor: "#e0f2fe", padding: 12, borderRadius: 10, marginBottom: 12 },
});
