import { useAdminAuth } from "@/contexts/admin-auth-context";
import Feather from "@expo/vector-icons/Feather";
import * as Updates from "expo-updates";
import { router, type Href } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

const actionGroups: {
  title: string;
  tone: "default" | "operations" | "admin";
  items: {
    title: string;
    description: string;
    href: Href;
    icon: keyof typeof Feather.glyphMap;
    priority?: boolean;
  }[];
}[] = [
  {
    title: "Immediate Actions / Alerts",
    tone: "default",
    items: [
      {
        title: "Driver Emergencies",
        description: "Review alerts and record your response.",
        href: "/emergencies",
        icon: "alert-triangle",
        priority: true,
      },
      {
        title: "Requested Rides",
        description: "View new ride requests waiting for assignment.",
        href: "/requested-rides",
        icon: "inbox",
      },
    ],
  },
  {
    title: "Operations Management",
    tone: "operations",
    items: [
      {
        title: "Assign Driver",
        description: "Assign an available driver to a ride.",
        href: "/assign-driver",
        icon: "user-plus",
      },
      {
        title: "Ride Operations",
        description: "Monitor active and completed rides.",
        href: "/ride-operations",
        icon: "activity",
      },
      {
        title: "Live Fleet",
        description: "View vehicles and driver activity on the map.",
        href: "/live-fleet",
        icon: "map-pin",
      },
    ],
  },
  {
    title: "Administration & Reporting",
    tone: "admin",
    items: [
      {
        title: "Rider Feedback",
        description: "Review private feedback from completed rides.",
        href: "/feedback",
        icon: "message-square",
      },
      {
        title: "Settlements",
        description: "Review completed ride receipts and shares.",
        href: "/settlements",
        icon: "credit-card",
      },
      {
        title: "Fleet Registry",
        description: "Register and approve drivers and vehicles.",
        href: "/fleet-registry",
        icon: "truck",
      },
      {
        title: "Trip Audit & Reports",
        description: "Review daily, weekly, and monthly driver trip records.",
        href: "/trip-audit",
        icon: "file-text",
      },
    ],
  },
];

