import { Router, type IRouter } from "express";
import { eq, and, inArray, or, ne, isNull } from "drizzle-orm";
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
import { requireVerifiedEmail } from "../middlewares/requireVerifiedEmail";

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
    .where(and(eq(groupMembersTable.userId, me), isNull(groupMembersTable.deletedAt)));

  const myGroupIds = myMemberships.map((m) => m.groupId);

  const groupFriendIds = new Set<string>();
  const friendGroupsMap = new Map<string, Set<string>>(); // friendId → groupIds

  if (myGroupIds.length > 0) {
    const otherMembers = await db
      .select({ userId: groupMembersTable.userId, groupId: groupMembersTable.groupId })
      .from(groupMembersTable)
      .where(and(inArray(groupMembersTable.groupId, myGroupIds), ne(groupMembersTable.userId, me), isNull(groupMembersTable.deletedAt)));

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
    .where(and(isNull(friendshipsTable.deletedAt), or(eq(friendshipsTable.userId, me), eq(friendshipsTable.friendId, me))));

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
  // balancesByCurrency: friendId → { CUR → net amount }
  const balancesByCurrency = new Map<string, Map<string, number>>(
    allFriendIds.map((id) => [id, new Map<string, number>()]),
  );
  const friendIdSet = new Set(allFriendIds);

  function bump(friendId: string, currency: string, delta: number) {
    const m = balancesByCurrency.get(friendId)!;
    m.set(currency, (m.get(currency) ?? 0) + delta);
  }

  // Helper to apply expense splits to per-currency balances.
  function applyExpenses(
    expenses: Array<typeof expensesTable.$inferSelect>,
    splitsByExpense: Map<string, Array<typeof expenseSplitsTable.$inferSelect>>,
  ) {
    for (const expense of expenses) {
      const expSplits = splitsByExpense.get(expense.id) ?? [];
      const cur = expense.currency || "USD";
      if (expense.paidByUserId === me) {
        for (const s of expSplits) {
          if (friendIdSet.has(s.userId)) {
            bump(s.userId, cur, parseFloat(s.amount));
          }
        }
      } else if (friendIdSet.has(expense.paidByUserId)) {
        const mySplit = expSplits.find((s) => s.userId === me);
        if (mySplit) {
          bump(expense.paidByUserId, cur, -parseFloat(mySplit.amount));
        }
      }
    }
  }

  // ── 4a. Group-based expenses & payments ───────────────────────────────────
  // Pre-fetch group currencies for payments without inherent currency.
  const groupCurrencyMap = new Map<string, string>();
  if (myGroupIds.length > 0) {
    const groupRows = await db
      .select({ id: groupsTable.id, currency: groupsTable.currency })
      .from(groupsTable)
      .where(inArray(groupsTable.id, myGroupIds));
    for (const g of groupRows) groupCurrencyMap.set(g.id, g.currency || "USD");

    const expenses = await db.select().from(expensesTable).where(and(inArray(expensesTable.groupId, myGroupIds), isNull(expensesTable.deletedAt)));
    const expenseIds = expenses.map((e) => e.id);
    const splits = expenseIds.length > 0
      ? await db.select().from(expenseSplitsTable).where(inArray(expenseSplitsTable.expenseId, expenseIds))
      : [];

    const splitsMap = new Map<string, typeof splits>();
    for (const s of splits) {
      if (!splitsMap.has(s.expenseId)) splitsMap.set(s.expenseId, []);
      splitsMap.get(s.expenseId)!.push(s);
    }

    applyExpenses(expenses, splitsMap);

    const payments = await db.select().from(paymentsTable).where(and(inArray(paymentsTable.groupId, myGroupIds), isNull(paymentsTable.deletedAt)));
    for (const p of payments) {
      const cur = (p.groupId && groupCurrencyMap.get(p.groupId)) || "USD";
      if (p.fromUserId === me && friendIdSet.has(p.toUserId)) {
        bump(p.toUserId, cur, parseFloat(p.amount));
      } else if (p.toUserId === me && friendIdSet.has(p.fromUserId)) {
        bump(p.fromUserId, cur, -parseFloat(p.amount));
      }
    }
  }

  // ── 4b. Non-group (friend-only) expenses ──────────────────────────────────
  const nonGroupAsPayer = await db
    .select()
    .from(expensesTable)
    .where(and(isNull(expensesTable.groupId), isNull(expensesTable.deletedAt), eq(expensesTable.paidByUserId, me)));

  const myNonGroupSplitRows = await db
    .select({ expenseId: expenseSplitsTable.expenseId })
    .from(expenseSplitsTable)
    .innerJoin(expensesTable, eq(expensesTable.id, expenseSplitsTable.expenseId))
    .where(and(isNull(expensesTable.groupId), isNull(expensesTable.deletedAt), eq(expenseSplitsTable.userId, me)));

  const nonGroupExpenseIds = new Set<string>([
    ...nonGroupAsPayer.map((e) => e.id),
    ...myNonGroupSplitRows.map((r) => r.expenseId),
  ]);

  if (nonGroupExpenseIds.size > 0) {
    const ids = [...nonGroupExpenseIds];
    const expenses = await db
      .select()
      .from(expensesTable)
      .where(and(inArray(expensesTable.id, ids), isNull(expensesTable.deletedAt)));
    const splits = await db
      .select()
      .from(expenseSplitsTable)
      .where(inArray(expenseSplitsTable.expenseId, ids));

    const splitsMap = new Map<string, typeof splits>();
    for (const s of splits) {
      if (!splitsMap.has(s.expenseId)) splitsMap.set(s.expenseId, []);
      splitsMap.get(s.expenseId)!.push(s);
    }

    applyExpenses(expenses, splitsMap);
  }

  // ── 4c. Non-group payments (groupId IS NULL) involving me ─────────────────
  // Payments table has no currency column; non-group payments default to USD.
  const nonGroupPayments = await db
    .select()
    .from(paymentsTable)
    .where(
      and(
        isNull(paymentsTable.groupId),
        isNull(paymentsTable.deletedAt),
        or(eq(paymentsTable.fromUserId, me), eq(paymentsTable.toUserId, me)),
      ),
    );
  for (const p of nonGroupPayments) {
    const cur = "USD";
    if (p.fromUserId === me && friendIdSet.has(p.toUserId)) {
      bump(p.toUserId, cur, parseFloat(p.amount));
    } else if (p.toUserId === me && friendIdSet.has(p.fromUserId)) {
      bump(p.fromUserId, cur, -parseFloat(p.amount));
    }
  }

  // ── 5. Groups info ─────────────────────────────────────────────────────────
  const groups = myGroupIds.length > 0
    ? await db.select({ id: groupsTable.id, name: groupsTable.name }).from(groupsTable).where(and(inArray(groupsTable.id, myGroupIds), isNull(groupsTable.deletedAt)))
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

      const perCur = balancesByCurrency.get(friendId) ?? new Map<string, number>();
      const balances: { currency: string; amount: number }[] = [];
      let netBalance = 0;
      for (const [cur, amt] of perCur) {
        const rounded = Math.round(amt * 100) / 100;
        if (Math.abs(rounded) >= 0.01) {
          balances.push({ currency: cur, amount: rounded });
          netBalance += rounded;
        }
      }
      // Stable sort: alphabetical by currency code.
      balances.sort((a, b) => a.currency.localeCompare(b.currency));

      return {
        id: user.id,
        name: user.name,
        email: user.email,
        avatarUrl: user.avatarUrl,
        netBalance: Math.round(netBalance * 100) / 100,
        balances,
        sharedGroups,
        isDirect,
      };
    })
    .filter(Boolean);

  // Sort: friends with non-zero balances first, then by absolute total.
  result.sort((a, b) => {
    const aHas = (a!.balances?.length ?? 0) > 0 ? 1 : 0;
    const bHas = (b!.balances?.length ?? 0) > 0 ? 1 : 0;
    if (aHas !== bHas) return bHas - aHas;
    return Math.abs(b!.netBalance) - Math.abs(a!.netBalance);
  });
  return result;
}

