import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import { db, deviceTokensTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

const VALID_PLATFORMS = new Set(["ios", "android", "web"]);

// Register (or upsert) an Expo push token for the current user. The same
// physical device may belong to a different user later (account switch), so
// we always re-bind the token to the most recent owner.
router.post("/devices/register", requireAuth, async (req, res): Promise<void> => {
  const me = req.dbUserId!;
  const token = typeof req.body?.token === "string" ? req.body.token.trim() : "";
  const platform =
    typeof req.body?.platform === "string" ? req.body.platform : "";

  if (!/^ExponentPushToken\[[^\]]+\]$/.test(token)) {
    res.status(400).json({ error: "Invalid Expo push token" });
    return;
  }
  if (!VALID_PLATFORMS.has(platform)) {
    res.status(400).json({ error: "platform must be ios, android, or web" });
    return;
  }

  const now = new Date();

  // Upsert on the unique `token`. Existing rows have userId/platform/lastSeen
  // refreshed; new rows are inserted.
  await db
    .insert(deviceTokensTable)
    .values({ userId: me, token, platform, lastSeenAt: now })
    .onConflictDoUpdate({
      target: deviceTokensTable.token,
      set: { userId: me, platform, lastSeenAt: now },
    });

  res.sendStatus(204);
});

router.post("/devices/unregister", requireAuth, async (req, res): Promise<void> => {
  const me = req.dbUserId!;
  const token = typeof req.body?.token === "string" ? req.body.token.trim() : "";
  if (!token) {
    res.status(400).json({ error: "token is required" });
    return;
  }
  await db
    .delete(deviceTokensTable)
    .where(
      and(
        eq(deviceTokensTable.token, token),
        eq(deviceTokensTable.userId, me),
      ),
    );
  res.sendStatus(204);
});

export default router;
