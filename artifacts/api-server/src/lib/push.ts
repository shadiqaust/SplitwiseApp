import { inArray } from "drizzle-orm";
import { db, deviceTokensTable } from "@workspace/db";

// Expo's public push API. No SDK or API key required for low/medium volume —
// we just POST batches of messages and Expo fans them out to APNs/FCM.
const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

export interface PushPayload {
  title: string;
  body: string;
  // Free-form data forwarded to the device handler so we can deep-link.
  data?: Record<string, unknown>;
}

interface ExpoMessage extends PushPayload {
  to: string;
  sound: "default";
  priority: "high";
  channelId: "default";
}

// Fire-and-forget push to every registered device for the given users.
// Failures are logged but never thrown — push is best-effort, the in-app
// notification row is the source of truth.
export async function sendPushToUsers(
  userIds: string[],
  payload: PushPayload,
): Promise<void> {
  if (userIds.length === 0) return;

  let tokens: { token: string }[];
  try {
    tokens = await db
      .select({ token: deviceTokensTable.token })
      .from(deviceTokensTable)
      .where(inArray(deviceTokensTable.userId, userIds));
  } catch (err) {
    console.error("[push] failed to load device tokens", err);
    return;
  }
  if (tokens.length === 0) return;

  // Filter to valid Expo push tokens only — anything else (stale, malformed)
  // would have Expo reject the whole batch.
  const messages: ExpoMessage[] = tokens
    .filter((t) => /^ExponentPushToken\[[^\]]+\]$/.test(t.token))
    .map((t) => ({
      to: t.token,
      sound: "default",
      priority: "high",
      channelId: "default",
      title: payload.title,
      body: payload.body,
      data: payload.data ?? {},
    }));
  if (messages.length === 0) return;

  // Expo recommends batches of ≤100; we'll respect that even though we'll
  // rarely hit it.
  const batches: ExpoMessage[][] = [];
  for (let i = 0; i < messages.length; i += 100) {
    batches.push(messages.slice(i, i + 100));
  }

  await Promise.all(
    batches.map(async (batch) => {
      try {
        const res = await fetch(EXPO_PUSH_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            "Accept-Encoding": "gzip, deflate",
          },
          body: JSON.stringify(batch),
        });
        if (!res.ok) {
          // Status only — the response body can echo tokens/payload.
          console.error(
            `[push] expo push HTTP ${res.status} for batch of ${batch.length}`,
          );
        }
      } catch (err) {
        // Surface only the error name/message — never raw payload.
        const msg = err instanceof Error ? `${err.name}: ${err.message}` : "unknown";
        console.error(`[push] expo push network error (${msg})`);
      }
    }),
  );
}
