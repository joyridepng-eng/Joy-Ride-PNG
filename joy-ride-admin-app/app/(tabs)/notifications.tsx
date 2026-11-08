import { useAdminAuth } from "@/contexts/admin-auth-context";
import {
  AdminNotificationInboxItem,
  loadAdminNotificationInbox,
  markAdminNotificationRead,
  markAllAdminNotificationsRead,
} from "@/services/admin-notifications";
import { Href, router, useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

const PORT_MORESBY_DATE_FORMATTER = new Intl.DateTimeFormat("en-PG", {
  timeZone: "Pacific/Port_Moresby",
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

function formatPortMoresbyTime(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return `${PORT_MORESBY_DATE_FORMATTER.format(date)} (Port Moresby)`;
}

function getRideDestination(item: AdminNotificationInboxItem): Href {
  if (item.ride?.status === "REQUESTED") {
    return "/assign-driver" as Href;
  }

  return "/ride-operations" as Href;
}

export default function AdminNotificationsScreen() {
  const { session } = useAdminAuth();
  return session ? <AdminInbox key={session.admin.id} /> : null;
}

function AdminInbox() {
  const [items, setItems] = useState<AdminNotificationInboxItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const [isMarkingAll, setIsMarkingAll] = useState(false);
  const [message, setMessage] = useState("");

  const loadInbox = useCallback(async (showInitialLoading = false) => {
    if (showInitialLoading) {
      setIsInitialLoading(true);
    }

    try {
      const inbox = await loadAdminNotificationInbox({
        limit: 50,
      });

      setItems(inbox.items);
      setUnreadCount(inbox.unreadCount);
      setMessage("");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not load the Admin notification inbox.",
      );
    } finally {
      if (showInitialLoading) {
        setIsInitialLoading(false);
      }
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadInbox(true);

      const pollingTimer = setInterval(() => {
        void loadInbox(false);
      }, 15_000);

      return () => {
        clearInterval(pollingTimer);
      };
    }, [loadInbox]),
  );

  const refreshInbox = useCallback(async () => {
    setIsRefreshing(true);

    try {
      await loadInbox(false);
    } finally {
      setIsRefreshing(false);
    }
  }, [loadInbox]);

  const markOneRead = useCallback(
    async (item: AdminNotificationInboxItem) => {
      if (item.isRead) {
        return;
      }

      setActiveItemId(item.id);

      try {
        await markAdminNotificationRead(item.id);
        await loadInbox(false);
      } catch (error) {
        setMessage(
          error instanceof Error
            ? error.message
            : "Could not mark the notification as read.",
        );
      } finally {
        setActiveItemId(null);
      }
    },
    [loadInbox],
  );

  const openRide = useCallback(async (item: AdminNotificationInboxItem) => {
    if (!item.isRead) {
      setActiveItemId(item.id);

      try {
        await markAdminNotificationRead(item.id);
      } catch (error) {
        setMessage(
          error instanceof Error
            ? error.message
            : "Could not open the notification.",
        );
        setActiveItemId(null);
        return;
      }

      setActiveItemId(null);
    }

    router.push(getRideDestination(item));
  }, []);

  const markAllRead = useCallback(async () => {
    if (unreadCount === 0) {
      return;
    }

    setIsMarkingAll(true);

    try {
      await markAllAdminNotificationsRead();
      await loadInbox(false);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not mark all notifications as read.",
      );
    } finally {
      setIsMarkingAll(false);
    }
  }, [loadInbox, unreadCount]);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.container}
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={() => {
            void refreshInbox();
          }}
        />
      }
    >
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.title}>Notification Inbox</Text>
          <Text style={styles.subtitle}>
            New Rider requests and operational updates for Joy Ride Services.
          </Text>
        </View>

        <View style={styles.unreadSummary}>
          <Text style={styles.unreadNumber}>{unreadCount}</Text>
          <Text style={styles.unreadLabel}>Unread</Text>
        </View>
      </View>

      <Pressable
        accessibilityRole="button"
        style={styles.primaryButton}
        onPress={() => router.push("/emergencies" as Href)}
      >
        <Text style={styles.primaryButtonText}>
          Open Driver Emergency Queue
        </Text>
      </Pressable>
      <Text style={styles.refreshNotice}>
        Marking an emergency notification read does not acknowledge or resolve
        the incident.
      </Text>

      <View style={styles.toolbar}>
        <Text style={styles.refreshNotice}>
          Refreshes automatically every 15 seconds
        </Text>

        <Pressable
          accessibilityRole="button"
          disabled={unreadCount === 0 || isMarkingAll}
          onPress={() => {
            void markAllRead();
          }}
          style={({ pressed }) => [
            styles.markAllButton,
            (unreadCount === 0 || isMarkingAll) && styles.disabledButton,
            pressed && styles.pressedButton,
          ]}
        >
          <Text style={styles.markAllButtonText}>
            {isMarkingAll ? "Updating..." : "Mark all read"}
          </Text>
        </Pressable>
      </View>

      {message ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{message}</Text>
        </View>
      ) : null}

      {isInitialLoading ? (
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color="#2563eb" />
          <Text style={styles.centerStateText}>Loading inbox...</Text>
        </View>
      ) : null}

      {!isInitialLoading && items.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>Inbox is clear</Text>
          <Text style={styles.emptyText}>
            New Rider requests will appear here while the Admin app or website
            is open.
          </Text>
        </View>
      ) : null}

      {!isInitialLoading
        ? items.map((item) => {
            const ride = item.ride;
            const isWorking = activeItemId === item.id;

            return (
              <View
                key={item.id}
                style={[
                  styles.notificationCard,
                  !item.isRead && styles.unreadCard,
                  item.eventType === "DRIVER_EMERGENCY_ALERT" && {
                    borderColor: "#b91c1c",
                    borderLeftWidth: 5,
                  },
                ]}
              >
                <View style={styles.cardHeading}>
                  <View style={styles.cardHeadingText}>
                    <View style={styles.titleRow}>
                      <Text style={styles.cardTitle}>{item.title}</Text>

                      {!item.isRead ? (
                        <View style={styles.newBadge}>
                          <Text style={styles.newBadgeText}>NEW</Text>
                        </View>
                      ) : null}
                    </View>

                    <Text style={styles.timestamp}>
                      {formatPortMoresbyTime(item.createdAt)}
                    </Text>
                  </View>

                  <View
                    style={[
                      styles.statusBadge,
                      ride?.status === "REQUESTED"
                        ? styles.requestedBadge
                        : styles.operationalBadge,
                    ]}
                  >
                    <Text style={styles.statusText}>
                      {item.eventType === "DRIVER_EMERGENCY_ALERT"
                        ? (item.emergencyAlert?.status ?? "EMERGENCY")
                        : (ride?.status ?? "NOTICE")}
                    </Text>
                  </View>
                </View>

                <Text style={styles.bodyText}>{item.body}</Text>

                {ride ? (
                  <View style={styles.rideDetails}>
                    <View style={styles.detailGroup}>
                      <Text style={styles.detailLabel}>Pickup</Text>
                      <Text style={styles.detailValue}>{ride.pickupLabel}</Text>
                      {ride.pickupAddress ? (
                        <Text style={styles.detailAddress}>
                          {ride.pickupAddress}
                        </Text>
                      ) : null}
                    </View>

                    <View style={styles.detailGroup}>
                      <Text style={styles.detailLabel}>Drop-off</Text>
                      <Text style={styles.detailValue}>
                        {ride.dropoffLabel}
                      </Text>
                      {ride.dropoffAddress ? (
                        <Text style={styles.detailAddress}>
                          {ride.dropoffAddress}
                        </Text>
                      ) : null}
                    </View>

                    {ride.driver ? (
                      <View style={styles.detailGroup}>
                        <Text style={styles.detailLabel}>Assigned Driver</Text>
                        <Text style={styles.detailValue}>
                          {ride.driver.fullName}
                          {ride.vehicle?.plateNumber
                            ? ` · ${ride.vehicle.plateNumber}`
                            : ""}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                ) : null}

                <View style={styles.actions}>
                  {item.eventType === "DRIVER_EMERGENCY_ALERT" &&
                  item.emergencyAlertId ? (
                    <Pressable
                      accessibilityRole="button"
                      style={[
                        styles.primaryButton,
                        { backgroundColor: "#b91c1c" },
                      ]}
                      onPress={() => {
  const alertId = item.emergencyAlertId;
  if (alertId) router.push(`/emergencies?id=${encodeURIComponent(alertId)}` as Href);
}}
                    >
                      <Text style={styles.primaryButtonText}>
                        Open Emergency
                      </Text>
                    </Pressable>
                  ) : null}

                  {!item.isRead ? (
                    <Pressable
                      accessibilityRole="button"
                      disabled={isWorking}
                      onPress={() => {
                        void markOneRead(item);
                      }}
                      style={({ pressed }) => [
                        styles.secondaryButton,
                        isWorking && styles.disabledButton,
                        pressed && styles.pressedButton,
                      ]}
                    >
                      <Text style={styles.secondaryButtonText}>
                        {isWorking ? "Updating..." : "Mark read"}
                      </Text>
                    </Pressable>
                  ) : null}

                  {ride ? (
                    <Pressable
                      accessibilityRole="button"
                      disabled={isWorking}
                      onPress={() => {
                        void openRide(item);
                      }}
                      style={({ pressed }) => [
                        styles.primaryButton,
                        isWorking && styles.disabledButton,
                        pressed && styles.pressedButton,
                      ]}
                    >
                      <Text style={styles.primaryButtonText}>
                        {ride.status === "REQUESTED"
                          ? "Open Assignment"
                          : "Open Ride Operations"}
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            );
          })
        : null}

      <Text style={styles.footerNotice}>
        This is an in-app inbox. It does not produce sound, vibration, or
        closed-app push alerts.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#f1f5f9",
  },
  container: {
    width: "100%",
    maxWidth: 1000,
    alignSelf: "center",
    paddingHorizontal: 20,
    paddingTop: 32,
    paddingBottom: 56,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
    marginBottom: 20,
  },
  headerText: {
    flex: 1,
  },
  title: {
    color: "#0f172a",
    fontSize: 30,
    fontWeight: "800",
  },
  subtitle: {
    color: "#475569",
    fontSize: 15,
    lineHeight: 22,
    marginTop: 6,
  },
  unreadSummary: {
    minWidth: 80,
    alignItems: "center",
    borderRadius: 14,
    backgroundColor: "#dbeafe",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  unreadNumber: {
    color: "#1d4ed8",
    fontSize: 24,
    fontWeight: "800",
  },
  unreadLabel: {
    color: "#1e40af",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 2,
    textTransform: "uppercase",
  },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 16,
  },
  refreshNotice: {
    flex: 1,
    color: "#64748b",
    fontSize: 13,
  },
  markAllButton: {
    borderRadius: 10,
    backgroundColor: "#0f172a",
    paddingHorizontal: 15,
    paddingVertical: 11,
  },
  markAllButtonText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "700",
  },
  errorBox: {
    borderColor: "#fecaca",
    borderWidth: 1,
    borderRadius: 12,
    backgroundColor: "#fef2f2",
    padding: 14,
    marginBottom: 16,
  },
  errorText: {
    color: "#b91c1c",
    fontSize: 14,
    lineHeight: 20,
  },
  centerState: {
    alignItems: "center",
    paddingVertical: 56,
  },
  centerStateText: {
    color: "#64748b",
    fontSize: 15,
    marginTop: 12,
  },
  emptyState: {
    alignItems: "center",
    borderColor: "#cbd5e1",
    borderWidth: 1,
    borderRadius: 16,
    backgroundColor: "#ffffff",
    paddingHorizontal: 24,
    paddingVertical: 42,
  },
  emptyTitle: {
    color: "#0f172a",
    fontSize: 20,
    fontWeight: "800",
  },
  emptyText: {
    color: "#64748b",
    fontSize: 14,
    lineHeight: 21,
    marginTop: 8,
    maxWidth: 480,
    textAlign: "center",
  },
  notificationCard: {
    borderColor: "#dbe2ea",
    borderWidth: 1,
    borderRadius: 16,
    backgroundColor: "#ffffff",
    padding: 18,
    marginBottom: 14,
  },
  unreadCard: {
    borderColor: "#60a5fa",
    borderLeftWidth: 5,
    backgroundColor: "#f8fbff",
  },
  cardHeading: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  cardHeadingText: {
    flex: 1,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  cardTitle: {
    color: "#0f172a",
    fontSize: 18,
    fontWeight: "800",
  },
  newBadge: {
    borderRadius: 999,
    backgroundColor: "#dc2626",
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  newBadgeText: {
    color: "#ffffff",
    fontSize: 10,
    fontWeight: "800",
  },
  timestamp: {
    color: "#64748b",
    fontSize: 12,
    marginTop: 5,
  },
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  requestedBadge: {
    backgroundColor: "#fef3c7",
  },
  operationalBadge: {
    backgroundColor: "#dcfce7",
  },
  statusText: {
    color: "#334155",
    fontSize: 10,
    fontWeight: "800",
  },
  bodyText: {
    color: "#334155",
    fontSize: 15,
    lineHeight: 22,
    marginTop: 14,
  },
  rideDetails: {
    borderTopColor: "#e2e8f0",
    borderTopWidth: 1,
    marginTop: 16,
    paddingTop: 14,
    gap: 12,
  },
  detailGroup: {
    gap: 3,
  },
  detailLabel: {
    color: "#64748b",
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  detailValue: {
    color: "#0f172a",
    fontSize: 15,
    fontWeight: "700",
  },
  detailAddress: {
    color: "#475569",
    fontSize: 13,
    lineHeight: 19,
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 18,
  },
  primaryButton: {
    borderRadius: 10,
    backgroundColor: "#2563eb",
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "800",
  },
  secondaryButton: {
    borderColor: "#94a3b8",
    borderWidth: 1,
    borderRadius: 10,
    backgroundColor: "#ffffff",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  secondaryButtonText: {
    color: "#334155",
    fontSize: 13,
    fontWeight: "700",
  },
  disabledButton: {
    opacity: 0.5,
  },
  pressedButton: {
    opacity: 0.75,
  },
  footerNotice: {
    color: "#64748b",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 12,
    textAlign: "center",
  },
});
