import { adminFetch } from "@/services/admin-auth";

export type AdminNotificationRide = {
  id: string;
  status: string;
  pickupLabel: string;
  pickupAddress: string | null;
  dropoffLabel: string;
  dropoffAddress: string | null;
  requestedAt: string;
  driver: {
    id: string;
    fullName: string;
  } | null;
  vehicle: {
    id: string;
    plateNumber: string;
  } | null;
};

export type AdminNotificationInboxItem = {
  id: string;
  audience: "ADMIN";
  eventType: "RIDE_REQUESTED" | "RIDE_ASSIGNED" | "DRIVER_EMERGENCY_ALERT";
  emergencyAlertId?: string | null;
  emergencyAlert?: {
    id: string;
    status: "OPEN" | "ACKNOWLEDGED" | "RESOLVED";
    createdAt: string;
  } | null;
  title: string;
  body: string;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
  updatedAt: string;
  ride: AdminNotificationRide | null;
};

export type AdminNotificationInboxResponse = {
  unreadCount: number;
  items: AdminNotificationInboxItem[];
};

type LoadAdminNotificationInboxOptions = {
  limit?: number;
  unreadOnly?: boolean;
};

type InboxChangeListener = () => void;

const inboxChangeListeners = new Set<InboxChangeListener>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isInboxItem(value: unknown): value is AdminNotificationInboxItem {
  if (!isRecord(value)) {
    return false;
  }

  const ride = value.ride;

  return (
    typeof value.id === "string" &&
    value.audience === "ADMIN" &&
    (value.eventType === "RIDE_REQUESTED" ||
      value.eventType === "RIDE_ASSIGNED" ||
      value.eventType === "DRIVER_EMERGENCY_ALERT") &&
    typeof value.title === "string" &&
    typeof value.body === "string" &&
    typeof value.isRead === "boolean" &&
    (value.readAt === null || typeof value.readAt === "string") &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string" &&
    (ride === null || isRecord(ride)) &&
    (value.eventType !== "DRIVER_EMERGENCY_ALERT" ||
      (typeof value.emergencyAlertId === "string" &&
        /^[A-Za-z0-9_-]{1,64}$/.test(value.emergencyAlertId) &&
        isRecord(value.emergencyAlert) &&
        value.emergencyAlert.id === value.emergencyAlertId &&
        ["OPEN", "ACKNOWLEDGED", "RESOLVED"].includes(
          String(value.emergencyAlert.status),
        ) &&
        typeof value.emergencyAlert.createdAt === "string"))
  );
}

function getApiErrorMessage(value: unknown, fallback: string): string {
  if (!isRecord(value)) {
    return fallback;
  }

  const message = value.message;

  if (typeof message === "string") {
    return message;
  }

  if (
    Array.isArray(message) &&
    message.every((entry: unknown) => typeof entry === "string")
  ) {
    return message.join("\n");
  }

  return fallback;
}

async function ensureSuccessfulResponse(
  response: Response,
  fallbackMessage: string,
): Promise<void> {
  if (response.ok) {
    return;
  }

  let payload: unknown = null;

  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  throw new Error(getApiErrorMessage(payload, fallbackMessage));
}

function emitInboxChanged(): void {
  inboxChangeListeners.forEach((listener) => {
    listener();
  });
}

export function subscribeToAdminInboxChanges(
  listener: InboxChangeListener,
): () => void {
  inboxChangeListeners.add(listener);

  return () => {
    inboxChangeListeners.delete(listener);
  };
}

export async function loadAdminNotificationInbox(
  options: LoadAdminNotificationInboxOptions = {},
): Promise<AdminNotificationInboxResponse> {
  const limit = options.limit ?? 50;
  const unreadOnly = options.unreadOnly ?? false;

  const query = new URLSearchParams({
    limit: String(limit),
    unreadOnly: String(unreadOnly),
  });

  const response = await adminFetch(
    `/notifications/admin/me?${query.toString()}`,
  );

  await ensureSuccessfulResponse(
    response,
    "Could not load the Admin notification inbox.",
  );

  const payload: unknown = await response.json();

  if (!isRecord(payload) || typeof payload.unreadCount !== "number") {
    throw new Error("The Admin notification inbox response is invalid.");
  }

  const itemsValue: unknown = payload.items;

  if (!Array.isArray(itemsValue)) {
    throw new Error("The Admin notification collection is invalid.");
  }

  const items: AdminNotificationInboxItem[] = [];

  for (const item of itemsValue as unknown[]) {
    if (!isInboxItem(item)) {
      throw new Error("An Admin notification item is invalid.");
    }

    items.push(item);
  }

  return {
    unreadCount: payload.unreadCount,
    items,
  };
}

export async function markAdminNotificationRead(
  notificationId: string,
): Promise<void> {
  const response = await adminFetch(
    `/notifications/admin/me/${encodeURIComponent(notificationId)}/read`,
    {
      method: "PATCH",
    },
  );

  await ensureSuccessfulResponse(
    response,
    "Could not mark the notification as read.",
  );

  emitInboxChanged();
}

export async function markAllAdminNotificationsRead(): Promise<void> {
  const response = await adminFetch("/notifications/admin/me/read-all", {
    method: "PATCH",
  });

  await ensureSuccessfulResponse(
    response,
    "Could not mark all notifications as read.",
  );

  emitInboxChanged();
}
