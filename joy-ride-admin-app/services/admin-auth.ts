import { API_BASE_URL } from "@/constants/api";
import {
  AdminProfile,
  AdminRole,
  AdminSession,
  clearAdminSession,
  loadAdminSession,
  saveAdminSession,
} from "@/services/admin-session";

type AdminLoginResponse = {
  accessToken: string;
  tokenType: "Bearer";
  expiresInSeconds: number;
  admin: AdminProfile;
};

export class AdminAuthenticationError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
    this.name = "AdminAuthenticationError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isAdminRole(value: unknown): value is AdminRole {
  return value === "SUPER_ADMIN" || value === "DISPATCHER";
}

function isAdminProfile(value: unknown): value is AdminProfile {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.email === "string" &&
    typeof value.fullName === "string" &&
    isAdminRole(value.role)
  );
}

function isAdminLoginResponse(value: unknown): value is AdminLoginResponse {
  return (
    isRecord(value) &&
    typeof value.accessToken === "string" &&
    value.accessToken.length > 0 &&
    value.tokenType === "Bearer" &&
    typeof value.expiresInSeconds === "number" &&
    Number.isFinite(value.expiresInSeconds) &&
    value.expiresInSeconds > 0 &&
    isAdminProfile(value.admin)
  );
}

function readErrorMessage(data: unknown, fallback: string): string {
  if (!isRecord(data)) {
    return fallback;
  }

  if (typeof data.message === "string") {
    return data.message;
  }

  if (
    Array.isArray(data.message) &&
    data.message.every(
      (message): message is string => typeof message === "string",
    )
  ) {
    return data.message.join(", ");
  }

  return fallback;
}

async function readResponseJson(response: Response): Promise<unknown> {
  return response.json().catch(() => null);
}

export async function loginAdmin(
  email: string,
  password: string,
): Promise<AdminSession> {
  const response = await fetch(`${API_BASE_URL}/admin-auth/login`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: email.trim().toLowerCase(),
      password,
    }),
  });

  const data = await readResponseJson(response);

  if (!response.ok) {
    throw new AdminAuthenticationError(
      readErrorMessage(data, "Administrator sign-in failed."),
      response.status,
    );
  }

  if (!isAdminLoginResponse(data)) {
    throw new AdminAuthenticationError(
      "The server returned an invalid administrator session.",
      500,
    );
  }

  const session: AdminSession = {
    accessToken: data.accessToken,
    expiresAt: Date.now() + data.expiresInSeconds * 1000,
    admin: data.admin,
  };

  await saveAdminSession(session);

  return session;
}

export async function logoutAdmin(): Promise<void> {
  await clearAdminSession();
}

export async function requireAdminSession(): Promise<AdminSession> {
  const session = await loadAdminSession();

  if (!session) {
    throw new AdminAuthenticationError(
      "Your administrator session has expired. Please sign in again.",
      401,
    );
  }

  return session;
}

export async function adminFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const session = await requireAdminSession();
  const headers = new Headers(init.headers);

  if (!headers.has("Accept")) {
    headers.set("Accept", "application/json");
  }

  headers.set("Authorization", `Bearer ${session.accessToken}`);

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  const response = await fetch(`${API_BASE_URL}${normalizedPath}`, {
    ...init,
    headers,
  });

  if (response.status === 401) {
    await clearAdminSession();

    throw new AdminAuthenticationError(
      "Your administrator session has expired. Please sign in again.",
      401,
    );
  }

  return response;
}
