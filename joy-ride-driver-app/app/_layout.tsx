import { View } from 'react-native';
import TelemetrySyncNotice from '@/components/telemetry-sync-notice';
import {
  DriverAuthProvider,
  useDriverAuth,
} from "@/contexts/driver-auth-context";
import { useColorScheme } from "@/hooks/use-color-scheme";
import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "@react-navigation/native";
import type { Href } from "expo-router";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import "react-native-reanimated";
import BackgroundGPSBridge from "@/components/background-gps-bridge";

export const unstable_settings = {
  anchor: "(tabs)",
};

function DriverRootNavigator() {
  const colorScheme = useColorScheme();
  const { session, isLoading } = useDriverAuth();
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    if (isLoading) {
      return;
    }

    const firstSegment = String(segments[0] ?? "");

    const isLoginRoute = firstSegment === "login";

    if (!session && !isLoginRoute) {
      router.replace("/login" as Href);
      return;
    }

    if (session && isLoginRoute) {
      router.replace("/");
    }
  }, [isLoading, router, segments, session]);

  return (
    <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
      <View style={{ flex: 1 }}>
        {session && <TelemetrySyncNotice key={session.driver.id} />}
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
            title: "Driver Sign In",
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
      </View>

      <StatusBar style="auto" />
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <DriverAuthProvider>
      <BackgroundGPSBridge />
      <DriverRootNavigator />
    </DriverAuthProvider>
  );
}
