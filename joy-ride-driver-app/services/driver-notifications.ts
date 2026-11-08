import { driverFetch } from "@/services/driver-auth";

export type DriverNotificationRide = {
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

export type DriverNotificationInboxItem = {
  id: string;
  audience: "DRIVER";
  eventType: "RIDE_ASSIGNED";
  title: string;
  body: string;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
  updatedAt: string;
  ride: DriverNotificationRide | null;
};

export type DriverNotificationInboxResponse = {
  unreadCount: number;
  items: DriverNotificationInboxItem[];
};

type LoadDriverNotificationInboxOptions = {
  limit?: number;
  unreadOnly?: boolean;
};

type InboxChangeListener = () => void;

const inboxChangeListeners = new Set<InboxChangeListener>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isInboxItem(value: unknown): value is DriverNotificationInboxItem {
  if (!isRecord(value)) {
    return false;
  }

  const ride = value.ride;

  return (
    typeof value.id === "string" &&
    value.audience === "DRIVER" &&
    value.eventType === "RIDE_ASSIGNED" &&
    typeof value.title === "string" &&
    typeof value.body === "string" &&
    typeof value.isRead === "boolean" &&
    (value.readAt === null || typeof value.readAt === "string") &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string" &&
    (ride === null || isRecord(ride))
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

export function subscribeToDriverInboxChanges(
  listener: InboxChangeListener,
): () => void {
  inboxChangeListeners.add(listener);

  return () => {
    inboxChangeListeners.delete(listener);
  };
}

export async function loadDriverNotificationInbox(
  options: LoadDriverNotificationInboxOptions = {},
): Promise<DriverNotificationInboxResponse> {
  const limit = options.limit ?? 50;
  const unreadOnly = options.unreadOnly ?? false;

  const query = new URLSearchParams({
    limit: String(limit),
    unreadOnly: String(unreadOnly),
  });

  const response = await driverFetch(
    `/notifications/driver/me?${query.toString()}`,
  );

  await ensureSuccessfulResponse(
    response,
    "Could not load the Driver assignment inbox.",
  );

  const payload: unknown = await response.json();

  if (!isRecord(payload) || typeof payload.unreadCount !== "number") {
    throw new Error("The Driver assignment inbox response is invalid.");
  }

  const itemsValue: unknown = payload.items;

  if (!Array.isArray(itemsValue)) {
    throw new Error("The Driver assignment collection is invalid.");
  }

  const items: DriverNotificationInboxItem[] = [];

  for (const item of itemsValue as unknown[]) {
    if (!isInboxItem(item)) {
      throw new Error("An Driver assignment item is invalid.");
    }

    items.push(item);
  }

  return {
    unreadCount: payload.unreadCount,
    items,
  };
}

export async function markDriverNotificationRead(
  notificationId: string,
): Promise<void> {
  const response = await driverFetch(
    `/notifications/driver/me/${encodeURIComponent(notificationId)}/read`,
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

export async function markAllDriverNotificationsRead(): Promise<void> {
  const response = await driverFetch("/notifications/driver/me/read-all", {
    method: "PATCH",
  });

  await ensureSuccessfulResponse(
    response,
    "Could not mark all notifications as read.",
  );

  emitInboxChanged();
}
