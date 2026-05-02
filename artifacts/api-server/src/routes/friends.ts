import { Router, type IRouter } from "express";
import { eq, and, inArray, or, ne } from "drizzle-orm";
import {
  db,
  groupMembersTable,
  groupsTable,
  usersTable,
  expensesTable,
  expenseSplitsTable,
  paymentsTable,
  friendshipsTable,
} from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Compute friend list for the current user.
// Friends = people in shared groups OR directly added via friendships table.
// netBalance: positive → friend owes me, negative → I owe friend.
async function buildFriendList(me: string) {
  // ── 1. Group-based connections ─────────────────────────────────────────────
  const myMemberships = await db
    .select({ groupId: groupMembersTable.groupId })
    .from(groupMembersTable)
    .where(eq(groupMembersTable.userId, me));

  const myGroupIds = myMemberships.map((m) => m.groupId);

  const groupFriendIds = new Set<string>();
  const friendGroupsMap = new Map<string, Set<string>>(); // friendId → groupIds

  if (myGroupIds.length > 0) {
    const otherMembers = await db
      .select({ userId: groupMembersTable.userId, groupId: groupMembersTable.groupId })
      .from(groupMembersTable)
      .where(and(inArray(groupMembersTable.groupId, myGroupIds), ne(groupMembersTable.userId, me)));

    for (const m of otherMembers) {
      groupFriendIds.add(m.userId);
      if (!friendGroupsMap.has(m.userId)) friendGroupsMap.set(m.userId, new Set());
      friendGroupsMap.get(m.userId)!.add(m.groupId);
    }
  }

  // ── 2. Direct friendships ──────────────────────────────────────────────────
  const directFriendships = await db
    .select()
    .from(friendshipsTable)
    .where(or(eq(friendshipsTable.userId, me), eq(friendshipsTable.friendId, me)));

  const directFriendIds = new Set<string>();
  for (const f of directFriendships) {
    const otherId = f.userId === me ? f.friendId : f.userId;
    directFriendIds.add(otherId);
  }

  const allFriendIds = [...new Set([...groupFriendIds, ...directFriendIds])];
  if (allFriendIds.length === 0) return [];

  // ── 3. Fetch user rows ─────────────────────────────────────────────────────
  const friendUsers = await db
    .select({ id: usersTable.id, name: usersTable.name, email: usersTable.email, avatarUrl: usersTable.avatarUrl })
    .from(usersTable)
    .where(inArray(usersTable.id, allFriendIds));
  const userMap = new Map(friendUsers.map((u) => [u.id, u]));

  // ── 4. Balance computation ─────────────────────────────────────────────────
  const netBalances = new Map<string, number>(allFriendIds.map((id) => [id, 0]));

  if (myGroupIds.length > 0) {
    const expenses = await db.select().from(expensesTable).where(inArray(expensesTable.groupId, myGroupIds));
    const expenseIds = expenses.map((e) => e.id);
    const splits = expenseIds.length > 0
      ? await db.select().from(expenseSplitsTable).where(inArray(expenseSplitsTable.expenseId, expenseIds))
      : [];

    const splitsMap = new Map<string, typeof splits>();
    for (const s of splits) {
      if (!splitsMap.has(s.expenseId)) splitsMap.set(s.expenseId, []);
      splitsMap.get(s.expenseId)!.push(s);
    }

    for (const expense of expenses) {
      const expSplits = splitsMap.get(expense.id) ?? [];
      if (expense.paidByUserId === me) {
        for (const s of expSplits) {
          if (allFriendIds.includes(s.userId)) {
            netBalances.set(s.userId, (netBalances.get(s.userId) ?? 0) + parseFloat(s.amount));
          }
        }
      } else if (allFriendIds.includes(expense.paidByUserId)) {
        const mySplit = expSplits.find((s) => s.userId === me);
        if (mySplit) {
          const fid = expense.paidByUserId;
          netBalances.set(fid, (netBalances.get(fid) ?? 0) - parseFloat(mySplit.amount));
        }
      }
    }

    const payments = await db.select().from(paymentsTable).where(inArray(paymentsTable.groupId, myGroupIds));
    for (const p of payments) {
      if (p.fromUserId === me && allFriendIds.includes(p.toUserId)) {
        netBalances.set(p.toUserId, (netBalances.get(p.toUserId) ?? 0) + parseFloat(p.amount));
      } else if (p.toUserId === me && allFriendIds.includes(p.fromUserId)) {
        netBalances.set(p.fromUserId, (netBalances.get(p.fromUserId) ?? 0) - parseFloat(p.amount));
      }
    }
  }

  // ── 5. Groups info ─────────────────────────────────────────────────────────
  const groups = myGroupIds.length > 0
    ? await db.select({ id: groupsTable.id, name: groupsTable.name }).from(groupsTable).where(inArray(groupsTable.id, myGroupIds))
    : [];
  const groupMap = new Map(groups.map((g) => [g.id, g]));

  // ── 6. Assemble result ─────────────────────────────────────────────────────
  const result = allFriendIds
    .map((friendId) => {
      const user = userMap.get(friendId);
      if (!user) return null;
      const sharedGroups = [...(friendGroupsMap.get(friendId) ?? [])]
        .map((gid) => groupMap.get(gid))
        .filter(Boolean) as { id: string; name: string }[];
      const isDirect = directFriendIds.has(friendId);
      return {
        id: user.id,
        name: user.name,
        email: user.email,
        avatarUrl: user.avatarUrl,
        netBalance: Math.round((netBalances.get(friendId) ?? 0) * 100) / 100,
        sharedGroups,
        isDirect,
      };
    })
    .filter(Boolean);

  result.sort((a, b) => b!.netBalance - a!.netBalance);
  return result;
}

