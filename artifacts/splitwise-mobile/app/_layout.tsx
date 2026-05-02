import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Slot, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { configureApi, configureUnauthorizedHandler } from "@/lib/api";
import { AuthProvider, useAuth, getToken } from "@/lib/auth";

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 1000 * 30,
    },
  },
});

const domain = process.env.EXPO_PUBLIC_DOMAIN;
const API_BASE_URL = domain ? `https://${domain}` : "";

function AuthGate() {
  const { isLoaded, isSignedIn, signOut } = useAuth();
  const segments = useSegments();
  const router = useRouter();

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

  return <Slot />;
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
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
                <AuthGate />
              </KeyboardProvider>
            </GestureHandlerRootView>
          </QueryClientProvider>
        </AuthProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
