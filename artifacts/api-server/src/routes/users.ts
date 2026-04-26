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
  if (parsed.data.country !== undefined) updateData.country = parsed.data.country ?? null;
  if (parsed.data.location !== undefined) updateData.location = parsed.data.location ?? null;

  const [user] = await db.update(usersTable)
    .set(updateData)
    .where(eq(usersTable.id, req.dbUserId!))
    .returning();

  res.json(UpdateMeResponse.parse(user));
});

/** Resolve "known" user IDs for the current user.
 *  Mirrors the same definition used in /api/friends:
 *  anyone in a shared group OR in the friendshipsTable. */
async function resolveFriendIds(currentUserId: number): Promise<{ allIds: number[]; directIds: Set<number> }> {
  // 1. Groups the current user belongs to
  const myMemberships = await db
    .select({ groupId: groupMembersTable.groupId })
    .from(groupMembersTable)
    .where(eq(groupMembersTable.userId, currentUserId));
  const myGroupIds = myMemberships.map((m) => m.groupId);

  // 2. Co-members from shared groups
  const groupFriendSet = new Set<number>();
  if (myGroupIds.length > 0) {
    const others = await db
      .select({ userId: groupMembersTable.userId })
      .from(groupMembersTable)
      .where(
        and(
          inArray(groupMembersTable.groupId, myGroupIds),
          ne(groupMembersTable.userId, currentUserId),
        ),
      );
    for (const r of others) groupFriendSet.add(r.userId);
  }

  // 3. Direct friendships
  const friendRows = await db
    .select({ friendId: friendshipsTable.friendId, userId: friendshipsTable.userId })
    .from(friendshipsTable)
    .where(
      or(
        eq(friendshipsTable.userId, currentUserId),
        eq(friendshipsTable.friendId, currentUserId),
      )!,
    );
  const directIds = new Set<number>();
  for (const r of friendRows) {
    directIds.add(r.userId === currentUserId ? r.friendId : r.userId);
  }

  const allIds = [...new Set([...groupFriendSet, ...directIds])];
  return { allIds, directIds };
}

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

  const { allIds: friendIds, directIds } = await resolveFriendIds(currentUserId);

  // Subquery to exclude current group members
  const groupExcludeSub = excludeGroupId
    ? db
        .select({ userId: groupMembersTable.userId })
        .from(groupMembersTable)
        .where(eq(groupMembersTable.groupId, excludeGroupId))
    : null;

  // ── Friends section ────────────────────────────────────────────────────────
  const friends: { id: number; name: string; email: string; avatarUrl: string | null }[] = [];

  if (friendIds.length > 0) {
    const conditions: any[] = [inArray(usersTable.id, friendIds)];
    if (q) {
      const pattern = `%${q.replace(/[%_]/g, "\\$&")}%`;
      conditions.push(or(ilike(usersTable.name, pattern), ilike(usersTable.email, pattern))!);
    }
    if (groupExcludeSub) {
      conditions.push(notInArray(usersTable.id, groupExcludeSub));
    }
    const rows = await db
      .select({ id: usersTable.id, name: usersTable.name, email: usersTable.email, avatarUrl: usersTable.avatarUrl })
      .from(usersTable)
      .where(and(...conditions))
      .orderBy(sql`lower(${usersTable.name})`)
      .limit(30);
    friends.push(...rows);
  }

  // ── Non-friend email search (only when query looks like an email) ──────────
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
