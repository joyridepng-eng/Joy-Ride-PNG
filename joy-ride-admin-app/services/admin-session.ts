import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

export type AdminRole = "SUPER_ADMIN" | "DISPATCHER";

export type AdminProfile = {
  id: string;
  email: string;
  fullName: string;
  role: AdminRole;
};

export type AdminSession = {
  accessToken: string;
  expiresAt: number;
  admin: AdminProfile;
};

const ADMIN_SESSION_STORAGE_KEY = "joyRide.admin.session";

let webSession: AdminSession | null = null;

type AdminSessionListener = (session: AdminSession | null) => void;

const sessionListeners = new Set<AdminSessionListener>();

function notifySessionListeners(session: AdminSession | null): void {
  for (const listener of sessionListeners) {
    listener(session);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isAdminRole(value: unknown): value is AdminRole {
  return value === "SUPER_ADMIN" || value === "DISPATCHER";
}

function isAdminSession(value: unknown): value is AdminSession {
  if (!isRecord(value) || !isRecord(value.admin)) {
    return false;
  }

  return (
    typeof value.accessToken === "string" &&
    value.accessToken.length > 0 &&
    typeof value.expiresAt === "number" &&
    Number.isFinite(value.expiresAt) &&
    typeof value.admin.id === "string" &&
    typeof value.admin.email === "string" &&
    typeof value.admin.fullName === "string" &&
    isAdminRole(value.admin.role)
  );
}

async function deleteNativeSession(): Promise<void> {
  await SecureStore.deleteItemAsync(ADMIN_SESSION_STORAGE_KEY);
}

export async function saveAdminSession(session: AdminSession): Promise<void> {
  if (Platform.OS === "web") {
    webSession = session;
    notifySessionListeners(session);
    return;
  }

  await SecureStore.setItemAsync(
    ADMIN_SESSION_STORAGE_KEY,
    JSON.stringify(session),
    {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    },
  );

  notifySessionListeners(session);
}

export async function loadAdminSession(): Promise<AdminSession | null> {
  let session: AdminSession | null = null;

  if (Platform.OS === "web") {
    session = webSession;
  } else {
    const storedSession = await SecureStore.getItemAsync(
      ADMIN_SESSION_STORAGE_KEY,
    );

    if (!storedSession) {
      return null;
    }

    try {
      const parsedSession: unknown = JSON.parse(storedSession);

      if (!isAdminSession(parsedSession)) {
        await deleteNativeSession();
        return null;
      }

      session = parsedSession;
    } catch {
      await deleteNativeSession();
      return null;
    }
  }

  if (!session || session.expiresAt <= Date.now()) {
    await clearAdminSession();
    return null;
  }

  return session;
}

export async function clearAdminSession(): Promise<void> {
  if (Platform.OS === "web") {
    webSession = null;
    notifySessionListeners(null);
    return;
  }

  await deleteNativeSession();
  notifySessionListeners(null);
}

export function subscribeToAdminSession(
  listener: AdminSessionListener,
): () => void {
  sessionListeners.add(listener);

  return () => {
    sessionListeners.delete(listener);
  };
}