export default function AdminHomeScreen() {
  const { session, signOut } = useAdminAuth();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const [actionGridWidth, setActionGridWidth] = useState(0);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const gap = 16;
  const columns = actionGridWidth >= 960 ? 3 : actionGridWidth >= 640 ? 2 : 1;
  const actionWidth =
    (actionGridWidth - gap * (columns - 1)) / columns;
  const userName = session?.admin.fullName ?? "Administrator";
  const avatarInitials = userName
    .split(/\s+/)
    .map((part) => part[0] ?? "")
    .slice(0, 2)
    .join("")
    .toUpperCase();

  async function handleSignOut(): Promise<void> {
    setSignOutError(null);
    setIsSigningOut(true);

    try {
      await signOut();
    } catch {
      setSignOutError("Could not clear the administrator session.");
      setIsSigningOut(false);
    }
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.container}
      >
        <View style={styles.page}>
        <View style={styles.header}>
          <View style={styles.brandBlock}>
            <Text style={styles.wordmark}>Joy Ride Admin</Text>
            <Text style={styles.productBadge}>Operations Control</Text>
          </View>
          <View style={styles.accountArea}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Account menu for ${userName}`}
              accessibilityState={{ expanded: isUserMenuOpen }}
              onPress={() => setIsUserMenuOpen((isOpen) => !isOpen)}
              style={({ hovered, pressed }) => [
                styles.accountButton,
                hovered && styles.accountButtonHovered,
                pressed && styles.accountButtonPressed,
              ]}
            >
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{avatarInitials}</Text>
              </View>
              <Feather
                name={isUserMenuOpen ? "chevron-up" : "chevron-down"}
                size={16}
                color="#64748b"
              />
            </Pressable>
            {isUserMenuOpen ? (
              <View style={styles.accountMenu}>
                <Text style={styles.menuEyebrow}>SIGNED IN AS</Text>
                <Text style={styles.menuName}>{userName}</Text>
                <Text style={styles.menuEmail}>{session?.admin.email}</Text>
                <View style={styles.menuDivider} />
                <Pressable
                  accessibilityRole="button"
                  disabled={isSigningOut}
                  onPress={() => {
                    setIsUserMenuOpen(false);
                    void handleSignOut();
                  }}
                  style={({ hovered, pressed }) => [
                    styles.menuSignOutButton,
                    hovered && styles.menuSignOutButtonHovered,
                    pressed && styles.menuSignOutButtonPressed,
                    isSigningOut && styles.signOutButtonDisabled,
                  ]}
                >
                  {isSigningOut ? (
                    <ActivityIndicator color="#334155" size="small" />
                  ) : (
                    <>
                      <Feather name="log-out" size={15} color="#334155" />
                      <Text style={styles.menuSignOutText}>Sign out</Text>
                    </>
                  )}
                </Pressable>
              </View>
            ) : null}
          </View>
        </View>

        {signOutError ? (
          <Text accessibilityRole="alert" style={styles.signOutError}>
            {signOutError}
          </Text>
        ) : null}

        <View style={styles.intro}>
          <Text accessibilityRole="header" style={styles.title}>
            Operations
          </Text>
          <Text style={styles.subtitle}>
            Manage ride activity, fleet operations, and customer outcomes.
          </Text>
        </View>

        {actionGroups.map((group) => (
          <View key={group.title} style={styles.actionSection}>
            <Text accessibilityRole="header" aria-level={2} style={styles.sectionTitle}>
              {group.title}
            </Text>
            <View
              onLayout={(event) =>
                setActionGridWidth(event.nativeEvent.layout.width)
              }
              style={[styles.actionGrid, { gap }]}
            >
              {group.items.map((item) => (
                <Pressable
                  key={item.title}
                  accessibilityRole="button"
                  accessibilityHint={item.description}
                  onPress={() => router.push(item.href)}
                  style={({ hovered, pressed }) => [
                    styles.actionCard,
                    { width: actionWidth },
                    item.priority && styles.priorityCard,
                    hovered && styles.actionCardHovered,
                    pressed && styles.actionCardPressed,
                  ]}
                >
                  <View
                    style={[
                      styles.actionIcon,
                      group.tone === "operations" &&
                        styles.operationsActionIcon,
                      group.tone === "admin" && styles.adminActionIcon,
                    ]}
                  >
                    <Feather
                      name={item.icon}
                      size={18}
                      color={group.tone === "admin" ? "#475569" : "#2563eb"}
                    />
                  </View>
                  <View style={styles.actionCardContent}>
                    <View style={styles.actionTitleRow}>
                      <Text style={styles.actionTitle}>{item.title}</Text>
                      {item.priority ? (
                        <Text style={styles.priorityBadge}>PRIORITY</Text>
                      ) : null}
                    </View>
                    <Text style={styles.actionDescription}>
                      {item.description}
                    </Text>
                  </View>
                  <Feather
                    name="chevron-right"
                    size={18}
                    color="#94a3b8"
                  />
                </Pressable>
              ))}
            </View>
          </View>
        ))}

        <View style={styles.footer}>
          <Text style={styles.footerLabel}>Explore PNG Platform</Text>
          <Text style={styles.updateStatus}>
            {Updates.updateId ? "OTA update active" : "Embedded build"}
          </Text>
        </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  scrollView: {
    flex: 1,
  },
  container: {
    flexGrow: 1,
    backgroundColor: "#f8fafc",
  },
  page: {
    width: "100%",
    maxWidth: 1280,
    alignSelf: "center",
    padding: 32,
  },
  header: {
    position: "relative",
    zIndex: 2,
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 18,
    marginBottom: 28,
  },
  brandBlock: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 10,
  },
  wordmark: {
    fontSize: 17,
    fontWeight: "700",
    color: "#0f172a",
  },
  productBadge: {
    overflow: "hidden",
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 5,
    backgroundColor: "#eff6ff",
    color: "#1d4ed8",
    fontSize: 11,
    fontWeight: "600",
  },
  title: {
    color: "#0f172a",
    fontSize: 32,
    fontWeight: "700",
  },
  subtitle: {
    maxWidth: 620,
    marginTop: 8,
    color: "#475569",
    fontSize: 15,
    lineHeight: 23,
  },
  intro: {
    paddingBottom: 24,
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
    marginBottom: 26,
  },
  accountArea: {
    position: "relative",
    zIndex: 3,
  },
  accountButton: {
    minWidth: 48,
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 7,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 8,
    backgroundColor: "#ffffff",
  },
  accountButtonHovered: {
    borderColor: "#cbd5e1",
    backgroundColor: "#f8fafc",
  },
  accountButtonPressed: {
    backgroundColor: "#f1f5f9",
  },
  avatar: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: "#dbeafe",
  },
  avatarText: {
    color: "#1d4ed8",
    fontSize: 11,
    fontWeight: "700",
  },
  accountMenu: {
    position: "absolute",
    top: 50,
    right: 0,
    zIndex: 4,
    width: 264,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 9,
    backgroundColor: "#ffffff",
    boxShadow: "0 12px 28px rgba(15, 23, 42, 0.14)",
    elevation: 5,
  },
  menuEyebrow: {
    color: "#64748b",
    fontSize: 10,
    fontWeight: "700",
  },
  menuName: {
    marginTop: 6,
    color: "#0f172a",
    fontSize: 14,
    fontWeight: "600",
  },
  menuEmail: {
    marginTop: 3,
    color: "#64748b",
    fontSize: 12,
  },
  menuDivider: {
    height: 1,
    marginVertical: 12,
    backgroundColor: "#e2e8f0",
  },
  menuSignOutButton: {
    minHeight: 36,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingHorizontal: 9,
    borderRadius: 6,
  },
  menuSignOutButtonHovered: {
    backgroundColor: "#f1f5f9",
  },
  menuSignOutButtonPressed: {
    backgroundColor: "#e2e8f0",
  },
  menuSignOutText: {
    color: "#334155",
    fontSize: 13,
    fontWeight: "600",
  },
  sectionTitle: {
    color: "#1e293b",
    fontSize: 18,
    fontWeight: "700",
  },
  actionSection: {
    marginBottom: 28,
  },
  actionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "stretch",
  },
  actionCard: {
    minHeight: 106,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 16,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 10,
    boxShadow:
      "0 4px 6px -1px rgba(15, 23, 42, 0.1), 0 2px 4px -2px rgba(15, 23, 42, 0.1)",
    elevation: 2,
  },
  actionCardHovered: {
    borderColor: "#94a3b8",
    boxShadow:
      "0 12px 24px -8px rgba(15, 23, 42, 0.16), 0 4px 8px -4px rgba(15, 23, 42, 0.12)",
    elevation: 4,
    transform: [{ translateY: -2 }],
  },
  priorityCard: {
    borderLeftWidth: 4,
    borderLeftColor: "#f43f5e",
  },
  actionCardPressed: {
    transform: [{ translateY: 0 }],
    boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
  },
  actionIcon: {
    width: 40,
    height: 40,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    backgroundColor: "#eff6ff",
  },
  operationsActionIcon: {
    backgroundColor: "#eff6ff",
  },
  adminActionIcon: {
    backgroundColor: "#f1f5f9",
  },
  actionCardContent: {
    flex: 1,
    minWidth: 0,
  },
  actionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  actionTitle: {
    color: "#0f172a",
    fontSize: 15,
    fontWeight: "700",
  },
  actionDescription: {
    marginTop: 5,
    color: "#64748b",
    fontSize: 13,
    lineHeight: 18,
  },
  priorityBadge: {
    overflow: "hidden",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: "#ffe4e6",
    color: "#9f1239",
    fontSize: 10,
    fontWeight: "700",
  },
  signOutError: {
    marginBottom: 16,
    color: "#b42318",
    fontSize: 13,
  },
  signOutButton: {
    minWidth: 88,
    minHeight: 38,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 7,
    backgroundColor: "#ffffff",
  },
  signOutButtonHovered: {
    borderColor: "#94a3b8",
    backgroundColor: "#f8fafc",
  },
  signOutButtonPressed: {
    backgroundColor: "#f1f5f9",
  },
  signOutButtonDisabled: {
    opacity: 0.65,
  },
  signOutButtonText: {
    color: "#334155",
    fontSize: 13,
    fontWeight: "600",
  },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 30,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
  },
  footerLabel: {
    color: "#94a3b8",
    fontSize: 13,
  },
  updateStatus: {
    color: "#64748b",
    fontSize: 12,
  },
});