// GET /friends
router.get("/friends", requireAuth, async (req, res): Promise<void> => {
  const me = req.dbUserId!;
  const friends = await buildFriendList(me);
  res.json(friends);
});

// Helper: are `me` and `other` friends (direct or via shared group)?
async function isMyFriend(me: string, other: string): Promise<boolean> {
  const direct = await db
    .select()
    .from(friendshipsTable)
    .where(
      and(
        isNull(friendshipsTable.deletedAt),
        or(
          and(eq(friendshipsTable.userId, me), eq(friendshipsTable.friendId, other)),
          and(eq(friendshipsTable.userId, other), eq(friendshipsTable.friendId, me)),
        ),
      ),
    )
    .limit(1);
  if (direct.length > 0) return true;

  const myGroups = await db
    .select({ groupId: groupMembersTable.groupId })
    .from(groupMembersTable)
    .where(and(eq(groupMembersTable.userId, me), isNull(groupMembersTable.deletedAt)));
  if (myGroups.length === 0) return false;

  const shared = await db
    .select()
    .from(groupMembersTable)
    .where(
      and(
        eq(groupMembersTable.userId, other),
        isNull(groupMembersTable.deletedAt),
        inArray(
          groupMembersTable.groupId,
          myGroups.map((g) => g.groupId),
        ),
      ),
    )
    .limit(1);
  return shared.length > 0;
}

