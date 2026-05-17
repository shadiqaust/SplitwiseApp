import { Platform } from "react-native";
import Constants, { ExecutionEnvironment } from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { router } from "expo-router";

import { getToken } from "./token";

// ─── Public status surface ────────────────────────────────────────────────
// Components can subscribe to know exactly what happened on the last
// registration attempt. This is what powers the diagnostic panel on the
// Notifications screen so users / devs can see why push isn't working.

export type PushStatusCode =
  | "idle"
  | "registering"
  | "ok"
  | "web-unsupported"
  | "simulator-unsupported"
  | "expo-go-unsupported"
  | "permission-denied"
  | "no-project-id"
  | "token-error"
  | "register-failed";

export interface PushStatus {
  code: PushStatusCode;
  detail?: string;
  token?: string | null;
  projectId?: string | null;
  platform?: string;
  updatedAt: number;
}

let currentStatus: PushStatus = { code: "idle", updatedAt: Date.now() };
const listeners = new Set<(s: PushStatus) => void>();

function setStatus(next: Omit<PushStatus, "updatedAt">) {
  currentStatus = { ...next, updatedAt: Date.now() };
  console.log(`[PUSH] status -> ${next.code}${next.detail ? ` (${next.detail})` : ""}`);
  listeners.forEach((fn) => {
    try {
      fn(currentStatus);
    } catch {
      // ignore subscriber failures
    }
  });
}

export function getPushStatus(): PushStatus {
  return currentStatus;
}

export function subscribePushStatus(fn: (s: PushStatus) => void): () => void {
  listeners.add(fn);
  fn(currentStatus); // emit current value immediately
  return () => {
    listeners.delete(fn);
  };
}

// Detect Expo Go early — used to skip APIs that crash on Android SDK 53+.
const _inExpoGo =
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient ||
  (Constants.appOwnership as string) === "expo";

// Foreground behaviour: still show banners + play sound when the app is open.
// Guard required: expo-notifications throws at module level on Android Expo Go SDK 53+.
if (!_inExpoGo) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
}

// Mirrors the targetPath() helper on the notifications screen so a tapped
// notification deep-links to the right place.
function targetPathFromData(data: Record<string, unknown> | undefined | null): string | null {
  if (!data) return null;
  const expenseId = typeof data.expenseId === "string" ? data.expenseId : null;
  const groupId = typeof data.groupId === "string" ? data.groupId : null;
  const paymentId = typeof data.paymentId === "string" ? data.paymentId : null;
  const actorUserId = typeof data.actorUserId === "string" ? data.actorUserId : null;
  if (expenseId) return `/expenses/${expenseId}`;
  if (groupId) return `/groups/${groupId}`;
  if (paymentId && actorUserId) return `/friends/${actorUserId}`;
  return "/notifications";
}

let lastRegisteredToken: string | null = null;
let responseSubscription: Notifications.EventSubscription | null = null;

