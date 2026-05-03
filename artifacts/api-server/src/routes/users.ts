import { Router, type IRouter } from "express";
import { eq, ilike, or, notInArray, and, ne, sql, inArray, isNull } from "drizzle-orm";
import { db, usersTable, groupMembersTable, friendshipsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { UpdateMeBody, GetMeResponse, UpdateMeResponse } from "@workspace/api-zod";
import { z } from "zod";
import { isSupportedCurrency } from "../lib/currencies.js";

const router: IRouter = Router();

router.get("/users/me", requireAuth, async (req, res): Promise<void> => {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.dbUserId!));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  // Bypass GetMeResponse.parse so we can include `emailVerifiedAt` (which
  // isn't yet part of the OpenAPI schema). Pass everything else through the
  // existing zod shape to keep the contract stable.
  const base = GetMeResponse.parse(user);
  res.json({
    ...base,
    emailVerifiedAt: user.emailVerifiedAt
      ? user.emailVerifiedAt.toISOString()
      : null,
  });
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
  if (parsed.data.defaultCurrency !== undefined) {
    if (!(await isSupportedCurrency(parsed.data.defaultCurrency))) {
      res.status(400).json({ error: "Unsupported currency code" });
      return;
    }
    updateData.defaultCurrency = parsed.data.defaultCurrency;
  }

  const [user] = await db.update(usersTable)
    .set(updateData)
    .where(eq(usersTable.id, req.dbUserId!))
    .returning();

  const base = UpdateMeResponse.parse(user);
  res.json({
    ...base,
    emailVerifiedAt: user.emailVerifiedAt
      ? user.emailVerifiedAt.toISOString()
      : null,
  });
});

/** Resolve "known" user IDs for the current user.
 *  Mirrors the same definition used in /api/friends:
 *  anyone in a shared group OR in the friendshipsTable. */
async function resolveFriendIds(currentUserId: string): Promise<{ allIds: string[]; directIds: Set<string> }> {
  // 1. Groups the current user belongs to
  const myMemberships = await db
    .select({ groupId: groupMembersTable.groupId })
    .from(groupMembersTable)
    .where(and(eq(groupMembersTable.userId, currentUserId), isNull(groupMembersTable.deletedAt)));
  const myGroupIds = myMemberships.map((m) => m.groupId);

  // 2. Co-members from shared groups
  const groupFriendSet = new Set<string>();
  if (myGroupIds.length > 0) {
    const others = await db
      .select({ userId: groupMembersTable.userId })
      .from(groupMembersTable)
      .where(
        and(
          inArray(groupMembersTable.groupId, myGroupIds),
          ne(groupMembersTable.userId, currentUserId),
          isNull(groupMembersTable.deletedAt),
        ),
      );
    for (const r of others) groupFriendSet.add(r.userId);
  }

  // 3. Direct friendships
  const friendRows = await db
    .select({ friendId: friendshipsTable.friendId, userId: friendshipsTable.userId })
    .from(friendshipsTable)
    .where(
      and(
        isNull(friendshipsTable.deletedAt),
        or(
          eq(friendshipsTable.userId, currentUserId),
          eq(friendshipsTable.friendId, currentUserId),
        )!,
      ),
    );
  const directIds = new Set<string>();
  for (const r of friendRows) {
    directIds.add(r.userId === currentUserId ? r.friendId : r.userId);
  }

  const allIds = [...new Set([...groupFriendSet, ...directIds])];
  return { allIds, directIds };
}

const SearchQueryParams = z.object({
  q: z.string().min(1).max(100).optional(),
  excludeGroupId: z.string().uuid().optional(),
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
        .where(and(eq(groupMembersTable.groupId, excludeGroupId), isNull(groupMembersTable.deletedAt)))
    : null;

  // ── Friends section ────────────────────────────────────────────────────────
  const friends: { id: string; name: string; email: string; avatarUrl: string | null }[] = [];

  if (friendIds.length > 0) {
    const conditions: any[] = [
      inArray(usersTable.id, friendIds),
      // Hide superadmins from peer-facing search results — they should only
      // be visible inside the /admin section, never to normal users.
      ne(usersTable.role, "superadmin"),
    ];
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
  let nonFriends: { id: string; name: string; email: string; avatarUrl: string | null }[] = [];
  if (q && q.includes("@")) {
    const pattern = `%${q.replace(/[%_]/g, "\\$&")}%`;
    const nfConditions: any[] = [
      ne(usersTable.id, currentUserId),
      ilike(usersTable.email, pattern),
      // Don't reveal superadmins via non-friend email lookups either —
      // otherwise anyone who guesses the admin email can confirm the
      // account exists.
      ne(usersTable.role, "superadmin"),
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
