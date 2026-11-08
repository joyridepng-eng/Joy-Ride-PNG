import { API_BASE_URL } from "@/constants/api";
import { stopBackgroundGPS } from "@/services/background-gps";
import {
  DriverIdentity,
  DriverSession,
  clearDriverSession,
  loadDriverSession,
  saveDriverSession,
} from "@/services/driver-session";

type DriverAuthenticationResponse = {
  accessToken: string;
  tokenType: "Bearer";
  expiresInSeconds: number;
  driver: DriverIdentity;
};

export class DriverAuthenticationError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "DriverAuthenticationError";
  }
}

function isDriverAuthenticationResponse(
  value: unknown,
): value is DriverAuthenticationResponse {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Partial<DriverAuthenticationResponse>;

  return (
    typeof candidate.accessToken === "string" &&
    candidate.accessToken.length > 0 &&
    candidate.tokenType === "Bearer" &&
    typeof candidate.expiresInSeconds === "number" &&
    candidate.expiresInSeconds > 0 &&
    typeof candidate.driver === "object" &&
    candidate.driver !== null &&
    typeof candidate.driver.id === "string" &&
    typeof candidate.driver.fullName === "string" &&
    typeof candidate.driver.phone === "string" &&
    (typeof candidate.driver.email === "string" ||
      candidate.driver.email === null)
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

export async function loginDriver(
  phone: string,
  password: string,
): Promise<DriverSession> {
  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}/driver-auth/login`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        phone: phone.trim(),
        password,
      }),
    });
  } catch {
    throw new DriverAuthenticationError(
      `Could not connect to the backend at ${API_BASE_URL}.`,
      0,
    );
  }

  const data = await readJsonResponse(response);

  if (!response.ok) {
    throw new DriverAuthenticationError(
      getErrorMessage(data, "Driver authentication failed."),
      response.status,
    );
  }

  if (!isDriverAuthenticationResponse(data)) {
    throw new DriverAuthenticationError(
      "The backend returned an invalid Driver session.",
      502,
    );
  }

  const session: DriverSession = {
    accessToken: data.accessToken,
    tokenType: data.tokenType,
    expiresAt: Date.now() + data.expiresInSeconds * 1000,
    driver: data.driver,
  };

  await saveDriverSession(session);

  return session;
}

export async function logoutDriver(): Promise<void> {
  try { await stopBackgroundGPS(); } finally { await clearDriverSession(); }
}

export async function driverFetch(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const session = await loadDriverSession();

  if (!session) {
    throw new DriverAuthenticationError(
      "Driver authentication is required.",
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
    await clearDriverSession();

    throw new DriverAuthenticationError(
      "Your Driver session has expired. Please sign in again.",
      401,
    );
  }

  return response;
}
