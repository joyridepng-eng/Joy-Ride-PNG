import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const RIDER_SESSION_KEY = "joy-ride-rider-session-v1";

export type RiderIdentity = {
  id: string;
  fullName: string;
  phone: string;
  email: string | null;
};

export type RiderSession = {
  accessToken: string;
  tokenType: "Bearer";
  expiresAt: number;
  rider: RiderIdentity;
};

type RiderSessionListener = (session: RiderSession | null) => void;

const listeners = new Set<RiderSessionListener>();

let cachedSession: RiderSession | null | undefined;

function notifyListeners(session: RiderSession | null): void {
  for (const listener of listeners) {
    listener(session);
  }
}

function isRiderIdentity(value: unknown): value is RiderIdentity {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Partial<RiderIdentity>;

  return (
    typeof candidate.id === "string" &&
    typeof candidate.fullName === "string" &&
    typeof candidate.phone === "string" &&
    (typeof candidate.email === "string" || candidate.email === null)
  );
}

function isRiderSession(value: unknown): value is RiderSession {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Partial<RiderSession>;

  return (
    typeof candidate.accessToken === "string" &&
    candidate.accessToken.length > 0 &&
    candidate.tokenType === "Bearer" &&
    typeof candidate.expiresAt === "number" &&
    Number.isFinite(candidate.expiresAt) &&
    isRiderIdentity(candidate.rider)
  );
}

async function readStoredValue(): Promise<string | null> {
  if (Platform.OS === "web") {
    if (typeof window === "undefined") {
      return null;
    }

    return window.localStorage.getItem(RIDER_SESSION_KEY);
  }

  return SecureStore.getItemAsync(RIDER_SESSION_KEY);
}

async function writeStoredValue(value: string): Promise<void> {
  if (Platform.OS === "web") {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(RIDER_SESSION_KEY, value);
    }

    return;
  }

  await SecureStore.setItemAsync(RIDER_SESSION_KEY, value);
}

async function deleteStoredValue(): Promise<void> {
  if (Platform.OS === "web") {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(RIDER_SESSION_KEY);
    }

    return;
  }

  await SecureStore.deleteItemAsync(RIDER_SESSION_KEY);
}

export async function loadRiderSession(): Promise<RiderSession | null> {
  if (cachedSession !== undefined) {
    if (cachedSession && cachedSession.expiresAt <= Date.now()) {
      await clearRiderSession();
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

    if (!isRiderSession(parsed) || parsed.expiresAt <= Date.now()) {
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

export async function saveRiderSession(session: RiderSession): Promise<void> {
  if (!isRiderSession(session)) {
    throw new Error("Invalid Rider session.");
  }

  await writeStoredValue(JSON.stringify(session));

  cachedSession = session;
  notifyListeners(session);
}

export async function clearRiderSession(): Promise<void> {
  await deleteStoredValue();

  cachedSession = null;
  notifyListeners(null);
}

export function subscribeToRiderSession(
  listener: RiderSessionListener,
): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}
