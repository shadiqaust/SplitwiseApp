import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { setAuthTokenGetter, setBaseUrl, setUnauthorizedHandler } from "@workspace/api-client-react";
import { queryClient } from "./queryClient";

const TOKEN_KEY = "sw_auth_token";
const USER_KEY = "sw_auth_user";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  country?: string | null;
  location?: string | null;
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
  signOut: () => void;
  /**
   * Merge a partial update into the cached auth user (in-memory + localStorage).
   * Call this whenever the user's profile is updated server-side so UI bound to
   * `useAuth().user` (sidebar avatar, header name, etc.) reflects the change
   * immediately without waiting for a full re-fetch.
   */
  updateUser: (patch: Partial<AuthUser>) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function getApiBase(): string {
  return "";
}

async function apiPost<T>(path: string, body: unknown, token?: string | null): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${getApiBase()}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `Request failed: ${res.status}`);
  return data as T;
}

interface AuthResponse {
  token: string;
  user: AuthUser;
}

function clearStoredAuth() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  setAuthTokenGetter(null);
}

function redirectToSignIn() {
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
  const target = `${basePath}/sign-in`;
  if (typeof window !== "undefined" && window.location.pathname !== target) {
    window.location.assign(target);
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    isLoaded: false,
    isSignedIn: false,
    user: null,
    token: null,
  });

  useEffect(() => {
    setBaseUrl(null);
    const token = localStorage.getItem(TOKEN_KEY);
    const userStr = localStorage.getItem(USER_KEY);
    if (token && userStr) {
      try {
        const user = JSON.parse(userStr) as AuthUser;
        setState({ isLoaded: true, isSignedIn: true, user, token });
        setAuthTokenGetter(() => token);
      } catch {
        clearStoredAuth();
        setState({ isLoaded: true, isSignedIn: false, user: null, token: null });
      }
    } else {
      setState({ isLoaded: true, isSignedIn: false, user: null, token: null });
      setAuthTokenGetter(null);
    }
  }, []);

  // Wire the global 401 handler so any expired/invalid JWT signs the user
  // out and bounces them back to the sign-in page.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      clearStoredAuth();
      queryClient.clear();
      setState({ isLoaded: true, isSignedIn: false, user: null, token: null });
      redirectToSignIn();
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { token, user } = await apiPost<AuthResponse>("/api/auth/login", { email, password });
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    setAuthTokenGetter(() => token);
    setState({ isLoaded: true, isSignedIn: true, user, token });
  }, []);

  const signUp = useCallback(async (name: string, email: string, password: string, defaultCurrency?: string) => {
    const { token, user } = await apiPost<AuthResponse>("/api/auth/register", { name, email, password, defaultCurrency });
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    setAuthTokenGetter(() => token);
    setState({ isLoaded: true, isSignedIn: true, user, token });
  }, []);

  const signOut = useCallback(() => {
    clearStoredAuth();
    queryClient.clear();
    setState({ isLoaded: true, isSignedIn: false, user: null, token: null });
  }, []);

  const updateUser = useCallback((patch: Partial<AuthUser>) => {
    setState((prev) => {
      if (!prev.user) return prev;
      const nextUser = { ...prev.user, ...patch };
      try {
        localStorage.setItem(USER_KEY, JSON.stringify(nextUser));
      } catch {
        // localStorage may throw if quota is exceeded (e.g., huge avatar
        // data URL). The in-memory state is still updated, so the UI
        // refreshes; the change just won't survive a page reload.
      }
      return { ...prev, user: nextUser };
    });
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, signIn, signUp, signOut, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
