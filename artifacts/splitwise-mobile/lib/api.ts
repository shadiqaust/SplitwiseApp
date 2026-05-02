import { setBaseUrl, setAuthTokenGetter, setUnauthorizedHandler } from "@workspace/api-client-react";
import { getToken } from "./auth";

const domain = process.env.EXPO_PUBLIC_DOMAIN;
const BASE_URL = domain ? `https://${domain}` : "";

setBaseUrl(BASE_URL);

let _unauthorizedHandler: (() => void) | null = null;

export function configureApi(getTokenFn: () => Promise<string | null>): void {
  setAuthTokenGetter(getTokenFn);
}

/**
 * Register a callback that fires whenever any API call (orval-generated
 * or raw `authFetch`) returns 401 Unauthorized.
 */
export function configureUnauthorizedHandler(handler: (() => void) | null): void {
  _unauthorizedHandler = handler;
  setUnauthorizedHandler(handler);
}

/**
 * Auth-aware fetch wrapper for raw API calls (search, custom endpoints).
 * Automatically attaches the bearer token and triggers the configured
 * unauthorized handler on 401, matching the behavior of the orval client.
 */
export async function authFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const token = await getToken();
  const headers: Record<string, string> = {
    ...((options.headers as Record<string, string> | undefined) ?? {}),
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });
  if (res.status === 401 && _unauthorizedHandler) {
    _unauthorizedHandler();
  }
  return res;
}
