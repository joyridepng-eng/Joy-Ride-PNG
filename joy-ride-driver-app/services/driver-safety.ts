import { API_BASE_URL } from "@/constants/api";
import { loadDriverSession } from "@/services/driver-session";
import * as SecureStore from "expo-secure-store";
import * as Location from "expo-location";
import { Platform } from "react-native";
import {
  createSafetyClient,
  DriverSafetyError,
  parsePosition,
  type Position,
  type Request,
} from "./driver-safety-core";

export function createSafetyRequest(timeoutMs = 15000): Request {
  return async (driverId, path, init = {}) => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let onAbort = () => {};
    try {
      const deadline = new Promise<never>((_, reject) => {
        onAbort = () => {
          controller.abort();
          reject(
            new DriverSafetyError(
              "Request interrupted. Receipt is unknown; retry the saved alert when ready.",
            ),
          );
        };
        if (init.signal?.aborted) return onAbort();
        init.signal?.addEventListener("abort", onAbort, { once: true });
        timer = setTimeout(() => {
          controller.abort();
          reject(
            new DriverSafetyError(
              "No confirmation received. Retry the saved alert; do not assume Admin received it.",
            ),
          );
        }, timeoutMs);
      });
      const work = async () => {
        const session = await loadDriverSession();
        if (!session || session.driver.id !== driverId)
          throw new DriverSafetyError(
            "Sign in as the driver who created this alert before continuing.",
          );
        if (controller.signal.aborted)
          throw new DriverSafetyError("Request interrupted.");
        const response = await fetch(`${API_BASE_URL}${path}`, {
          ...init,
          signal: controller.signal,
          headers: {
            "Cache-Control": "no-store",
            Accept: "application/json",
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.accessToken}`,
          },
        });
        if (!response.ok) {
          const messages: Record<number, string> = {
            400: "The request was rejected. Keep the saved alert and contact Admin.",
            401: "Your session has expired. Sign in again, then retry the saved alert.",
            403: "Access was refused. Contact Admin directly.",
            404: "The safety feature or record is unavailable. Contact Admin directly.",
            409: "The saved alert conflicts with a server record. Contact Admin; do not replace it.",
            429: "Too many requests. Wait a minute before retrying the saved alert.",
          };
          throw new DriverSafetyError(
            messages[response.status] ??
              "Service unavailable. The result is unknown; retry the same saved alert.",
          );
        }
        return (await response.json()) as unknown;
      };
      return await Promise.race([deadline, work()]);
    } catch (e) {
      if (e instanceof DriverSafetyError) throw e;
      throw new DriverSafetyError(
        "Connection or response failed. Receipt is unknown; retry the saved alert.",
      );
    } finally {
      if (timer) clearTimeout(timer);
      init.signal?.removeEventListener("abort", onAbort);
    }
  };
}
export const driverSafety = createSafetyClient(
  {
    read: async (key) => {
      if (Platform.OS === "web")
        throw new DriverSafetyError(
          "Use the installed Driver app for emergency submission and saved retries.",
        );
      return SecureStore.getItemAsync(key);
    },
    write: async (key, value) => {
      if (Platform.OS === "web")
        throw new DriverSafetyError(
          "Use the installed Driver app for emergency submission.",
        );
      await SecureStore.setItemAsync(key, value, {
        keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      });
    },
  },
  createSafetyRequest(),
);

// This is an optional, separate button. Submission never waits for GPS or a
// permission dialog; failure/denial/timeout simply leaves location absent.
export async function optionalPosition(): Promise<Position | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const work = async () => {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) return undefined;
      const p = await Location.getLastKnownPositionAsync({
        maxAge: 120000,
        requiredAccuracy: 1000,
      });
      if (
        !p ||
        !Number.isFinite(p.timestamp) ||
        p.timestamp > Date.now() + 60000 ||
        Date.now() - p.timestamp > 120000
      )
        return undefined;
      return parsePosition({
        source: "GPS",
        latitude: p.coords.latitude,
        longitude: p.coords.longitude,
        recordedAt: new Date(p.timestamp).toISOString(),
        ...(p.coords.accuracy !== null && p.coords.accuracy >= 0
          ? { accuracyMeters: p.coords.accuracy }
          : {}),
      });
    };
    return await Promise.race([
      work(),
      new Promise<undefined>((resolve) => {
        timer = setTimeout(() => resolve(undefined), 4000);
      }),
    ]);
  } catch {
    return undefined;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
