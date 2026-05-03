import { eq } from "drizzle-orm";
import { db, notificationsTable, usersTable, groupsTable, type InsertNotification, type Notification } from "@workspace/db";

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
): Promise<void> {
  if (rows.length === 0) return;
  try {
    await db.insert(notificationsTable).values(rows);
  } catch (err) {
    console.error("[notifications] failed to insert", err);
  }
}

export function serializeNotification(n: Notification) {
  return {
    ...n,
    createdAt: n.createdAt.toISOString(),
    readAt: n.readAt ? n.readAt.toISOString() : null,
  };
}
