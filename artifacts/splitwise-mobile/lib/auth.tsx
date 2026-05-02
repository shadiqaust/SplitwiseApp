import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

const TOKEN_KEY = "sw_auth_token";
const USER_KEY = "sw_auth_user";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  defaultCurrency?: string;
}

interface AuthState {
  isLoaded: boolean;
  isSignedIn: boolean;
  user: AuthUser | null;
  token: string | null;
}

interface AuthContextValue extends AuthState {
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (name: string, email: string, password: string, defaultCurrency?: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function storeItem(key: string, value: string): Promise<void> {
  if (Platform.OS === "web") {
    if (typeof window !== "undefined") window.localStorage.setItem(key, value);
  } else {
    await SecureStore.setItemAsync(key, value);
  }
}

async function getItem(key: string): Promise<string | null> {
  if (Platform.OS === "web") {
    return typeof window !== "undefined" ? window.localStorage.getItem(key) : null;
  }
  return SecureStore.getItemAsync(key);
}

async function removeItem(key: string): Promise<void> {
  if (Platform.OS === "web") {
    if (typeof window !== "undefined") window.localStorage.removeItem(key);
  } else {
    await SecureStore.deleteItemAsync(key);
  }
}

interface AuthResponse {
  token: string;
  user: AuthUser;
}

export function AuthProvider({ children, apiBaseUrl }: { children: React.ReactNode; apiBaseUrl: string }) {
  const [state, setState] = useState<AuthState>({
    isLoaded: false,
    isSignedIn: false,
    user: null,
    token: null,
  });

  useEffect(() => {
    (async () => {
      const token = await getItem(TOKEN_KEY);
      const userStr = await getItem(USER_KEY);
      if (token && userStr) {
        try {
          const user = JSON.parse(userStr) as AuthUser;
          setState({ isLoaded: true, isSignedIn: true, user, token });
        } catch {
          await removeItem(TOKEN_KEY);
          await removeItem(USER_KEY);
          setState({ isLoaded: true, isSignedIn: false, user: null, token: null });
        }
      } else {
        setState({ isLoaded: true, isSignedIn: false, user: null, token: null });
      }
    })();
  }, []);

  const callApi = useCallback(async (path: string, body: unknown, token?: string | null): Promise<AuthResponse> => {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const res = await fetch(`${apiBaseUrl}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? `Request failed: ${res.status}`);
    return data as AuthResponse;
  }, [apiBaseUrl]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { token, user } = await callApi("/api/auth/login", { email, password });
    await storeItem(TOKEN_KEY, token);
    await storeItem(USER_KEY, JSON.stringify(user));
    setState({ isLoaded: true, isSignedIn: true, user, token });
  }, [callApi]);

  const signUp = useCallback(async (name: string, email: string, password: string, defaultCurrency?: string) => {
    const { token, user } = await callApi("/api/auth/register", { name, email, password, defaultCurrency });
    await storeItem(TOKEN_KEY, token);
    await storeItem(USER_KEY, JSON.stringify(user));
    setState({ isLoaded: true, isSignedIn: true, user, token });
  }, [callApi]);

  const signOut = useCallback(async () => {
    await removeItem(TOKEN_KEY);
    await removeItem(USER_KEY);
    setState({ isLoaded: true, isSignedIn: false, user: null, token: null });
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

export function getToken(): Promise<string | null> {
  return getItem(TOKEN_KEY);
}
