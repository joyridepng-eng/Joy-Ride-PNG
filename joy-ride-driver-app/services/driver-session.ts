import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const DRIVER_SESSION_KEY = "joy-ride-driver-session-v1";

export type DriverIdentity = {
  id: string;
  fullName: string;
  phone: string;
  email: string | null;
};

export type DriverSession = {
  accessToken: string;
  tokenType: "Bearer";
  expiresAt: number;
  driver: DriverIdentity;
};

type DriverSessionListener = (session: DriverSession | null) => void;

const listeners = new Set<DriverSessionListener>();

let cachedSession: DriverSession | null | undefined;

function notifyListeners(session: DriverSession | null): void {
  for (const listener of listeners) {
    listener(session);
  }
}

function isDriverIdentity(value: unknown): value is DriverIdentity {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Partial<DriverIdentity>;

  return (
    typeof candidate.id === "string" &&
    typeof candidate.fullName === "string" &&
    typeof candidate.phone === "string" &&
    (typeof candidate.email === "string" || candidate.email === null)
  );
}

function isDriverSession(value: unknown): value is DriverSession {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Partial<DriverSession>;

  return (
    typeof candidate.accessToken === "string" &&
    candidate.accessToken.length > 0 &&
    candidate.tokenType === "Bearer" &&
    typeof candidate.expiresAt === "number" &&
    Number.isFinite(candidate.expiresAt) &&
    isDriverIdentity(candidate.driver)
  );
}

async function readStoredValue(): Promise<string | null> {
  if (Platform.OS === "web") {
    if (typeof window === "undefined") {
      return null;
    }

    return window.localStorage.getItem(DRIVER_SESSION_KEY);
  }

  return SecureStore.getItemAsync(DRIVER_SESSION_KEY);
}

async function writeStoredValue(value: string): Promise<void> {
  if (Platform.OS === "web") {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(DRIVER_SESSION_KEY, value);
    }

    return;
  }

  await SecureStore.setItemAsync(DRIVER_SESSION_KEY, value);
}

async function deleteStoredValue(): Promise<void> {
  if (Platform.OS === "web") {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(DRIVER_SESSION_KEY);
    }

    return;
  }

  await SecureStore.deleteItemAsync(DRIVER_SESSION_KEY);
}

export async function loadDriverSession(): Promise<DriverSession | null> {
  if (cachedSession !== undefined) {
    if (cachedSession && cachedSession.expiresAt <= Date.now()) {
      await clearDriverSession();
      return null;
    }

    return cachedSession;
  }

  try {
    const storedValue = await readStoredValue();

    if (!storedValue) {
      cachedSession = null;
      return null;
    }

    const parsed: unknown = JSON.parse(storedValue);

    if (!isDriverSession(parsed) || parsed.expiresAt <= Date.now()) {
      await deleteStoredValue();
      cachedSession = null;
      return null;
    }

    cachedSession = parsed;
    return parsed;
  } catch {
    await deleteStoredValue();
    cachedSession = null;
    return null;
  }
}

export async function saveDriverSession(session: DriverSession): Promise<void> {
  if (!isDriverSession(session)) {
    throw new Error("Invalid Driver session.");
  }

  await writeStoredValue(JSON.stringify(session));

  cachedSession = session;
  notifyListeners(session);
}

export async function clearDriverSession(): Promise<void> {
  await deleteStoredValue();

  cachedSession = null;
  notifyListeners(null);
}

export function subscribeToDriverSession(
  listener: DriverSessionListener,
): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}
