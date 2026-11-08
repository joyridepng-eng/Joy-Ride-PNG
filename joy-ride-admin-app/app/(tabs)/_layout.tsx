import { Tabs } from "expo-router";
import Feather from "@expo/vector-icons/Feather";
import React, { useCallback, useEffect, useState } from "react";
import { AppState, StyleSheet, View } from "react-native";

import { HapticTab } from "@/components/haptic-tab";
import {
  loadAdminNotificationInbox,
  subscribeToAdminInboxChanges,
} from "@/services/admin-notifications";

function TabBarIcon({
  name,
  color,
  focused,
}: {
  name: keyof typeof Feather.glyphMap;
  color: string;
  focused: boolean;
}) {
  return (
    <View style={styles.tabIconContainer}>
      <View
        style={[
          styles.activeIndicator,
          focused && styles.activeIndicatorSelected,
        ]}
      />
      <Feather name={name} size={19} color={color} />
    </View>
  );
}

export default function TabLayout() {
  const [unreadCount, setUnreadCount] = useState(0);

  const refreshUnreadCount = useCallback(async () => {
    try {
      const inbox = await loadAdminNotificationInbox({
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

    const unsubscribe = subscribeToAdminInboxChanges(refreshUnreadCount);

    return () => {
      clearInterval(pollingTimer);
      appStateSubscription.remove();
      unsubscribe();
    };
  }, [refreshUnreadCount]);

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: "#2563eb",
        tabBarInactiveTintColor: "#64748b",
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarHideOnKeyboard: true,
        tabBarStyle: styles.tabBar,
        tabBarItemStyle: styles.tabBarItem,
        tabBarIconStyle: styles.tabBarIcon,
        tabBarLabelStyle: styles.tabBarLabel,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon name="home" color={color} focused={focused} />
          ),
        }}
      />

      <Tabs.Screen
        name="live-fleet"
        options={{
          title: "Live Fleet",
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon name="map-pin" color={color} focused={focused} />
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
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon name="inbox" color={color} focused={focused} />
          ),
        }}
      />

      <Tabs.Screen
        name="explore"
        options={{
          title: "Explore",
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon name="compass" color={color} focused={focused} />
          ),
        }}
      />

      <Tabs.Screen name="emergencies" options={{ href: null }} />
      <Tabs.Screen name="feedback" options={{ href: null }} />

      <Tabs.Screen
        name="fleet-registry"
        options={{
          href: null,
        }}
      />

      <Tabs.Screen
        name="requested-rides"
        options={{
          href: null,
        }}
      />

      <Tabs.Screen
        name="assign-driver"
        options={{
          href: null,
        }}
      />

      <Tabs.Screen
        name="ride-operations"
        options={{
          href: null,
        }}
      />

      <Tabs.Screen
        name="settlements"
        options={{
          href: null,
        }}
      />

      <Tabs.Screen
        name="trip-audit"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    height: 72,
    paddingTop: 7,
    paddingBottom: 8,
    backgroundColor: "#ffffff",
    borderTopColor: "#e2e8f0",
    borderTopWidth: 1,
    elevation: 0,
  },
  tabBarItem: {
    flex: 1,
    paddingVertical: 2,
  },
  tabBarIcon: {
    marginBottom: 0,
  },
  tabBarLabel: {
    marginTop: 3,
    fontSize: 11,
    fontWeight: "600",
  },
  tabIconContainer: {
    position: "relative",
    width: 52,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 3,
  },
  activeIndicator: {
    position: "absolute",
    top: 0,
    width: 20,
    height: 3,
    borderRadius: 2,
    backgroundColor: "transparent",
  },
  activeIndicatorSelected: {
    backgroundColor: "#2563eb",
  },
});
