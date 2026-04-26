import { Router, type IRouter } from "express";
import { eq, ilike, or, notInArray, and, ne, sql, inArray } from "drizzle-orm";
import { db, usersTable, groupMembersTable, friendshipsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { UpdateMeBody, GetMeResponse, UpdateMeResponse } from "@workspace/api-zod";
import { z } from "zod";

const router: IRouter = Router();

router.get("/users/me", requireAuth, async (req, res): Promise<void> => {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.dbUserId!));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json(GetMeResponse.parse(user));
});

router.put("/users/me", requireAuth, async (req, res): Promise<void> => {
  const parsed = UpdateMeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updateData: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) updateData.name = parsed.data.name;
  if (parsed.data.avatarUrl !== undefined) updateData.avatarUrl = parsed.data.avatarUrl;

  const [user] = await db.update(usersTable)
    .set(updateData)
    .where(eq(usersTable.id, req.dbUserId!))
    .returning();

  res.json(UpdateMeResponse.parse(user));
});

const SearchQueryParams = z.object({
  q: z.string().min(1).max(100).optional(),
  excludeGroupId: z.coerce.number().int().positive().optional(),
});

router.get("/users/search", requireAuth, async (req, res): Promise<void> => {
  const parsed = SearchQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid query parameters" });
    return;
  }

  const { q, excludeGroupId } = parsed.data;
  const currentUserId = req.dbUserId!;

  // Collect IDs of all friends (friendship is bidirectional)
  const friendRows = await db
    .select({ friendId: friendshipsTable.friendId, userId: friendshipsTable.userId })
    .from(friendshipsTable)
    .where(
      or(
        eq(friendshipsTable.userId, currentUserId),
        eq(friendshipsTable.friendId, currentUserId),
      )!,
    );

  const friendIds = friendRows.map((r) =>
    r.userId === currentUserId ? r.friendId : r.userId,
  );

  if (friendIds.length === 0) {
    res.json([]);
    return;
  }

  const conditions = [inArray(usersTable.id, friendIds)];

  if (q) {
    const pattern = `%${q.replace(/[%_]/g, "\\$&")}%`;
    conditions.push(
      or(
        ilike(usersTable.name, pattern),
        ilike(usersTable.email, pattern),
      )!,
    );
  }

  if (excludeGroupId) {
    const existingMemberIds = db
      .select({ userId: groupMembersTable.userId })
      .from(groupMembersTable)
      .where(eq(groupMembersTable.groupId, excludeGroupId));
    conditions.push(notInArray(usersTable.id, existingMemberIds));
  }

  const users = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
      avatarUrl: usersTable.avatarUrl,
    })
    .from(usersTable)
    .where(and(...conditions))
    .orderBy(sql`lower(${usersTable.name})`)
    .limit(30);

  res.json(users);
});

export default router;
