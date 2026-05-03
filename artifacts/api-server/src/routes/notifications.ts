import { Router, type IRouter } from "express";
import { and, desc, eq, isNull, count } from "drizzle-orm";
import { db, notificationsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { serializeNotification } from "../lib/notifications";

const router: IRouter = Router();

router.get("/notifications", requireAuth, async (req, res): Promise<void> => {
  const me = req.dbUserId!;
  const limitRaw = Number(req.query.limit);
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 200) : 50;

  const rows = await db
    .select()
    .from(notificationsTable)
    .where(eq(notificationsTable.userId, me))
    .orderBy(desc(notificationsTable.createdAt))
    .limit(limit);

  const [{ value: unreadCount } = { value: 0 }] = await db
    .select({ value: count() })
    .from(notificationsTable)
    .where(and(eq(notificationsTable.userId, me), isNull(notificationsTable.readAt)));

  res.json({
    notifications: rows.map(serializeNotification),
    unreadCount: Number(unreadCount),
  });
});

router.post("/notifications/read-all", requireAuth, async (req, res): Promise<void> => {
  const me = req.dbUserId!;
  await db
    .update(notificationsTable)
    .set({ readAt: new Date() })
    .where(and(eq(notificationsTable.userId, me), isNull(notificationsTable.readAt)));
  res.sendStatus(204);
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

router.post("/notifications/:notificationId/read", requireAuth, async (req, res): Promise<void> => {
  const me = req.dbUserId!;
  const id = String(req.params.notificationId);
  if (!UUID_RE.test(id)) {
    res.status(400).json({ error: "Invalid notification id" });
    return;
  }
  const [row] = await db
    .update(notificationsTable)
    .set({ readAt: new Date() })
    .where(and(eq(notificationsTable.id, id), eq(notificationsTable.userId, me)))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Notification not found" });
    return;
  }
  res.json(serializeNotification(row));
});

export default router;
