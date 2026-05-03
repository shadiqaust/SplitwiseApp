import { eq } from "drizzle-orm";
import { db, notificationsTable, usersTable, groupsTable, type InsertNotification, type Notification } from "@workspace/db";
import { sendPushToUsers } from "./push";

export async function getActorName(userId: string): Promise<string> {
  const [u] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, userId));
  return u?.name ?? "Someone";
}

export async function getGroupName(groupId: string): Promise<string> {
  const [g] = await db.select({ name: groupsTable.name }).from(groupsTable).where(eq(groupsTable.id, groupId));
  return g?.name ?? "the group";
}

export async function createNotifications(
  rows: Array<Omit<InsertNotification, "id" | "createdAt" | "readAt">>,
  options: { inApp?: boolean; push?: boolean } = {},
): Promise<void> {
  if (rows.length === 0) return;
  const inApp = options.inApp !== false; // default true
  const push = options.push !== false; // default true

  if (inApp) {
    try {
      await db.insert(notificationsTable).values(rows);
    } catch (err) {
      console.error("[notifications] failed to insert", err);
    }
  }

  if (!push) return;

  // Best-effort OS-level push to every recipient's registered devices.
  // Group rows by userId so each device gets one push per logical event.
  const byUser = new Map<
    string,
    { title: string; body: string; data: Record<string, unknown> }
  >();
  for (const r of rows) {
    if (!byUser.has(r.userId)) {
      byUser.set(r.userId, {
        title: r.title,
        body: r.body,
        data: { ...(r.data as Record<string, unknown> | null ?? {}), type: r.type },
      });
    }
  }
  await Promise.all(
    Array.from(byUser.entries()).map(([userId, payload]) =>
      sendPushToUsers([userId], payload),
    ),
  );
}

export function serializeNotification(n: Notification) {
  return {
    ...n,
    createdAt: n.createdAt.toISOString(),
    readAt: n.readAt ? n.readAt.toISOString() : null,
  };
}
