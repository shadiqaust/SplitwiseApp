import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { setAuthTokenGetter, setBaseUrl } from "@workspace/api-client-react";

const TOKEN_KEY = "sw_auth_token";
const USER_KEY = "sw_auth_user";

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  avatarUrl: string | null;
}

interface AuthState {
  isLoaded: boolean;
  isSignedIn: boolean;
  user: AuthUser | null;
  token: string | null;
}

interface AuthContextValue extends AuthState {
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (name: string, email: string, password: string) => Promise<void>;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function getApiBase(): string {
  return window.location.origin;
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    isLoaded: false,
    isSignedIn: false,
    user: null,
    token: null,
  });

  useEffect(() => {
    setBaseUrl(window.location.origin);
    const token = localStorage.getItem(TOKEN_KEY);
    const userStr = localStorage.getItem(USER_KEY);
    if (token && userStr) {
      try {
        const user = JSON.parse(userStr) as AuthUser;
        setState({ isLoaded: true, isSignedIn: true, user, token });
        setAuthTokenGetter(() => token);
      } catch {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
        setState({ isLoaded: true, isSignedIn: false, user: null, token: null });
        setAuthTokenGetter(null);
      }
    } else {
      setState({ isLoaded: true, isSignedIn: false, user: null, token: null });
      setAuthTokenGetter(null);
    }
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { token, user } = await apiPost<AuthResponse>("/api/auth/login", { email, password });
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    setAuthTokenGetter(() => token);
    setState({ isLoaded: true, isSignedIn: true, user, token });
  }, []);

  const signUp = useCallback(async (name: string, email: string, password: string) => {
    const { token, user } = await apiPost<AuthResponse>("/api/auth/register", { name, email, password });
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    setAuthTokenGetter(() => token);
    setState({ isLoaded: true, isSignedIn: true, user, token });
  }, []);

  const signOut = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setAuthTokenGetter(null);
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