async function getUserById(id: string) {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id));
  return user;
}

async function buildExpenseWithSplits(
  expense: typeof expensesTable.$inferSelect,
  splits: Array<typeof expenseSplitsTable.$inferSelect>,
) {
  const paidByUser = await getUserById(expense.paidByUserId);
  const splitsWithUsers = await Promise.all(
    splits.map(async (split) => {
      const u = await getUserById(split.userId);
      return {
        ...split,
        user: { ...u, createdAt: u.createdAt.toISOString() },
        amount: parseFloat(split.amount),
        percentage: split.percentage !== null ? parseFloat(split.percentage) : null,
      };
    }),
  );
  return {
    ...expense,
    createdAt: expense.createdAt.toISOString(),
    totalAmount: parseFloat(expense.totalAmount),
    paidByUser: { ...paidByUser, createdAt: paidByUser.createdAt.toISOString() },
    splits: splitsWithUsers,
  };
}

// GET /friends/:friendId/activity
// Returns all expenses + payments between current user and the given friend,
// plus their net balance. Used by the per-friend detail page.
router.get(
  "/friends/:friendId/activity",
  requireAuth,
  async (req, res): Promise<void> => {
    const me = req.dbUserId!;
    const friendId = String(req.params.friendId ?? "");
    if (!UUID_RE.test(friendId)) {
      res.status(400).json({ error: "Invalid friendId" });
      return;
    }
    if (friendId === me) {
      res.status(400).json({ error: "Cannot view activity with yourself" });
      return;
    }

    if (!(await isMyFriend(me, friendId))) {
      res.status(403).json({ error: "User is not your friend" });
      return;
    }

    const friendUser = await getUserById(friendId);
    if (!friendUser) {
      res.status(404).json({ error: "Friend not found" });
      return;
    }

    // Candidate expense IDs: anything where me OR friend appears in splits OR paid.
    const splitRows = await db
      .select({ expenseId: expenseSplitsTable.expenseId })
      .from(expenseSplitsTable)
      .innerJoin(expensesTable, eq(expensesTable.id, expenseSplitsTable.expenseId))
      .where(and(inArray(expenseSplitsTable.userId, [me, friendId]), isNull(expensesTable.deletedAt)));
    const paidRows = await db
      .select({ id: expensesTable.id })
      .from(expensesTable)
      .where(
        and(
          isNull(expensesTable.deletedAt),
          or(eq(expensesTable.paidByUserId, me), eq(expensesTable.paidByUserId, friendId)),
        ),
      );
    const candidateIds = Array.from(
      new Set<string>([
        ...splitRows.map((s) => s.expenseId),
        ...paidRows.map((p) => p.id),
      ]),
    );

    // Load full expenses + their splits.
    const allExpenses = candidateIds.length
      ? await db
          .select()
          .from(expensesTable)
          .where(and(inArray(expensesTable.id, candidateIds), isNull(expensesTable.deletedAt)))
      : [];
    const allSplits = candidateIds.length
      ? await db
          .select()
          .from(expenseSplitsTable)
          .where(inArray(expenseSplitsTable.expenseId, candidateIds))
      : [];

    const splitsByExp = new Map<string, typeof allSplits>();
    for (const s of allSplits) {
      if (!splitsByExp.has(s.expenseId)) splitsByExp.set(s.expenseId, []);
      splitsByExp.get(s.expenseId)!.push(s);
    }

    // Filter to those where BOTH me and friend are participants (payer or split).
    const relevant = allExpenses.filter((e) => {
      const splits = splitsByExp.get(e.id) ?? [];
      const participants = new Set<string>([
        e.paidByUserId,
        ...splits.map((s) => s.userId),
      ]);
      return participants.has(me) && participants.has(friendId);
    });

    relevant.sort((a, b) => {
      const d = b.date.localeCompare(a.date);
      if (d !== 0) return d;
      return b.createdAt.getTime() - a.createdAt.getTime();
    });

    // Payments directly between us.
    const payments = await db
      .select()
      .from(paymentsTable)
      .where(
        and(
          isNull(paymentsTable.deletedAt),
          or(
            and(eq(paymentsTable.fromUserId, me), eq(paymentsTable.toUserId, friendId)),
            and(eq(paymentsTable.fromUserId, friendId), eq(paymentsTable.toUserId, me)),
          ),
        ),
      );
    payments.sort((a, b) => {
      const d = b.date.localeCompare(a.date);
      if (d !== 0) return d;
      return b.createdAt.getTime() - a.createdAt.getTime();
    });

    // Compute per-currency net balances: positive = friend owes me.
    // For payments, currency is inherited from the linked group (or "USD" if non-group).
    const paymentGroupIds = Array.from(
      new Set(payments.map((p) => p.groupId).filter((id): id is string => !!id)),
    );
    const paymentGroupCurrency = new Map<string, string>();
    if (paymentGroupIds.length > 0) {
      const rows = await db
        .select({ id: groupsTable.id, currency: groupsTable.currency })
        .from(groupsTable)
        .where(inArray(groupsTable.id, paymentGroupIds));
      for (const r of rows) paymentGroupCurrency.set(r.id, r.currency || "USD");
    }

    const perCurrency = new Map<string, number>();
    const bumpCur = (cur: string, delta: number) => {
      perCurrency.set(cur, (perCurrency.get(cur) ?? 0) + delta);
    };
    for (const e of relevant) {
      const splits = splitsByExp.get(e.id) ?? [];
      const cur = e.currency || "USD";
      if (e.paidByUserId === me) {
        const fs = splits.find((s) => s.userId === friendId);
        if (fs) bumpCur(cur, parseFloat(fs.amount));
      } else if (e.paidByUserId === friendId) {
        const ms = splits.find((s) => s.userId === me);
        if (ms) bumpCur(cur, -parseFloat(ms.amount));
      }
    }
    for (const p of payments) {
      const cur = (p.groupId && paymentGroupCurrency.get(p.groupId)) || "USD";
      if (p.fromUserId === me) bumpCur(cur, parseFloat(p.amount));
      else bumpCur(cur, -parseFloat(p.amount));
    }

    const balances: { currency: string; amount: number }[] = [];
    let net = 0;
    for (const [cur, amt] of perCurrency) {
      const rounded = Math.round(amt * 100) / 100;
      if (Math.abs(rounded) >= 0.01) {
        balances.push({ currency: cur, amount: rounded });
        net += rounded;
      }
    }
    balances.sort((a, b) => a.currency.localeCompare(b.currency));

    const expensesOut = await Promise.all(
      relevant.map((e) => buildExpenseWithSplits(e, splitsByExp.get(e.id) ?? [])),
    );
    const paymentsOut = await Promise.all(
      payments.map(async (p) => {
        const fromUser = await getUserById(p.fromUserId);
        const toUser = await getUserById(p.toUserId);
        const currency = (p.groupId && paymentGroupCurrency.get(p.groupId)) || "USD";
        return {
          ...p,
          amount: parseFloat(p.amount),
          currency,
          createdAt: p.createdAt.toISOString(),
          fromUser: { ...fromUser, createdAt: fromUser.createdAt.toISOString() },
          toUser: { ...toUser, createdAt: toUser.createdAt.toISOString() },
        };
      }),
    );

    res.json({
      friend: { ...friendUser, createdAt: friendUser.createdAt.toISOString() },
      netBalance: Math.round(net * 100) / 100,
      balances,
      expenses: expensesOut,
      payments: paymentsOut,
    });
  },
);

