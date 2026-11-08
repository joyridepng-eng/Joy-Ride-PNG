import { Tabs } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { AppState, Text } from "react-native";

import { HapticTab } from "@/components/haptic-tab";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import {
  loadDriverNotificationInbox,
  subscribeToDriverInboxChanges,
} from "@/services/driver-notifications";

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const [unreadCount, setUnreadCount] = useState(0);

  const refreshUnreadCount = useCallback(async () => {
    try {
      const inbox = await loadDriverNotificationInbox({
        limit: 1,
      });

      setUnreadCount(inbox.unreadCount);
    } catch {
      return;
    }
  }, []);

  useEffect(() => {
    void refreshUnreadCount();

    const pollingTimer = setInterval(() => {
      void refreshUnreadCount();
    }, 15_000);

    const appStateSubscription = AppState.addEventListener(
      "change",
      (state) => {
        if (state === "active") {
          void refreshUnreadCount();
        }
      },
    );

    const unsubscribe = subscribeToDriverInboxChanges(refreshUnreadCount);

    return () => {
      clearInterval(pollingTimer);
      appStateSubscription.remove();
      unsubscribe();
    };
  }, [refreshUnreadCount]);

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? "light"].tint,
        headerShown: false,
        tabBarButton: HapticTab,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color }) => (
            <IconSymbol size={28} name="house.fill" color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="assigned-ride"
        options={{
          title: "My Ride",
          tabBarIcon: ({ color }) => (
            <IconSymbol size={28} name="car.fill" color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="notifications"
        options={{
          title: "Inbox",
          tabBarBadge:
            unreadCount > 0
              ? unreadCount > 99
                ? "99+"
                : unreadCount
              : undefined,
          tabBarBadgeStyle: {
            backgroundColor: "#dc2626",
            color: "#ffffff",
          },
          tabBarIcon: ({ color }) => (
            <IconSymbol size={28} name="tray.full.fill" color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="availability"
        options={{
          title: "Availability",
          tabBarIcon: ({ color }) => (
            <IconSymbol size={28} name="person.fill.checkmark" color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="daily-takings"
        options={{
          title: "Takings",
          tabBarIcon: ({ color }) => (
            <IconSymbol size={28} name="chart.bar.fill" color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="explore"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="emergency"
        options={{
          title: "Safety",
          tabBarIcon: ({ color }) => (
            <Text style={{ color, fontSize: 24, fontWeight: "800" }}>!</Text>
          ),
        }}
      />
      <Tabs.Screen name="ratings" options={{ href: null }} />
    </Tabs>
  );
}
