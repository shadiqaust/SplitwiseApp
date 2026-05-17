import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { useGetMe } from "@workspace/api-client-react";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { configureApi, configureUnauthorizedHandler } from "@/lib/api";
import { AuthProvider, useAuth, getToken } from "@/lib/auth";
import { useColors } from "@/hooks/useColors";
import { setDisplayCurrency, useDisplayCurrency } from "@/lib/format";

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 4_000,
      // Poll every 5s on every query by default so updates from other devices
      // or other users become visible without manual refresh. Per-query
      // callsites can still override (e.g. `refetchInterval: false`).
      refetchInterval: 5_000,
      // Keep polling even when the app/iframe is not focused.
      refetchIntervalInBackground: true,
    },
  },
});

const domain = process.env.EXPO_PUBLIC_DOMAIN;
const API_BASE_URL = domain ? `https://${domain}` : "";

// Sync the viewer's default currency into the format module so every
// formatCurrency / getCurrencySymbol call renders amounts with the user's
// own symbol regardless of what's stored on the expense/group/payment.
function DisplayCurrencyBridge() {
  // Only call useGetMe once we have a token. Firing it before AuthProvider's
  // mount effect has restored the token causes an unauthenticated request,
  // a 401, and the global handler signing the user out on every refresh.
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded || !isSignedIn) return null;
  return <DisplayCurrencyBridgeInner />;
}

function DisplayCurrencyBridgeInner() {
  const me = useGetMe();
  const next = me.data?.defaultCurrency;
  // Push the latest defaultCurrency into the format module after commit so
  // notifying subscribers doesn't trigger an update during render.
  useEffect(() => {
    if (next) setDisplayCurrency(next);
  }, [next]);
  return null;
}

function AuthGate() {
  // Subscribe so the entire navigation tree re-renders when the viewer's
  // preferred currency changes (formatCurrency reads it from a module store).
  useDisplayCurrency();
  const { isLoaded, isSignedIn, signOut } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const colors = useColors();

  useEffect(() => {
    configureApi(() => getToken());
  }, []);

  // Auto-logout on any 401 from the API. signOut clears stored creds,
  // and the redirect effect below sends the user to /sign-in.
  useEffect(() => {
    configureUnauthorizedHandler(() => {
      void signOut();
    });
    return () => configureUnauthorizedHandler(null);
  }, [signOut]);

  useEffect(() => {
    if (!isLoaded) return;
    const first = segments[0] as string | undefined;
    const inAuth = first === "sign-in";
    if (!isSignedIn && !inAuth) {
      router.replace("/sign-in");
    } else if (isSignedIn && inAuth) {
      router.replace("/(tabs)");
    }
  }, [isLoaded, isSignedIn, segments, router]);

  // Root Stack so non-tab screens (groups/new, expenses/new, payments/new,
  // +not-found) get a header with an automatic back button. Tab screens and
  // sign-in render their own chrome and hide this header.
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTitleStyle: { fontFamily: "Inter_700Bold", color: colors.foreground },
        headerShadowVisible: false,
        headerTintColor: colors.primary,
        headerBackTitle: "Back",
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="sign-in" options={{ headerShown: false }} />
      <Stack.Screen name="admin-user/[userId]" options={{ title: "User" }} />
      <Stack.Screen name="my-referrals" options={{ title: "Your referrals" }} />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    ...Feather.font,
    ...MaterialCommunityIcons.font,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <AuthProvider apiBaseUrl={API_BASE_URL}>
          <QueryClientProvider client={queryClient}>
            <GestureHandlerRootView style={{ flex: 1 }}>
              <KeyboardProvider>
                <DisplayCurrencyBridge />
                <AuthGate />
              </KeyboardProvider>
            </GestureHandlerRootView>
          </QueryClientProvider>
        </AuthProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
