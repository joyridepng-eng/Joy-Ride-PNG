import { adminFetch } from "@/services/admin-auth";

export type DriverStatus = "PENDING" | "APPROVED" | "SUSPENDED" | "INACTIVE";

export type VehicleStatus =
  "PENDING" | "APPROVED" | "ACTIVE" | "SUSPENDED" | "INACTIVE";

export type RegistryDriver = {
  id: string;
  fullName: string;
  phone: string;
  email: string | null;
  licenseNumber: string | null;
  licenseClass: string | null;
  licenseIssuedAt: string | null;
  licenseExpiresAt: string | null;
  dateOfBirth: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  emergencyContactRelationship: string | null;
  status: DriverStatus;
  isOnline: boolean;
  isAvailable: boolean;
  createdAt: string;
  updatedAt: string;
};

export type RegistryVehicle = {
  id: string;
  plateNumber: string;
  make: string | null;
  model: string | null;
  year: number | null;
  color: string | null;
  seatCount: number | null;
  chassisNumber: string | null;
  registrationNumber: string | null;
  registrationExpiresAt: string | null;
  status: VehicleStatus;
  driverId: string;
  driver: RegistryDriver;
  createdAt: string;
  updatedAt: string;
};

export type CreateRegistryDriverInput = {
  fullName: string;
  phone: string;
  email?: string;
  licenseNumber?: string;
  licenseClass?: string;
  licenseIssuedAt?: string;
  licenseExpiresAt?: string;
  dateOfBirth?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  emergencyContactRelationship?: string;
  serviceZoneId?: string;
};

export type CreateRegistryVehicleInput = {
  plateNumber: string;
  make?: string;
  model?: string;
  year?: number;
  color?: string;
  seatCount?: number;
  chassisNumber?: string;
  registrationNumber?: string;
  registrationExpiresAt?: string;
  driverId: string;
};

type ApiErrorBody = {
  message?: string | string[];
};

async function readResponse<T>(
  response: Response,
  fallbackMessage: string,
): Promise<T> {
  let data: T | ApiErrorBody | null = null;

  try {
    data = (await response.json()) as T | ApiErrorBody;
  } catch {
    data = null;
  }

  if (!response.ok) {
    const apiMessage = (data as ApiErrorBody | null)?.message;

    const message = Array.isArray(apiMessage)
      ? apiMessage.join(" ")
      : apiMessage;

    throw new Error(message || fallbackMessage);
  }

  return data as T;
}

export async function loadRegistryDrivers(): Promise<RegistryDriver[]> {
  const response = await adminFetch("/drivers", {
    headers: {
      Accept: "application/json",
    },
  });

  const data = await readResponse<RegistryDriver[]>(
    response,
    "Could not load drivers.",
  );

  return Array.isArray(data) ? data : [];
}

export async function createRegistryDriver(
  input: CreateRegistryDriverInput,
): Promise<RegistryDriver> {
  const response = await adminFetch("/drivers", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  return readResponse<RegistryDriver>(response, "Could not create driver.");
}

export async function updateRegistryDriverStatus(
  driverId: string,
  status: DriverStatus,
): Promise<RegistryDriver> {
  const response = await adminFetch(
    `/drivers/${encodeURIComponent(driverId)}/status`,
    {
      method: "PATCH",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ status }),
    },
  );

  return readResponse<RegistryDriver>(
    response,
    "Could not update driver status.",
  );
}

export type SetRegistryDriverCredentialsResult = {
  credentialsUpdated: boolean;
  driver: {
    id: string;
    fullName: string;
    phone: string;
    email: string | null;
    status: DriverStatus;
    isAuthActive: boolean;
    tokenVersion: number;
  };
};

export async function setRegistryDriverCredentials(
  driverId: string,
  password: string,
): Promise<SetRegistryDriverCredentialsResult> {
  const response = await adminFetch(
    `/driver-auth/${encodeURIComponent(driverId)}/credentials`,
    {
      method: "PATCH",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ password }),
    },
  );

  return readResponse<SetRegistryDriverCredentialsResult>(
    response,
    "Could not activate Driver credentials.",
  );
}
export async function loadRegistryVehicles(): Promise<RegistryVehicle[]> {
  const response = await adminFetch("/vehicles", {
    headers: {
      Accept: "application/json",
    },
  });

  const data = await readResponse<RegistryVehicle[]>(
    response,
    "Could not load vehicles.",
  );

  return Array.isArray(data) ? data : [];
}

export async function createRegistryVehicle(
  input: CreateRegistryVehicleInput,
): Promise<RegistryVehicle> {
  const response = await adminFetch("/vehicles", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  return readResponse<RegistryVehicle>(response, "Could not create vehicle.");
}

export async function updateRegistryVehicleStatus(
  vehicleId: string,
  status: VehicleStatus,
): Promise<RegistryVehicle> {
  const response = await adminFetch(
    `/vehicles/${encodeURIComponent(vehicleId)}/status`,
    {
      method: "PATCH",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ status }),
    },
  );

  return readResponse<RegistryVehicle>(
    response,
    "Could not update vehicle status.",
  );
}
