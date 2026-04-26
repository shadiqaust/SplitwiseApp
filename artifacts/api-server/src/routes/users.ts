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

  // Resolve friend IDs (bidirectional)
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

  // Build exclusion subquery for group members
  const groupExcludeSub = excludeGroupId
    ? db.select({ userId: groupMembersTable.userId }).from(groupMembersTable).where(eq(groupMembersTable.groupId, excludeGroupId))
    : null;

  // --- Friends section ---
  const friendConditions: ReturnType<typeof and>[] = [];
  if (friendIds.length > 0) {
    friendConditions.push(inArray(usersTable.id, friendIds) as any);
  } else {
    // No friends at all — still continue to non-friend email search below
  }

  if (q) {
    const pattern = `%${q.replace(/[%_]/g, "\\$&")}%`;
    friendConditions.push(
      or(ilike(usersTable.name, pattern), ilike(usersTable.email, pattern))! as any,
    );
  }
  if (groupExcludeSub) {
    friendConditions.push(notInArray(usersTable.id, groupExcludeSub) as any);
  }

  const friends =
    friendIds.length > 0
      ? await db
          .select({ id: usersTable.id, name: usersTable.name, email: usersTable.email, avatarUrl: usersTable.avatarUrl })
          .from(usersTable)
          .where(and(...(friendConditions as any[])))
          .orderBy(sql`lower(${usersTable.name})`)
          .limit(30)
      : [];

  // --- Non-friend email search (only when query provided) ---
  let nonFriends: { id: number; name: string; email: string; avatarUrl: string | null }[] = [];
  if (q && q.includes("@")) {
    const pattern = `%${q.replace(/[%_]/g, "\\$&")}%`;
    const nfConditions: any[] = [
      ne(usersTable.id, currentUserId),
      ilike(usersTable.email, pattern),
    ];
    if (friendIds.length > 0) {
      nfConditions.push(notInArray(usersTable.id, friendIds));
    }
    if (groupExcludeSub) {
      nfConditions.push(notInArray(usersTable.id, groupExcludeSub));
    }
    nonFriends = await db
      .select({ id: usersTable.id, name: usersTable.name, email: usersTable.email, avatarUrl: usersTable.avatarUrl })
      .from(usersTable)
      .where(and(...nfConditions))
      .orderBy(sql`lower(${usersTable.name})`)
      .limit(10);
  }

  const result = [
    ...friends.map((u) => ({ ...u, isFriend: true })),
    ...nonFriends.map((u) => ({ ...u, isFriend: false })),
  ];

  res.json(result);
});

export default router;