async function postJson(
  apiBaseUrl: string,
  path: string,
  body: unknown,
): Promise<{ ok: boolean; status: number; text: string }> {
  const token = await getToken();
  if (!token) return { ok: false, status: 0, text: "no-auth-token" };
  const res = await fetch(`${apiBaseUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  let text = "";
  try {
    text = await res.text();
  } catch {
    /* ignore */
  }
  return { ok: res.ok, status: res.status, text };
}

function readProjectId(): string | null {
  // EAS / Expo Go both expose a projectId via Constants; prefer expoConfig.extra.eas.projectId.
  const fromExtra = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)
    ?.eas?.projectId;
  const fromEas = (Constants.easConfig as { projectId?: string } | undefined)?.projectId;
  return fromExtra ?? fromEas ?? null;
}

// Ask the OS for permission, fetch the Expo push token, and POST it to the
// backend. Safe to call repeatedly — duplicate tokens are upserted server-side.
export async function registerForPushNotificationsAsync(apiBaseUrl: string): Promise<PushStatus> {
  setStatus({ code: "registering", platform: Platform.OS });

  // Push notifications don't work on the web preview — Expo push targets APNs/FCM.
  if (Platform.OS === "web") {
    setStatus({
      code: "web-unsupported",
      detail: "Web preview can't receive native push.",
      platform: Platform.OS,
    });
    return currentStatus;
  }

  // Simulators/emulators can't receive remote pushes.
  if (!Device.isDevice) {
    setStatus({
      code: "simulator-unsupported",
      detail: "Simulators/emulators can't receive remote push. Use a physical device.",
      platform: Platform.OS,
    });
    return currentStatus;
  }

  // SDK 53+ removed remote push from Expo Go. Detect and report clearly.
  const inExpoGo =
    Constants.executionEnvironment === ExecutionEnvironment.StoreClient ||
    Constants.appOwnership === "expo";
  if (inExpoGo) {
    setStatus({
      code: "expo-go-unsupported",
      detail:
        "Remote push is not supported in Expo Go (SDK 53+). Build a development build with EAS to receive push.",
      platform: Platform.OS,
    });
    return currentStatus;
  }

  try {
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "Default",
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: "#FF231F7C",
      });
    }

    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    if (status !== "granted") {
      const req = await Notifications.requestPermissionsAsync();
      status = req.status;
    }
    if (status !== "granted") {
      setStatus({
        code: "permission-denied",
        detail: "User declined notification permission. Enable it in system Settings.",
        platform: Platform.OS,
      });
      return currentStatus;
    }

    const projectId = readProjectId();
    if (!projectId) {
      setStatus({
        code: "no-project-id",
        detail:
          "expo.extra.eas.projectId is not set in app.json. Run `eas init` or set it manually.",
        platform: Platform.OS,
      });
      return currentStatus;
    }

    let expoToken: string;
    try {
      const tokenResp = await Notifications.getExpoPushTokenAsync({ projectId });
      expoToken = tokenResp.data;
    } catch (err) {
      const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
      setStatus({
        code: "token-error",
        detail: msg,
        projectId,
        platform: Platform.OS,
      });
      return currentStatus;
    }

    if (expoToken && expoToken !== lastRegisteredToken) {
      const r = await postJson(apiBaseUrl, "/api/devices/register", {
        token: expoToken,
        platform: Platform.OS,
      });
      if (!r.ok) {
        setStatus({
          code: "register-failed",
          detail: `Backend returned ${r.status}: ${r.text.slice(0, 120)}`,
          token: expoToken,
          projectId,
          platform: Platform.OS,
        });
        return currentStatus;
      }
      lastRegisteredToken = expoToken;
    }

    setStatus({
      code: "ok",
      detail: "Token registered with backend.",
      token: expoToken,
      projectId,
      platform: Platform.OS,
    });
    return currentStatus;
  } catch (err) {
    const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    setStatus({
      code: "register-failed",
      detail: msg,
      platform: Platform.OS,
    });
    console.warn("[PUSH] registration failed", err);
    return currentStatus;
  }
}

// Tear down the token on this device for the current account (called on
// sign-out so a logged-out phone stops receiving notifications).
export async function unregisterPushNotificationsAsync(apiBaseUrl: string): Promise<void> {
  if (!lastRegisteredToken) return;
  try {
    await postJson(apiBaseUrl, "/api/devices/unregister", { token: lastRegisteredToken });
  } catch {
    // best effort
  }
  lastRegisteredToken = null;
  setStatus({ code: "idle", detail: "Signed out — token cleared.", platform: Platform.OS });
}

function navigateFromData(data: Record<string, unknown> | undefined | null): void {
  const path = targetPathFromData(data);
  if (!path) return;
  // Defer until the router is mounted; on a cold launch from a notification
  // tap, this listener can fire before <Stack/> exists.
  setTimeout(() => {
    try {
      router.push(path as never);
    } catch {
      // navigation not ready yet — bail silently
    }
  }, 300);
}

// Wires the global "user tapped notification" handler. Idempotent. Also
// drains the pending response from a cold-launch tap so the deep link works
// when the app was fully terminated.
export function attachNotificationResponseListener(): void {
  if (_inExpoGo) return; // not supported in Expo Go on Android SDK 53+
  if (responseSubscription) return;
  responseSubscription = Notifications.addNotificationResponseReceivedListener((resp) => {
    const data = resp.notification.request.content.data as
      | Record<string, unknown>
      | undefined;
    navigateFromData(data);
  });

  // Cold-launch deep link: if the app was opened by tapping a push, this
  // returns the most recent response.
  Notifications.getLastNotificationResponseAsync()
    .then((resp) => {
      if (!resp) return;
      const data = resp.notification.request.content.data as
        | Record<string, unknown>
        | undefined;
      navigateFromData(data);
    })
    .catch(() => {
      // best effort
    });
}
