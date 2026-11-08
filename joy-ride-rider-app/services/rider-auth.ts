import { API_BASE_URL } from "@/constants/api";
import {
  RiderIdentity,
  RiderSession,
  clearRiderSession,
  loadRiderSession,
  saveRiderSession,
} from "@/services/rider-session";

type RiderAuthenticationResponse = {
  accessToken: string;
  tokenType: "Bearer";
  expiresInSeconds: number;
  rider: RiderIdentity;
};

export type RiderRegistration = {
  fullName: string;
  phone: string;
  email?: string;
  password: string;
};

export class RiderAuthenticationError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "RiderAuthenticationError";
  }
}

function isRiderAuthenticationResponse(
  value: unknown,
): value is RiderAuthenticationResponse {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Partial<RiderAuthenticationResponse>;

  return (
    typeof candidate.accessToken === "string" &&
    candidate.accessToken.length > 0 &&
    candidate.tokenType === "Bearer" &&
    typeof candidate.expiresInSeconds === "number" &&
    candidate.expiresInSeconds > 0 &&
    typeof candidate.rider === "object" &&
    candidate.rider !== null &&
    typeof candidate.rider.id === "string" &&
    typeof candidate.rider.fullName === "string" &&
    typeof candidate.rider.phone === "string" &&
    (typeof candidate.rider.email === "string" ||
      candidate.rider.email === null)
  );
}

function getErrorMessage(value: unknown, fallback: string): string {
  if (typeof value !== "object" || value === null) {
    return fallback;
  }

  const candidate = value as {
    message?: unknown;
  };

  if (typeof candidate.message === "string") {
    return candidate.message;
  }

  if (
    Array.isArray(candidate.message) &&
    candidate.message.every((message) => typeof message === "string")
  ) {
    return candidate.message.join(". ");
  }

  return fallback;
}

async function readJsonResponse(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function authenticateRider(
  endpoint: "login" | "register",
  body: object,
): Promise<RiderSession> {
  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}/rider-auth/${endpoint}`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new RiderAuthenticationError(
      `Could not connect to the backend at ${API_BASE_URL}.`,
      0,
    );
  }

  const data = await readJsonResponse(response);

  if (!response.ok) {
    throw new RiderAuthenticationError(
      getErrorMessage(data, "Rider authentication failed."),
      response.status,
    );
  }

  if (!isRiderAuthenticationResponse(data)) {
    throw new RiderAuthenticationError(
      "The backend returned an invalid Rider session.",
      502,
    );
  }

  const session: RiderSession = {
    accessToken: data.accessToken,
    tokenType: data.tokenType,
    expiresAt: Date.now() + data.expiresInSeconds * 1000,
    rider: data.rider,
  };

  await saveRiderSession(session);

  return session;
}

export function loginRider(
  phone: string,
  password: string,
): Promise<RiderSession> {
  return authenticateRider("login", {
    phone: phone.trim(),
    password,
  });
}

export function registerRider(
  registration: RiderRegistration,
): Promise<RiderSession> {
  return authenticateRider("register", {
    fullName: registration.fullName.trim(),
    phone: registration.phone.trim(),
    email: registration.email?.trim() || undefined,
    password: registration.password,
  });
}

export async function logoutRider(): Promise<void> {
  await clearRiderSession();
}

export async function riderFetch(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const session = await loadRiderSession();

  if (!session) {
    throw new RiderAuthenticationError(
      "Rider authentication is required.",
      401,
    );
  }

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  const headers = new Headers(options.headers);

  headers.set("Accept", "application/json");
  headers.set("Authorization", `${session.tokenType} ${session.accessToken}`);

  const response = await fetch(`${API_BASE_URL}${normalizedPath}`, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    await clearRiderSession();

    throw new RiderAuthenticationError(
      "Your Rider session has expired. Please sign in again.",
      401,
    );
  }

  return response;
}