// POST /friends  { friendId }
router.post("/friends", requireVerifiedEmail, async (req, res): Promise<void> => {
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
    if (existing.deletedAt !== null) {
      // Re-activate previously soft-deleted friendship.
      await db
        .update(friendshipsTable)
        .set({ deletedAt: null, createdAt: new Date() })
        .where(eq(friendshipsTable.id, existing.id));
      res.status(201).json({ ok: true });
      return;
    }
    res.status(409).json({ error: "Already friends" });
    return;
  }

  await db.insert(friendshipsTable).values({ userId: me, friendId });
  res.status(201).json({ ok: true });
});

// DELETE /friends/:friendId
router.delete("/friends/:friendId", requireVerifiedEmail, async (req, res): Promise<void> => {
  const me = req.dbUserId!;
  const friendId = req.params.friendId;
  if (!UUID_RE.test(friendId)) {
    res.status(400).json({ error: "Invalid friendId" });
    return;
  }

  await db
    .update(friendshipsTable)
    .set({ deletedAt: new Date() })
    .where(
      and(
        isNull(friendshipsTable.deletedAt),
        or(
          and(eq(friendshipsTable.userId, me), eq(friendshipsTable.friendId, friendId)),
          and(eq(friendshipsTable.userId, friendId), eq(friendshipsTable.friendId, me)),
        ),
      ),
    );

  res.json({ ok: true });
});

export default router;
