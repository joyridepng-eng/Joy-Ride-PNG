import { riderFetch } from "@/services/rider-auth";
import * as Location from "expo-location";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import MapView, {
  Marker,
  PROVIDER_GOOGLE,
  type LatLng,
  type MapPressEvent,
} from "react-native-maps";

const PORT_MORESBY_REGION = {
  latitude: -9.4438,
  longitude: 147.1803,
  latitudeDelta: 0.1,
  longitudeDelta: 0.1,
};

type SelectionMode = "pickup" | "dropoff";

type FareQuote = {
  policyVersion: string;
  distanceMeters: number;
  distanceKm: number;
  durationSeconds: number;
  fare: number;
  legalCapApplied: boolean;
};

type FareQuoteResponse = Partial<FareQuote> & {
  message?: string | string[];
};

function buildReadableAddress(
  address: Location.LocationGeocodedAddress | null,
): string {
  if (!address) {
    return "";
  }

  const values = [
    address.name,
    address.street,
    address.district,
    address.subregion,
    address.city,
    address.region,
    address.country,
  ].filter(
    (value, index, array): value is string =>
      Boolean(value) && array.indexOf(value) === index,
  );

  return values.join(", ");
}

export default function RequestRideScreen() {
  const mapRef = useRef<MapView | null>(null);

  const [pickupLabel, setPickupLabel] = useState("");
  const [pickupAddress, setPickupAddress] = useState("");
  const [pickupCoordinate, setPickupCoordinate] = useState<LatLng | null>(null);

  const [dropoffLabel, setDropoffLabel] = useState("");
  const [dropoffAddress, setDropoffAddress] = useState("");
  const [dropoffCoordinate, setDropoffCoordinate] = useState<LatLng | null>(
    null,
  );

  const [selectionMode, setSelectionMode] = useState<SelectionMode>("pickup");

  const [message, setMessage] = useState("");
  const [createdRideId, setCreatedRideId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [fareQuote, setFareQuote] = useState<FareQuote | null>(null);
  const [isFareQuoteLoading, setIsFareQuoteLoading] = useState(false);
  const [fareQuoteError, setFareQuoteError] = useState("");

  function invalidateFareQuote() {
    setFareQuote(null);
    setFareQuoteError("");
    setIsFareQuoteLoading(false);
  }

  useEffect(() => {
    let cancelled = false;
    let quoteTimer: ReturnType<typeof setTimeout> | null = null;

    setFareQuote(null);
    setFareQuoteError("");

    if (!pickupCoordinate || !dropoffCoordinate) {
      setIsFareQuoteLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setIsFareQuoteLoading(true);

    quoteTimer = setTimeout(() => {
      void (async () => {
        try {
          const response = await riderFetch("/rides/quote", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              rideType: "STANDARD",
              pickupLabel: "Selected pickup",
              pickupLatitude: pickupCoordinate.latitude,
              pickupLongitude: pickupCoordinate.longitude,
              dropoffLabel: "Selected drop-off",
              dropoffLatitude: dropoffCoordinate.latitude,
              dropoffLongitude: dropoffCoordinate.longitude,
            }),
          });

          const data = (await response.json()) as FareQuoteResponse;

          if (cancelled) {
            return;
          }

          if (!response.ok) {
            const errorMessage = Array.isArray(data.message)
              ? data.message.join("\n")
              : data.message;

            throw new Error(
              errorMessage || "Fare estimate could not be calculated.",
            );
          }

          if (
            typeof data.policyVersion !== "string" ||
            typeof data.distanceMeters !== "number" ||
            !Number.isFinite(data.distanceMeters) ||
            typeof data.distanceKm !== "number" ||
            !Number.isFinite(data.distanceKm) ||
            typeof data.durationSeconds !== "number" ||
            !Number.isFinite(data.durationSeconds) ||
            typeof data.fare !== "number" ||
            !Number.isFinite(data.fare) ||
            typeof data.legalCapApplied !== "boolean"
          ) {
            throw new Error("The fare estimate response was invalid.");
          }

          setFareQuote({
            policyVersion: data.policyVersion,
            distanceMeters: data.distanceMeters,
            distanceKm: data.distanceKm,
            durationSeconds: data.durationSeconds,
            fare: data.fare,
            legalCapApplied: data.legalCapApplied,
          });
        } catch (error) {
          if (!cancelled) {
            setFareQuote(null);
            setFareQuoteError(
              error instanceof Error
                ? error.message
                : "Fare estimate could not be calculated.",
            );
          }
        } finally {
          if (!cancelled) {
            setIsFareQuoteLoading(false);
          }
        }
      })();
    }, 500);

    return () => {
      cancelled = true;

      if (quoteTimer) {
        clearTimeout(quoteTimer);
      }
    };
  }, [pickupCoordinate, dropoffCoordinate]);

  async function ensureLocationPermission() {
    const current = await Location.getForegroundPermissionsAsync();

    if (current.status === "granted") {
      return true;
    }

    const requested = await Location.requestForegroundPermissionsAsync();

    if (requested.status !== "granted") {
      setMessage(
        "Location permission is required to select accurate pickup and drop-off points.",
      );
      return false;
    }

    return true;
  }

  function focusCoordinate(coordinate: LatLng) {
    mapRef.current?.animateToRegion(
      {
        ...coordinate,
        latitudeDelta: 0.015,
        longitudeDelta: 0.015,
      },
      600,
    );
  }

  async function reverseAddress(coordinate: LatLng, target: SelectionMode) {
    try {
      const results = await Location.reverseGeocodeAsync(coordinate);

      const address = buildReadableAddress(results[0] ?? null);

      if (!address) {
        return;
      }

      if (target === "pickup") {
        setPickupAddress(address);
      } else {
        setDropoffAddress(address);
      }
    } catch {
      // The coordinate remains authoritative even if
      // reverse geocoding cannot provide a street name.
    }
  }

  async function useCurrentLocationForPickup() {
    try {
      setIsLocating(true);
      setMessage("");

      const allowed = await ensureLocationPermission();

      if (!allowed) {
        return;
      }

      const current = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      const coordinate = {
        latitude: current.coords.latitude,
        longitude: current.coords.longitude,
      };

      invalidateFareQuote();
      setPickupCoordinate(coordinate);
      setSelectionMode("pickup");

      focusCoordinate(coordinate);

      await reverseAddress(coordinate, "pickup");
    } catch {
      setMessage(
        "Unable to read your current GPS location. Check that Location is enabled on your phone.",
      );
    } finally {
      setIsLocating(false);
    }
  }

  async function locateTypedPlace(target: SelectionMode) {
    const label =
      target === "pickup" ? pickupLabel.trim() : dropoffLabel.trim();

    const address =
      target === "pickup" ? pickupAddress.trim() : dropoffAddress.trim();

    if (!label && !address) {
      setMessage(
        `Enter the ${target === "pickup" ? "pickup" : "drop-off"} location name or address first.`,
      );
      return;
    }

    try {
      setIsLocating(true);
      setMessage("");

      const allowed = await ensureLocationPermission();

      if (!allowed) {
        return;
      }

      const searchText = [label, address, "Port Moresby", "Papua New Guinea"]
        .filter(Boolean)
        .join(", ");

      const results = await Location.geocodeAsync(searchText);

      if (!results.length) {
        setMessage(
          `Location could not be found. Use the map and place the ${target === "pickup" ? "green pickup" : "red drop-off"} pin manually.`,
        );
        return;
      }

      const coordinate = {
        latitude: results[0].latitude,
        longitude: results[0].longitude,
      };

      invalidateFareQuote();

      if (target === "pickup") {
        setPickupCoordinate(coordinate);
      } else {
        setDropoffCoordinate(coordinate);
      }

      setSelectionMode(target);
      focusCoordinate(coordinate);

      await reverseAddress(coordinate, target);
    } catch {
      setMessage(
        "Unable to resolve that location. Please select the exact point directly on the map.",
      );
    } finally {
      setIsLocating(false);
    }
  }

  async function updateCoordinate(coordinate: LatLng, target: SelectionMode) {
    invalidateFareQuote();

    if (target === "pickup") {
      setPickupCoordinate(coordinate);
    } else {
      setDropoffCoordinate(coordinate);
    }

    await reverseAddress(coordinate, target);
  }

  function handleMapPress(event: MapPressEvent) {
    const coordinate = event.nativeEvent.coordinate;

    void updateCoordinate(coordinate, selectionMode);
  }

  async function submitRideRequest() {
    if (
      !pickupLabel.trim() ||
      !pickupAddress.trim() ||
      !dropoffLabel.trim() ||
      !dropoffAddress.trim()
    ) {
      setMessage("Please fill in all required ride details.");
      return;
    }

    if (!pickupCoordinate) {
      setMessage(
        "Select the exact pickup location using the green pickup pin.",
      );
      return;
    }

    if (!dropoffCoordinate) {
      setMessage(
        "Select the exact drop-off location using the red drop-off pin.",
      );
      return;
    }

    if (!fareQuote || isFareQuoteLoading) {
      setMessage(
        "Wait for the current distance and fare estimate before submitting your ride request.",
      );
      return;
    }

    try {
      setIsSubmitting(true);
      setMessage("");
      setCreatedRideId("");

      const response = await riderFetch("/rides", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          rideType: "STANDARD",

          pickupLabel: pickupLabel.trim(),
          pickupAddress: pickupAddress.trim(),

          pickupLatitude: pickupCoordinate.latitude,

          pickupLongitude: pickupCoordinate.longitude,

          dropoffLabel: dropoffLabel.trim(),
          dropoffAddress: dropoffAddress.trim(),

          dropoffLatitude: dropoffCoordinate.latitude,

          dropoffLongitude: dropoffCoordinate.longitude,

          notes: "Created from Joy Ride Rider App",
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setMessage(
          Array.isArray(data.message)
            ? data.message.join("\n")
            : data.message || "Failed to create ride request.",
        );
        return;
      }

      setCreatedRideId(data.id);

      const calculatedFare = Number(data.estimatedFare);

      const fareText = Number.isFinite(calculatedFare)
        ? `K${calculatedFare.toFixed(2)}`
        : "Unavailable";

      setMessage(
        `Ride request submitted successfully.\n\nPickup: ${data.pickupLabel}\nDrop-off: ${data.dropoffLabel}\nEstimated Fare: ${fareText}\nStatus: ${data.status}`,
      );
    } catch {
      setMessage(
        "Could not submit the ride request. Check your internet connection and Rider session.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.title}>Request a Ride</Text>

      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Pickup</Text>

        <TextInput
          style={styles.input}
          placeholder="Pickup place name"
          accessibilityLabel="Pickup place name"
          value={pickupLabel}
          onChangeText={setPickupLabel}
        />

        <TextInput
          style={styles.input}
          placeholder="Pickup street or area"
          accessibilityLabel="Pickup street or area"
          value={pickupAddress}
          onChangeText={setPickupAddress}
        />

        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={styles.pickupButton}
            onPress={useCurrentLocationForPickup}
            disabled={isLocating}
          >
            <Text style={styles.mapButtonText}>Use My Location</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.pickupButton}
            onPress={() => void locateTypedPlace("pickup")}
            disabled={isLocating}
          >
            <Text style={styles.mapButtonText}>Find Pickup</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Drop-off</Text>

        <TextInput
          style={styles.input}
          placeholder="Drop-off place name"
          accessibilityLabel="Drop-off place name"
          value={dropoffLabel}
          onChangeText={setDropoffLabel}
        />

        <TextInput
          style={styles.input}
          placeholder="Drop-off street or area"
          accessibilityLabel="Drop-off street or area"
          value={dropoffAddress}
          onChangeText={setDropoffAddress}
        />

        <TouchableOpacity
          style={styles.dropoffButton}
          onPress={() => void locateTypedPlace("dropoff")}
          disabled={isLocating}
        >
          <Text style={styles.mapButtonText}>Find Drop-off</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.selectorRow}>
        <TouchableOpacity
          style={[
            styles.selectorButton,
            selectionMode === "pickup" && styles.selectorPickupActive,
          ]}
          accessibilityRole="button"
          accessibilityState={{ selected: selectionMode === "pickup" }}
          onPress={() => setSelectionMode("pickup")}
        >
          <Text style={styles.selectorText}>Set Pickup</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.selectorButton,
            selectionMode === "dropoff" && styles.selectorDropoffActive,
          ]}
          accessibilityRole="button"
          accessibilityState={{ selected: selectionMode === "dropoff" }}
          onPress={() => setSelectionMode("dropoff")}
        >
          <Text style={styles.selectorText}>Set Drop-off</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.mapInstruction}>
        {selectionMode === "pickup"
          ? "Tap the map to set pickup"
          : "Tap the map to set drop-off"}
      </Text>
      <View style={styles.mapContainer}>
        <MapView
          ref={mapRef}
          provider={PROVIDER_GOOGLE}
          style={styles.map}
          initialRegion={PORT_MORESBY_REGION}
          mapType="standard"
          showsUserLocation
          showsCompass
          showsBuildings
          onPress={handleMapPress}
        >
          {pickupCoordinate ? (
            <Marker
              coordinate={pickupCoordinate}
              draggable
              pinColor="#16a34a"
              title="PICKUP"
              description={pickupAddress || pickupLabel || undefined}
              onDragEnd={(event) =>
                void updateCoordinate(event.nativeEvent.coordinate, "pickup")
              }
            />
          ) : null}

          {dropoffCoordinate ? (
            <Marker
              coordinate={dropoffCoordinate}
              draggable
              pinColor="#dc2626"
              title="DROP-OFF"
              description={dropoffAddress || dropoffLabel || undefined}
              onDragEnd={(event) =>
                void updateCoordinate(event.nativeEvent.coordinate, "dropoff")
              }
            />
          ) : null}
        </MapView>
      </View>

      <View style={styles.coordinateBox}>
        <Text style={styles.coordinateTitle}>Selected Pickup</Text>

        <Text style={styles.coordinateText}>
          {pickupCoordinate
            ? `${pickupLabel || "Pickup"} - ${pickupAddress || "Address selected"}`
            : "Pickup pin not selected"}
        </Text>

        <Text style={styles.coordinateTitle}>Selected Drop-off</Text>

        <Text style={styles.coordinateText}>
          {dropoffCoordinate
            ? `${dropoffLabel || "Drop-off"} - ${dropoffAddress || "Address selected"}`
            : "Drop-off pin not selected"}
        </Text>
      </View>

      <View style={styles.coordinateBox}>
        <Text style={styles.coordinateTitle}>Estimated Trip</Text>

        {isFareQuoteLoading ? (
          <Text style={styles.coordinateText}>
            Calculating road distance and fare...
          </Text>
        ) : fareQuote ? (
          <>
            <Text style={styles.coordinateText}>
              Road distance: {fareQuote.distanceKm.toFixed(1)} km
            </Text>

            <Text style={styles.coordinateText}>
              Estimated travel time:{" "}
              {Math.max(1, Math.ceil(fareQuote.durationSeconds / 60))} minutes
            </Text>

            <Text style={styles.coordinateText}>
              Estimated fare: K{fareQuote.fare.toFixed(2)}
            </Text>

            {fareQuote.legalCapApplied ? (
              <Text style={styles.coordinateText}>
                The regulated maximum-fare safeguard has been applied.
              </Text>
            ) : null}

            <Text style={styles.coordinateText}>
              Review the fare, then tap Request Ride.
            </Text>
          </>
        ) : (
          <Text style={styles.coordinateText}>
            {fareQuoteError ||
              "Select both pickup and drop-off pins to calculate your fare."}
          </Text>
        )}
      </View>

      <TouchableOpacity
        style={[
          styles.primaryButton,
          isSubmitting || isFareQuoteLoading || !fareQuote
            ? styles.disabledButton
            : null,
        ]}
        onPress={submitRideRequest}
        disabled={isSubmitting || isFareQuoteLoading || !fareQuote}
      >
        <Text style={styles.primaryButtonText}>
          {isSubmitting
            ? "Submitting..."
            : isFareQuoteLoading
              ? "Calculating Fare..."
              : "Request Ride"}
        </Text>
      </TouchableOpacity>

      {message ? (
        <View style={createdRideId ? styles.successBox : styles.messageBox}>
          <Text style={createdRideId ? styles.successText : styles.messageText}>
            {message}
          </Text>

          {createdRideId ? (
            <TouchableOpacity
              style={styles.statusButton}
              onPress={() =>
                router.push({
                  pathname: "/ride-status",
                  params: {
                    rideId: createdRideId,
                  },
                })
              }
            >
              <Text style={styles.statusButtonText}>Track My Ride</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 12,
    backgroundColor: "#f8fafc",
  },

  title: {
    fontSize: 30,
    fontWeight: "800",
    color: "#0f172a",
    textAlign: "center",
    marginBottom: 22,
    marginTop: 24,
  },

  label: {
    fontSize: 14,
    fontWeight: "700",
    color: "#334155",
    marginBottom: 6,
  },

  input: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 12,
  },

  phoneRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14,
  },

  countryCodeBox: {
    backgroundColor: "#e2e8f0",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderTopLeftRadius: 12,
    borderBottomLeftRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },

  countryCodeText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0f172a",
  },

  phoneInput: {
    flex: 1,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderLeftWidth: 0,
    borderTopRightRadius: 12,
    borderBottomRightRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },

  sectionCard: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 14,
    padding: 12,
    marginBottom: 14,
  },

  sectionTitle: {
    color: "#0f172a",
    fontSize: 17,
    fontWeight: "900",
    marginBottom: 10,
  },

  buttonRow: {
    flexDirection: "row",
    gap: 8,
  },

  pickupButton: {
    justifyContent: "center",
    minHeight: 48,
    flex: 1,
    backgroundColor: "#16a34a",
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 8,
  },

  dropoffButton: {
    justifyContent: "center",
    minHeight: 48,
    backgroundColor: "#dc2626",
    borderRadius: 10,
    paddingVertical: 12,
  },

  mapButtonText: {
    color: "#ffffff",
    textAlign: "center",
    fontSize: 15,
    fontWeight: "900",
  },

  selectorRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 10,
  },

  selectorButton: {
    justifyContent: "center",
    minHeight: 48,
    flex: 1,
    backgroundColor: "#64748b",
    borderRadius: 10,
    paddingVertical: 11,
  },

  selectorPickupActive: {
    backgroundColor: "#16a34a",
  },

  selectorDropoffActive: {
    backgroundColor: "#dc2626",
  },

  selectorText: {
    color: "#ffffff",
    textAlign: "center",
    fontSize: 15,
    fontWeight: "900",
  },

  mapInstruction: {
    color: "#334155",
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 8,
  },
  mapContainer: {
    height: 500,
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    marginBottom: 12,
  },

  map: {
    ...StyleSheet.absoluteFillObject,
  },

  coordinateBox: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 12,
    marginBottom: 16,
  },

  coordinateTitle: {
    color: "#334155",
    fontSize: 15,
    fontWeight: "900",
    textTransform: "uppercase",
    marginTop: 4,
  },

  coordinateText: {
    color: "#0f172a",
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "700",
    marginTop: 3,
    marginBottom: 8,
  },

  primaryButton: {
    justifyContent: "center",
    minHeight: 48,
    backgroundColor: "#2563eb",
    paddingVertical: 16,
    borderRadius: 14,
    marginTop: 10,
    marginBottom: 18,
  },

  disabledButton: {
    backgroundColor: "#94a3b8",
  },

  primaryButtonText: {
    color: "#ffffff",
    fontSize: 17,
    fontWeight: "700",
    textAlign: "center",
  },

  messageBox: {
    backgroundColor: "#fee2e2",
    borderWidth: 1,
    borderColor: "#fca5a5",
    borderRadius: 12,
    padding: 16,
    marginBottom: 40,
  },

  messageText: {
    color: "#991b1b",
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "600",
  },

  successBox: {
    backgroundColor: "#dcfce7",
    borderWidth: 1,
    borderColor: "#86efac",
    borderRadius: 12,
    padding: 16,
    marginBottom: 40,
  },

  successText: {
    color: "#166534",
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "600",
  },

  statusButton: {
    justifyContent: "center",
    minHeight: 48,
    backgroundColor: "#16a34a",
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 16,
  },

  statusButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "800",
    textAlign: "center",
  },
});
