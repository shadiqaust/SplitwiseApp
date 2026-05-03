import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { router } from "expo-router";

import { getToken } from "./auth";

// Foreground behaviour: still show banners + play sound when the app is open.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

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

async function postJson(apiBaseUrl: string, path: string, body: unknown): Promise<void> {
  const token = await getToken();
  if (!token) return;
  await fetch(`${apiBaseUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
}

// Ask the OS for permission, fetch the Expo push token, and POST it to the
// backend. Safe to call repeatedly — duplicate tokens are upserted server-side.
export async function registerForPushNotificationsAsync(apiBaseUrl: string): Promise<string | null> {
  // Push notifications don't work on the web preview — Expo push targets APNs/FCM.
  if (Platform.OS === "web") return null;
  // Simulators/emulators can't receive remote pushes.
  if (!Device.isDevice) return null;

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
    if (status !== "granted") return null;

    // EAS / Expo Go both expose a projectId via Constants; prefer it when set.
    const projectId =
      (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas
        ?.projectId ??
      (Constants.easConfig as { projectId?: string } | undefined)?.projectId;

    const tokenResp = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
    const expoToken = tokenResp.data;

    if (expoToken && expoToken !== lastRegisteredToken) {
      await postJson(apiBaseUrl, "/api/devices/register", {
        token: expoToken,
        platform: Platform.OS,
      });
      lastRegisteredToken = expoToken;
    }
    return expoToken;
  } catch (err) {
    console.warn("[push] registration failed", err);
    return null;
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