// GET /friends
router.get("/friends", requireAuth, async (req, res): Promise<void> => {
  const me = req.dbUserId!;
  const friends = await buildFriendList(me);
  res.json(friends);
});

// POST /friends  { friendId }
router.post("/friends", requireAuth, async (req, res): Promise<void> => {
  const me = req.dbUserId!;
  const { friendId } = req.body as { friendId?: string };

  if (!friendId || typeof friendId !== "string" || !UUID_RE.test(friendId)) {
    res.status(400).json({ error: "friendId is required" });
    return;
  }
  if (friendId === me) {
    res.status(400).json({ error: "You cannot add yourself as a friend" });
    return;
  }

  // Verify the user exists
  const [target] = await db.select().from(usersTable).where(eq(usersTable.id, friendId));
  if (!target) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  // Check if already friends (either direction)
  const [existing] = await db
    .select()
    .from(friendshipsTable)
    .where(
      or(
        and(eq(friendshipsTable.userId, me), eq(friendshipsTable.friendId, friendId)),
        and(eq(friendshipsTable.userId, friendId), eq(friendshipsTable.friendId, me)),
      ),
    );

  if (existing) {
    res.status(409).json({ error: "Already friends" });
    return;
  }

  await db.insert(friendshipsTable).values({ userId: me, friendId });
  res.status(201).json({ ok: true });
});

// DELETE /friends/:friendId
router.delete("/friends/:friendId", requireAuth, async (req, res): Promise<void> => {
  const me = req.dbUserId!;
  const friendId = req.params.friendId;
  if (!UUID_RE.test(friendId)) {
    res.status(400).json({ error: "Invalid friendId" });
    return;
  }

  await db
    .delete(friendshipsTable)
    .where(
      or(
        and(eq(friendshipsTable.userId, me), eq(friendshipsTable.friendId, friendId)),
        and(eq(friendshipsTable.userId, friendId), eq(friendshipsTable.friendId, me)),
      ),
    );

  res.json({ ok: true });
});

export default router;
