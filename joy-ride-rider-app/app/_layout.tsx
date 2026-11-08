import type { Href } from "expo-router";
import { RiderAuthProvider, useRiderAuth } from "@/contexts/rider-auth-context";
import { useColorScheme } from "@/hooks/use-color-scheme";
import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "@react-navigation/native";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import "react-native-reanimated";

export const unstable_settings = {
  anchor: "(tabs)",
};

function RiderRootNavigator() {
  const colorScheme = useColorScheme();
  const { session, isLoading } = useRiderAuth();
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    if (isLoading) {
      return;
    }

    const firstSegment = String(segments[0] ?? "");

    const isAuthenticationRoute =
      firstSegment === "login" || firstSegment === "register";

    if (!session && !isAuthenticationRoute) {
      router.replace("/login" as Href);
      return;
    }

    if (session && isAuthenticationRoute) {
      router.replace("/");
    }
  }, [isLoading, router, segments, session]);

  return (
    <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen
          name="(tabs)"
          options={{
            headerShown: false,
          }}
        />

        <Stack.Screen
          name="login"
          options={{
            title: "Rider Sign In",
            headerShown: false,
          }}
        />

        <Stack.Screen
          name="register"
          options={{
            title: "Create Rider Account",
            headerShown: false,
          }}
        />

        <Stack.Screen
          name="modal"
          options={{
            presentation: "modal",
            title: "Modal",
          }}
        />
      </Stack>

      <StatusBar style="auto" />
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <RiderAuthProvider>
      <RiderRootNavigator />
    </RiderAuthProvider>
  );
}
