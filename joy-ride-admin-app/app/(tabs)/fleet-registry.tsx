import DriverDisciplineActions from "@/components/driver-discipline-actions";
import RegistryProfileEditor from "@/components/registry-profile-editor";
import { useAdminAuth } from "@/contexts/admin-auth-context";
import {
  createRegistryDriver,
  createRegistryVehicle,
  loadRegistryDrivers,
  loadRegistryVehicles,
  RegistryDriver,
  RegistryVehicle,
  setRegistryDriverCredentials,
  updateRegistryDriverStatus,
  updateRegistryVehicleStatus,
} from "@/services/fleet-registry";
import { useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

type RegistrySection = "drivers" | "vehicles";

type DriverForm = {
  fullName: string;
  phone: string;
  email: string;
  licenseNumber: string;
  licenseClass: string;
  licenseIssuedAt: string;
  licenseExpiresAt: string;
  dateOfBirth: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  emergencyContactRelationship: string;
};

type VehicleForm = {
  plateNumber: string;
  make: string;
  model: string;
  year: string;
  color: string;
  seatCount: string;
  chassisNumber: string;
  registrationNumber: string;
  registrationExpiresAt: string;
  driverId: string;
};

const EMPTY_DRIVER_FORM: DriverForm = {
  fullName: "",
  phone: "",
  email: "",
  licenseNumber: "",
  licenseClass: "",
  licenseIssuedAt: "",
  licenseExpiresAt: "",
  dateOfBirth: "",
  emergencyContactName: "",
  emergencyContactPhone: "",
  emergencyContactRelationship: "",
};

const EMPTY_VEHICLE_FORM: VehicleForm = {
  plateNumber: "",
  make: "",
  model: "",
  year: "",
  color: "",
  seatCount: "",
  chassisNumber: "",
  registrationNumber: "",
  registrationExpiresAt: "",
  driverId: "",
};

function optional(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

type FormFieldProps = {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  keyboardType?: "default" | "email-address" | "phone-pad" | "number-pad";
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  required?: boolean;
  secureTextEntry?: boolean;
};

function FormField({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType = "default",
  autoCapitalize = "sentences",
  required = false,
  secureTextEntry = false,
}: FormFieldProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>
        {label}
        {required ? " *" : ""}
      </Text>

      <TextInput
        autoCapitalize={autoCapitalize}
        keyboardType={keyboardType}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#94a3b8"
        secureTextEntry={secureTextEntry}
        style={styles.input}
        value={value}
      />
    </View>
  );
}

export default function FleetRegistryScreen() {
  const { session, isLoading: isAuthLoading } = useAdminAuth();
  const canManageFleet =
    !isAuthLoading && session?.admin.role === "SUPER_ADMIN";
  const [editing, setEditing] = useState<
    { kind: "driver"; record: RegistryDriver } | { kind: "vehicle"; record: RegistryVehicle } | null
  >(null);
  const [section, setSection] = useState<RegistrySection>("drivers");
  const [drivers, setDrivers] = useState<RegistryDriver[]>([]);
  const [vehicles, setVehicles] = useState<RegistryVehicle[]>([]);
  const [driverForm, setDriverForm] = useState<DriverForm>(EMPTY_DRIVER_FORM);
  const [vehicleForm, setVehicleForm] =
    useState<VehicleForm>(EMPTY_VEHICLE_FORM);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [credentialDriverId, setCredentialDriverId] = useState<string | null>(
    null,
  );
  const [credentialPassword, setCredentialPassword] = useState("");
  const [credentialConfirmation, setCredentialConfirmation] = useState("");
  const [credentialUpdatingId, setCredentialUpdatingId] = useState<
    string | null
  >(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [showDeactivatedDrivers, setShowDeactivatedDrivers] = useState(false);
    const sortedDrivers = useMemo(() =>
      [...drivers].filter(driver => showDeactivatedDrivers || driver.status !== "INACTIVE").sort((first, second) =>
        first.fullName.localeCompare(second.fullName),
      ), [drivers, showDeactivatedDrivers]);
    const vehicleChoiceDrivers = useMemo(
      () => sortedDrivers.filter(driver => driver.status !== "INACTIVE"),
      [sortedDrivers],
    );

  const loadRegistry = useCallback(
    async (refreshing = false): Promise<void> => {
      if (refreshing) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }

      setError(null);

      try {
        const [nextDrivers, nextVehicles] = await Promise.all([
          loadRegistryDrivers(),
          loadRegistryVehicles(),
        ]);

        setDrivers(nextDrivers);
        setVehicles(nextVehicles);
      } catch (nextError) {
        setError(errorMessage(nextError, "Could not load the Fleet Registry."));
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [],
  );

  useFocusEffect(
    useCallback(() => {
      void loadRegistry();
    }, [loadRegistry]),
  );

  function updateDriverField(field: keyof DriverForm, value: string): void {
    setDriverForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function updateVehicleField(field: keyof VehicleForm, value: string): void {
    setVehicleForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function submitDriver(): Promise<void> {
    if (!canManageFleet) {
      setError("Only super administrators can manage fleet records.");
      return;
    }
    const fullName = driverForm.fullName.trim();
    const phone = driverForm.phone.trim();

    setMessage(null);
    setError(null);

    if (!fullName || !phone) {
      setError("Driver name and phone number are required.");
      return;
    }

    setIsSubmitting(true);

    try {
      const driver = await createRegistryDriver({
        fullName,
        phone,
        email: optional(driverForm.email),
        licenseNumber: optional(driverForm.licenseNumber),
        licenseClass: optional(driverForm.licenseClass),
        licenseIssuedAt: optional(driverForm.licenseIssuedAt),
        licenseExpiresAt: optional(driverForm.licenseExpiresAt),
        dateOfBirth: optional(driverForm.dateOfBirth),
        emergencyContactName: optional(driverForm.emergencyContactName),
        emergencyContactPhone: optional(driverForm.emergencyContactPhone),
        emergencyContactRelationship: optional(
          driverForm.emergencyContactRelationship,
        ),
      });

      setDriverForm(EMPTY_DRIVER_FORM);
      setVehicleForm((current) => ({
        ...current,
        driverId: driver.id,
      }));
      setMessage(`${driver.fullName} was registered with PENDING status.`);
      await loadRegistry();
    } catch (nextError) {
      setError(errorMessage(nextError, "Could not register the driver."));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function submitVehicle(): Promise<void> {
    if (!canManageFleet) {
      setError("Only super administrators can manage fleet records.");
      return;
    }
        if (drivers.some(driver =>
          driver.id === vehicleForm.driverId && driver.status === "INACTIVE")) {
          setError("Select a driver who has not been deactivated.");
          return;
        }

    setMessage(null);
    setError(null);

    const year = Number(vehicleForm.year);
    const seatCount = Number(vehicleForm.seatCount);

    if (!vehicleForm.driverId) {
      setError("Select the vehicle's driver.");
      return;
    }

    if (
      !vehicleForm.plateNumber.trim() ||
      !vehicleForm.make.trim() ||
      !vehicleForm.model.trim() ||
      !vehicleForm.year.trim() ||
      !vehicleForm.color.trim() ||
      !vehicleForm.seatCount.trim() ||
      !vehicleForm.chassisNumber.trim() ||
      !vehicleForm.registrationNumber.trim() ||
      !vehicleForm.registrationExpiresAt.trim()
    ) {
      setError("Complete every vehicle field before registration.");
      return;
    }

    if (!Number.isInteger(year) || year < 1900) {
      setError("Vehicle year must be 1900 or later.");
      return;
    }

    if (!Number.isInteger(seatCount) || seatCount < 1) {
      setError("Seat count must be at least 1.");
      return;
    }

    setIsSubmitting(true);

    try {
      const vehicle = await createRegistryVehicle({
        plateNumber: vehicleForm.plateNumber.trim(),
        make: vehicleForm.make.trim(),
        model: vehicleForm.model.trim(),
        year,
        color: vehicleForm.color.trim(),
        seatCount,
        chassisNumber: vehicleForm.chassisNumber.trim(),
        registrationNumber: vehicleForm.registrationNumber.trim(),
        registrationExpiresAt: vehicleForm.registrationExpiresAt.trim(),
        driverId: vehicleForm.driverId,
      });

      setVehicleForm(EMPTY_VEHICLE_FORM);
      setMessage(`${vehicle.plateNumber} was registered with PENDING status.`);
      await loadRegistry();
    } catch (nextError) {
      setError(errorMessage(nextError, "Could not register the vehicle."));
    } finally {
      setIsSubmitting(false);
    }
  }

  function beginCredentialSetup(driverId: string): void {
    if (!canManageFleet) {
      setError("Only super administrators can manage fleet records.");
      return;
    }
    setCredentialDriverId(driverId);
    setCredentialPassword("");
    setCredentialConfirmation("");
    setMessage(null);
    setError(null);
  }

  function cancelCredentialSetup(): void {
    setCredentialDriverId(null);
    setCredentialPassword("");
    setCredentialConfirmation("");
  }

  async function submitDriverCredentials(
    driver: RegistryDriver,
  ): Promise<void> {
    if (!canManageFleet) {
      setError("Only super administrators can manage fleet records.");
      return;
    }
    setMessage(null);
    setError(null);

    if (credentialPassword.length < 12) {
      setError("Driver passwords must contain at least 12 characters.");
      return;
    }

    if (credentialPassword.length > 128) {
      setError("Driver passwords must not exceed 128 characters.");
      return;
    }

    if (credentialPassword !== credentialConfirmation) {
      setError("The Driver password confirmation does not match.");
      return;
    }

    setCredentialUpdatingId(driver.id);

    try {
      await setRegistryDriverCredentials(driver.id, credentialPassword);

      setCredentialDriverId(null);
      setCredentialPassword("");
      setCredentialConfirmation("");
      setMessage(
        `${driver.fullName}'s login credentials were activated. Any previous Driver session was revoked.`,
      );
    } catch (nextError) {
      setError(
        errorMessage(nextError, "Could not activate the Driver credentials."),
      );
    } finally {
      setCredentialUpdatingId(null);
    }
  }

    async function changeDriverDiscipline(
      driver: RegistryDriver,
      status: "SUSPENDED" | "INACTIVE",
    ): Promise<boolean> {
      if (!canManageFleet || updatingId !== null ||
          isSubmitting || credentialUpdatingId !== null) {
        return false;
      }
      setUpdatingId(driver.id);
      setMessage(null);
      setError(null);
      try {
        await updateRegistryDriverStatus(driver.id, status);
        setMessage(status === "SUSPENDED"
          ? "Driver suspended."
          : "Driver deactivated.");
        await loadRegistry();
        return true;
      } catch (nextError) {
        setError(errorMessage(nextError, "Unable to update driver status."));
        return false;
      } finally {
        setUpdatingId(null);
      }
    }

async function approveDriver(driver: RegistryDriver): Promise<void> {
    if (!canManageFleet) {
      setError("Only super administrators can manage fleet records.");
      return;
    }
    setUpdatingId(driver.id);
    setMessage(null);
    setError(null);

    try {
      await updateRegistryDriverStatus(driver.id, "APPROVED");
      setMessage(`${driver.fullName} was approved.`);
      await loadRegistry();
    } catch (nextError) {
      setError(errorMessage(nextError, "Could not approve the driver."));
    } finally {
      setUpdatingId(null);
    }
  }

  async function advanceVehicle(vehicle: RegistryVehicle): Promise<void> {
    if (!canManageFleet) {
      setError("Only super administrators can manage fleet records.");
      return;
    }
    const nextStatus =
      vehicle.status === "PENDING"
        ? "APPROVED"
        : vehicle.status === "APPROVED"
          ? "ACTIVE"
          : null;

    if (!nextStatus) {
      return;
    }

    setUpdatingId(vehicle.id);
    setMessage(null);
    setError(null);

    try {
      await updateRegistryVehicleStatus(vehicle.id, nextStatus);
      setMessage(`${vehicle.plateNumber} is now ${nextStatus}.`);
      await loadRegistry();
    } catch (nextError) {
      setError(errorMessage(nextError, "Could not update the vehicle status."));
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={() => {
            void loadRegistry(true);
          }}
        />
      }
    >
      <Text style={styles.title}>Fleet Registry</Text>

      <Text style={styles.subtitle}>
        {canManageFleet
          ? "Register, review, and activate Joy Ride drivers and vehicles."
          : "View registered Joy Ride drivers and vehicles."}
      </Text>

      <View style={styles.sectionTabs}>
        <TouchableOpacity
          onPress={() => setSection("drivers")}
          style={[
            styles.sectionTab,
            section === "drivers" && styles.sectionTabActive,
          ]}
        >
          <Text
            style={[
              styles.sectionTabText,
              section === "drivers" && styles.sectionTabTextActive,
            ]}
          >
            Drivers ({drivers.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setSection("vehicles")}
          style={[
            styles.sectionTab,
            section === "vehicles" && styles.sectionTabActive,
          ]}
        >
          <Text
            style={[
              styles.sectionTabText,
              section === "vehicles" && styles.sectionTabTextActive,
            ]}
          >
            Vehicles ({vehicles.length})
          </Text>
        </TouchableOpacity>
      </View>

      {error ? (
        <View style={styles.errorBox}>
          <Text accessibilityRole="alert" style={styles.errorText}>
            {error}
          </Text>
        </View>
      ) : null}

      {message ? (
        <View style={styles.successBox}>
          <Text style={styles.successText}>{message}</Text>
        </View>
      ) : null}

      {isLoading ? (
        <ActivityIndicator color="#7c3aed" size="large" style={styles.loader} />
      ) : null}

      {section === "drivers" ? (
        <>
          {canManageFleet ? (
          <View style={styles.formCard}>
            <Text style={styles.cardTitle}>Register Driver</Text>

            <Text style={styles.formHint}>
              Fields marked with * are required. Complete the licence and
              emergency-contact fields before approval.
            </Text>

            <FormField
              label="Full name"
              required
              value={driverForm.fullName}
              onChangeText={(value) => updateDriverField("fullName", value)}
              placeholder="Peter Kila"
              autoCapitalize="words"
            />

            <FormField
              label="Phone"
              required
              value={driverForm.phone}
              onChangeText={(value) => updateDriverField("phone", value)}
              placeholder="+67570001234"
              keyboardType="phone-pad"
              autoCapitalize="none"
            />

            <FormField
              label="Email"
              value={driverForm.email}
              onChangeText={(value) => updateDriverField("email", value)}
              placeholder="driver@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
            />

            <FormField
              label="Licence number"
              value={driverForm.licenseNumber}
              onChangeText={(value) =>
                updateDriverField("licenseNumber", value)
              }
              autoCapitalize="characters"
            />

            <FormField
              label="Licence class"
              value={driverForm.licenseClass}
              onChangeText={(value) => updateDriverField("licenseClass", value)}
            />

            <FormField
              label="Licence issued"
              value={driverForm.licenseIssuedAt}
              onChangeText={(value) =>
                updateDriverField("licenseIssuedAt", value)
              }
              placeholder="2025-01-15"
              autoCapitalize="none"
            />

            <FormField
              label="Licence expires"
              value={driverForm.licenseExpiresAt}
              onChangeText={(value) =>
                updateDriverField("licenseExpiresAt", value)
              }
              placeholder="2030-01-15"
              autoCapitalize="none"
            />

            <FormField
              label="Date of birth"
              value={driverForm.dateOfBirth}
              onChangeText={(value) => updateDriverField("dateOfBirth", value)}
              placeholder="1990-06-20"
              autoCapitalize="none"
            />

            <FormField
              label="Emergency contact name"
              value={driverForm.emergencyContactName}
              onChangeText={(value) =>
                updateDriverField("emergencyContactName", value)
              }
              autoCapitalize="words"
            />

            <FormField
              label="Emergency contact phone"
              value={driverForm.emergencyContactPhone}
              onChangeText={(value) =>
                updateDriverField("emergencyContactPhone", value)
              }
              keyboardType="phone-pad"
              autoCapitalize="none"
            />

            <FormField
              label="Emergency contact relationship"
              value={driverForm.emergencyContactRelationship}
              onChangeText={(value) =>
                updateDriverField("emergencyContactRelationship", value)
              }
              placeholder="Spouse"
            />

            <TouchableOpacity
              disabled={isSubmitting}
              onPress={() => {
                void submitDriver();
              }}
              style={[
                styles.primaryButton,
                isSubmitting && styles.disabledButton,
              ]}
            >
              <Text style={styles.primaryButtonText}>
                {isSubmitting ? "Registering..." : "Register Driver"}
              </Text>
            </TouchableOpacity>
          </View>
          ) : null}


<TouchableOpacity
  accessibilityRole="checkbox"
  accessibilityState={{ checked: showDeactivatedDrivers }}
  onPress={() => setShowDeactivatedDrivers(current => !current)}
  style={styles.credentialsButton}
>
  <Text style={styles.credentialsButtonText}>
    {showDeactivatedDrivers
      ? "Hide deactivated drivers"
      : "Show deactivated drivers"}
  </Text>
</TouchableOpacity>
<Text style={styles.listTitle}>Registered Drivers</Text>

          {sortedDrivers.length === 0 && !isLoading ? (
            <Text style={styles.emptyText}>No drivers are registered.</Text>
          ) : (
            sortedDrivers.map((driver) => (
              <View key={driver.id} style={styles.recordCard}>
                {canManageFleet ? (
                  <TouchableOpacity
                    accessibilityRole="button"
                    disabled={isSubmitting || updatingId !== null || credentialUpdatingId !== null}
                    onPress={() => setEditing({ kind: "driver", record: driver })}
                    style={styles.primaryButton}
                  >
                    <Text style={styles.primaryButtonText}>Edit Driver</Text>
                  </TouchableOpacity>
                ) : null}
    {canManageFleet ? (
      <DriverDisciplineActions
        driver={driver}
        disabled={isSubmitting || updatingId !== null ||
          credentialUpdatingId !== null}
        onSubmit={changeDriverDiscipline}
      />
    ) : null}

                <View style={styles.recordHeader}>
                  <Text style={styles.recordTitle}>{driver.fullName}</Text>

                  <Text style={styles.status}>{driver.status}</Text>
                </View>

                <Text style={styles.recordText}>{driver.phone}</Text>

                {driver.email ? (
                  <Text style={styles.recordText}>{driver.email}</Text>
                ) : null}

                <Text style={styles.recordMeta}>
                  Licence: {driver.licenseNumber || "Not provided"}
                </Text>

                {canManageFleet && driver.status === "PENDING" ? (
                  <TouchableOpacity
                    disabled={updatingId === driver.id}
                    onPress={() => {
                      void approveDriver(driver);
                    }}
                    style={[
                      styles.approveButton,
                      updatingId === driver.id && styles.disabledButton,
                    ]}
                  >
                    <Text style={styles.approveButtonText}>
                      {updatingId === driver.id
                        ? "Approving..."
                        : "Approve Driver"}
                    </Text>
                  </TouchableOpacity>
                ) : null}

                {canManageFleet && driver.status === "APPROVED" ? (
                  credentialDriverId === driver.id ? (
                    <View style={styles.credentialPanel}>
                      <Text style={styles.credentialTitle}>
                        Driver Login Password
                      </Text>

                      <Text style={styles.credentialHint}>
                        Use 12–128 characters. Saving a new password revokes any
                        existing Driver session.
                      </Text>

                      <FormField
                        label="New password"
                        required
                        value={credentialPassword}
                        onChangeText={setCredentialPassword}
                        placeholder="At least 12 characters"
                        autoCapitalize="none"
                        secureTextEntry
                      />

                      <FormField
                        label="Confirm password"
                        required
                        value={credentialConfirmation}
                        onChangeText={setCredentialConfirmation}
                        placeholder="Enter the password again"
                        autoCapitalize="none"
                        secureTextEntry
                      />

                      <View style={styles.credentialActions}>
                        <TouchableOpacity
                          disabled={credentialUpdatingId === driver.id}
                          onPress={cancelCredentialSetup}
                          style={styles.credentialCancelButton}
                        >
                          <Text style={styles.credentialCancelText}>
                            Cancel
                          </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          disabled={credentialUpdatingId === driver.id}
                          onPress={() => {
                            void submitDriverCredentials(driver);
                          }}
                          style={[
                            styles.credentialSaveButton,
                            credentialUpdatingId === driver.id &&
                              styles.disabledButton,
                          ]}
                        >
                          <Text style={styles.credentialSaveText}>
                            {credentialUpdatingId === driver.id
                              ? "Activating..."
                              : "Activate Login"}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : (
                    <TouchableOpacity
                      onPress={() => beginCredentialSetup(driver.id)}
                      style={styles.credentialsButton}
                    >
                      <Text style={styles.credentialsButtonText}>
                        Set or Reset Login Password
                      </Text>
                    </TouchableOpacity>
                  )
                ) : null}
              </View>
            ))
          )}
        </>
      ) : (
        <>
          {canManageFleet ? (
          <View style={styles.formCard}>
            <Text style={styles.cardTitle}>Register Vehicle</Text>

            <Text style={styles.formHint}>
              Complete all vehicle fields so the record can be approved after
              registration.
            </Text>

            <Text style={styles.label}>Assigned driver *</Text>

            <View style={styles.driverChoices}>
              {vehicleChoiceDrivers.length === 0 ? (
                <Text style={styles.emptyText}>Register a driver first.</Text>
              ) : (
                vehicleChoiceDrivers.map((driver) => (
                  <TouchableOpacity
                    key={driver.id}
                    onPress={() => updateVehicleField("driverId", driver.id)}
                    style={[
                      styles.driverChoice,
                      vehicleForm.driverId === driver.id &&
                        styles.driverChoiceSelected,
                    ]}
                  >
                    <Text style={styles.driverChoiceName}>
                      {driver.fullName}
                    </Text>

                    <Text style={styles.driverChoiceMeta}>
                      {driver.phone} â€¢ {driver.status}
                    </Text>
                  </TouchableOpacity>
                ))
              )}
            </View>

            <FormField
              label="Plate number"
              required
              value={vehicleForm.plateNumber}
              onChangeText={(value) => updateVehicleField("plateNumber", value)}
              placeholder="BEX 123"
              autoCapitalize="characters"
            />

            <FormField
              label="Make"
              required
              value={vehicleForm.make}
              onChangeText={(value) => updateVehicleField("make", value)}
              placeholder="Toyota"
              autoCapitalize="words"
            />

            <FormField
              label="Model"
              required
              value={vehicleForm.model}
              onChangeText={(value) => updateVehicleField("model", value)}
              placeholder="Camry"
              autoCapitalize="words"
            />

            <FormField
              label="Year"
              required
              value={vehicleForm.year}
              onChangeText={(value) => updateVehicleField("year", value)}
              placeholder="2021"
              keyboardType="number-pad"
              autoCapitalize="none"
            />

            <FormField
              label="Color"
              required
              value={vehicleForm.color}
              onChangeText={(value) => updateVehicleField("color", value)}
              placeholder="White"
              autoCapitalize="words"
            />

            <FormField
              label="Seat count"
              required
              value={vehicleForm.seatCount}
              onChangeText={(value) => updateVehicleField("seatCount", value)}
              placeholder="4"
              keyboardType="number-pad"
              autoCapitalize="none"
            />

            <FormField
              label="Chassis number"
              required
              value={vehicleForm.chassisNumber}
              onChangeText={(value) =>
                updateVehicleField("chassisNumber", value)
              }
              autoCapitalize="characters"
            />

            <FormField
              label="Registration number"
              required
              value={vehicleForm.registrationNumber}
              onChangeText={(value) =>
                updateVehicleField("registrationNumber", value)
              }
              autoCapitalize="characters"
            />

            <FormField
              label="Registration expires"
              required
              value={vehicleForm.registrationExpiresAt}
              onChangeText={(value) =>
                updateVehicleField("registrationExpiresAt", value)
              }
              placeholder="2027-08-31"
              autoCapitalize="none"
            />

            <TouchableOpacity
              disabled={isSubmitting}
              onPress={() => {
                void submitVehicle();
              }}
              style={[
                styles.primaryButton,
                isSubmitting && styles.disabledButton,
              ]}
            >
              <Text style={styles.primaryButtonText}>
                {isSubmitting ? "Registering..." : "Register Vehicle"}
              </Text>
            </TouchableOpacity>
          </View>
          ) : null}

          <Text style={styles.listTitle}>Registered Vehicles</Text>

          {vehicles.length === 0 && !isLoading ? (
            <Text style={styles.emptyText}>No vehicles are registered.</Text>
          ) : (
            vehicles.map((vehicle) => (
              <View key={vehicle.id} style={styles.recordCard}>
                {canManageFleet ? (
                  <TouchableOpacity
                    accessibilityRole="button"
                    disabled={isSubmitting || updatingId !== null || credentialUpdatingId !== null}
                    onPress={() => setEditing({ kind: "vehicle", record: vehicle })}
                    style={styles.primaryButton}
                  >
                    <Text style={styles.primaryButtonText}>Edit Vehicle</Text>
                  </TouchableOpacity>
                ) : null}
                <View style={styles.recordHeader}>
                  <Text style={styles.recordTitle}>{vehicle.plateNumber}</Text>

                  <Text style={styles.status}>{vehicle.status}</Text>
                </View>

                <Text style={styles.recordText}>
                  {[vehicle.color, vehicle.make, vehicle.model]
                    .filter(Boolean)
                    .join(" ") || "Profile incomplete"}
                </Text>

                <Text style={styles.recordMeta}>
                  Driver: {vehicle.driver.fullName}
                </Text>

                <Text style={styles.recordMeta}>
                  Registration expires:{" "}
                  {vehicle.registrationExpiresAt
                    ? new Date(
                        vehicle.registrationExpiresAt,
                      ).toLocaleDateString()
                    : "Not provided"}
                </Text>

                {canManageFleet &&
                (vehicle.status === "PENDING" ||
                  vehicle.status === "APPROVED") ? (
                  <TouchableOpacity
                    disabled={updatingId === vehicle.id}
                    onPress={() => {
                      void advanceVehicle(vehicle);
                    }}
                    style={[
                      styles.approveButton,
                      updatingId === vehicle.id && styles.disabledButton,
                    ]}
                  >
                    <Text style={styles.approveButtonText}>
                      {updatingId === vehicle.id
                        ? "Updating..."
                        : vehicle.status === "PENDING"
                          ? "Approve Vehicle"
                          : "Activate Vehicle"}
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ))
          )}
        </>
      )}
      {editing && canManageFleet ? (
        <RegistryProfileEditor
          key={`${editing.kind}:${editing.record.id}`}
          kind={editing.kind}
          record={editing.record}
          onClose={() => setEditing(null)}
          onSaved={() => {
            const label = editing.kind === "driver" ? "Driver" : "Vehicle";
            setEditing(null);
            setMessage(`${label} changes saved.`);
            void loadRegistry(true);
          }}
        />
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 24,
    paddingBottom: 48,
    backgroundColor: "#f8fafc",
  },
  title: {
    marginTop: 24,
    color: "#0f172a",
    fontSize: 30,
    fontWeight: "900",
    textAlign: "center",
  },
  subtitle: {
    marginTop: 8,
    marginBottom: 20,
    color: "#475569",
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
  },
  sectionTabs: {
    flexDirection: "row",
    marginBottom: 18,
    padding: 4,
    backgroundColor: "#e2e8f0",
    borderRadius: 14,
  },
  sectionTab: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
  },
  sectionTabActive: {
    backgroundColor: "#7c3aed",
  },
  sectionTabText: {
    color: "#475569",
    fontWeight: "800",
    textAlign: "center",
  },
  sectionTabTextActive: {
    color: "#ffffff",
  },
  loader: {
    marginVertical: 24,
  },
  formCard: {
    marginBottom: 24,
    padding: 18,
    backgroundColor: "#ffffff",
    borderColor: "#e2e8f0",
    borderRadius: 16,
    borderWidth: 1,
  },
  cardTitle: {
    color: "#0f172a",
    fontSize: 21,
    fontWeight: "900",
  },
  formHint: {
    marginTop: 6,
    marginBottom: 16,
    color: "#64748b",
    fontSize: 13,
    lineHeight: 19,
  },
  field: {
    marginBottom: 14,
  },
  label: {
    marginBottom: 6,
    color: "#334155",
    fontSize: 13,
    fontWeight: "800",
  },
  input: {
    minHeight: 48,
    paddingHorizontal: 13,
    color: "#0f172a",
    backgroundColor: "#ffffff",
    borderColor: "#cbd5e1",
    borderRadius: 11,
    borderWidth: 1,
    fontSize: 15,
  },
  primaryButton: {
    minHeight: 50,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
    backgroundColor: "#7c3aed",
    borderRadius: 12,
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "800",
  },
  disabledButton: {
    opacity: 0.55,
  },
  errorBox: {
    marginBottom: 16,
    padding: 14,
    backgroundColor: "#fef2f2",
    borderColor: "#fecaca",
    borderRadius: 12,
    borderWidth: 1,
  },
  errorText: {
    color: "#991b1b",
    fontWeight: "700",
  },
  successBox: {
    marginBottom: 16,
    padding: 14,
    backgroundColor: "#dcfce7",
    borderColor: "#86efac",
    borderRadius: 12,
    borderWidth: 1,
  },
  successText: {
    color: "#166534",
    fontWeight: "700",
  },
  listTitle: {
    marginBottom: 12,
    color: "#0f172a",
    fontSize: 21,
    fontWeight: "900",
  },
  emptyText: {
    paddingVertical: 18,
    color: "#64748b",
    textAlign: "center",
  },
  recordCard: {
    marginBottom: 14,
    padding: 16,
    backgroundColor: "#ffffff",
    borderColor: "#e2e8f0",
    borderRadius: 14,
    borderWidth: 1,
  },
  recordHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  recordTitle: {
    flex: 1,
    color: "#0f172a",
    fontSize: 17,
    fontWeight: "900",
  },
  status: {
    color: "#7c3aed",
    fontSize: 12,
    fontWeight: "900",
  },
  recordText: {
    marginTop: 6,
    color: "#334155",
    fontSize: 14,
  },
  recordMeta: {
    marginTop: 5,
    color: "#64748b",
    fontSize: 13,
  },
  approveButton: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 14,
    backgroundColor: "#ede9fe",
    borderRadius: 10,
  },
  approveButtonText: {
    color: "#6d28d9",
    fontSize: 14,
    fontWeight: "800",
  },
  credentialsButton: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 12,
    backgroundColor: "#eff6ff",
    borderColor: "#bfdbfe",
    borderRadius: 10,
    borderWidth: 1,
  },
  credentialsButtonText: {
    color: "#1d4ed8",
    fontSize: 14,
    fontWeight: "800",
  },
  credentialPanel: {
    marginTop: 14,
    padding: 14,
    backgroundColor: "#f8fafc",
    borderColor: "#cbd5e1",
    borderRadius: 12,
    borderWidth: 1,
  },
  credentialTitle: {
    color: "#0f172a",
    fontSize: 16,
    fontWeight: "900",
  },
  credentialHint: {
    marginTop: 5,
    marginBottom: 12,
    color: "#64748b",
    fontSize: 13,
    lineHeight: 19,
  },
  credentialActions: {
    flexDirection: "row",
    gap: 10,
  },
  credentialCancelButton: {
    flex: 1,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#e2e8f0",
    borderRadius: 10,
  },
  credentialCancelText: {
    color: "#334155",
    fontSize: 14,
    fontWeight: "800",
  },
  credentialSaveButton: {
    flex: 1,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#2563eb",
    borderRadius: 10,
  },
  credentialSaveText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "800",
  },
  driverChoices: {
    marginBottom: 16,
    gap: 8,
  },
  driverChoice: {
    padding: 12,
    backgroundColor: "#f8fafc",
    borderColor: "#cbd5e1",
    borderRadius: 10,
    borderWidth: 1,
  },
  driverChoiceSelected: {
    backgroundColor: "#ede9fe",
    borderColor: "#7c3aed",
    borderWidth: 2,
  },
  driverChoiceName: {
    color: "#0f172a",
    fontSize: 14,
    fontWeight: "800",
  },
  driverChoiceMeta: {
    marginTop: 3,
    color: "#64748b",
    fontSize: 12,
  },
});
