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
} from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

// GET /friends
// Returns all people who share at least one group with the current user,
// plus the net balance across all shared groups.
// positive netBalance → friend owes me; negative → I owe friend
router.get("/friends", requireAuth, async (req, res): Promise<void> => {
  const me = req.dbUserId!;

  // 1. All groups I'm in
  const myMemberships = await db
    .select({ groupId: groupMembersTable.groupId })
    .from(groupMembersTable)
    .where(eq(groupMembersTable.userId, me));

  if (myMemberships.length === 0) {
    res.json([]);
    return;
  }

  const myGroupIds = myMemberships.map((m) => m.groupId);

  // 2. All other members in those groups → collect friend → sharedGroupIds map
  const otherMembers = await db
    .select({ userId: groupMembersTable.userId, groupId: groupMembersTable.groupId })
    .from(groupMembersTable)
    .where(
      and(
        inArray(groupMembersTable.groupId, myGroupIds),
        ne(groupMembersTable.userId, me),
      ),
    );

  if (otherMembers.length === 0) {
    res.json([]);
    return;
  }

  // Build friendId → Set<groupId>
  const friendGroupsMap = new Map<number, Set<number>>();
  for (const m of otherMembers) {
    if (!friendGroupsMap.has(m.userId)) friendGroupsMap.set(m.userId, new Set());
    friendGroupsMap.get(m.userId)!.add(m.groupId);
  }

  const friendIds = [...friendGroupsMap.keys()];

  // 3. Bulk fetch friend user rows
  const friendUsers = await db
    .select({ id: usersTable.id, name: usersTable.name, email: usersTable.email, avatarUrl: usersTable.avatarUrl })
    .from(usersTable)
    .where(inArray(usersTable.id, friendIds));
  const userMap = new Map(friendUsers.map((u) => [u.id, u]));

  // 4. Bulk fetch expenses and splits for all my groups
  const expenses = await db
    .select()
    .from(expensesTable)
    .where(inArray(expensesTable.groupId, myGroupIds));

  const expenseIds = expenses.map((e) => e.id);
  const splits =
    expenseIds.length > 0
      ? await db.select().from(expenseSplitsTable).where(inArray(expenseSplitsTable.expenseId, expenseIds))
      : [];

  // Group splits by expenseId for fast lookup
  const splitsMap = new Map<number, typeof splits>();
  for (const s of splits) {
    if (!splitsMap.has(s.expenseId)) splitsMap.set(s.expenseId, []);
    splitsMap.get(s.expenseId)!.push(s);
  }

  // 5. Bulk fetch all payments in my groups
  const payments = await db
    .select()
    .from(paymentsTable)
    .where(inArray(paymentsTable.groupId, myGroupIds));

  // 6. Compute per-friend net balance
  const netBalances = new Map<number, number>();
  for (const friendId of friendIds) {
    netBalances.set(friendId, 0);
  }

  const sharedGroupIds = myGroupIds; // expenses are already scoped to my groups

  for (const expense of expenses) {
    const expSplits = splitsMap.get(expense.id) ?? [];

    if (expense.paidByUserId === me) {
      // I paid — any friend with a split in this expense owes me their share
      for (const s of expSplits) {
        if (friendGroupsMap.get(s.userId)?.has(expense.groupId)) {
          netBalances.set(s.userId, (netBalances.get(s.userId) ?? 0) + parseFloat(s.amount));
        }
      }
    } else if (friendGroupsMap.has(expense.paidByUserId)) {
      // A friend paid — I owe them my split
      if (friendGroupsMap.get(expense.paidByUserId)?.has(expense.groupId)) {
        const mySplit = expSplits.find((s) => s.userId === me);
        if (mySplit) {
          const friendId = expense.paidByUserId;
          netBalances.set(friendId, (netBalances.get(friendId) ?? 0) - parseFloat(mySplit.amount));
        }
      }
    }
  }

  for (const payment of payments) {
    if (payment.fromUserId === me && friendGroupsMap.has(payment.toUserId)) {
      // I sent a payment to a friend — reduces what I owe them (net goes up)
      const friendId = payment.toUserId;
      netBalances.set(friendId, (netBalances.get(friendId) ?? 0) + parseFloat(payment.amount));
    } else if (payment.toUserId === me && friendGroupsMap.has(payment.fromUserId)) {
      // A friend sent me a payment — reduces what they owe me (net goes down)
      const friendId = payment.fromUserId;
      netBalances.set(friendId, (netBalances.get(friendId) ?? 0) - parseFloat(payment.amount));
    }
  }

  // 7. Build result, also include shared group names
  const groups = await db
    .select({ id: groupsTable.id, name: groupsTable.name })
    .from(groupsTable)
    .where(inArray(groupsTable.id, myGroupIds));
  const groupMap = new Map(groups.map((g) => [g.id, g]));

  const result = friendIds
    .map((friendId) => {
      const user = userMap.get(friendId);
      if (!user) return null;
      const sharedGroups = [...(friendGroupsMap.get(friendId) ?? [])]
        .map((gid) => groupMap.get(gid))
        .filter(Boolean) as { id: number; name: string }[];
      return {
        id: user.id,
        name: user.name,
        email: user.email,
        avatarUrl: user.avatarUrl,
        netBalance: Math.round((netBalances.get(friendId) ?? 0) * 100) / 100,
        sharedGroups,
      };
    })
    .filter(Boolean);

  // Sort: those who owe me first (positive), then even, then I owe them
  result.sort((a, b) => (b!.netBalance) - (a!.netBalance));

  res.json(result);
});

export default router;
