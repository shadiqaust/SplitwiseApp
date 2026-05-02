import { Router, type IRouter } from "express";
import { eq, and, desc, inArray, isNull, or } from "drizzle-orm";
import { db, groupMembersTable, groupsTable, expensesTable, expenseSplitsTable, paymentsTable, usersTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { GetActivityQueryParams } from "@workspace/api-zod";

const router: IRouter = Router();

async function getUserById(id: string) {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id));
  return user;
}

// GET /dashboard/summary
router.get("/dashboard/summary", requireAuth, async (req, res): Promise<void> => {
  const userId = req.dbUserId!;

  // Get all groups the user belongs to
  const memberships = await db.select().from(groupMembersTable).where(and(eq(groupMembersTable.userId, userId), isNull(groupMembersTable.deletedAt)));

  const groupIds = memberships.map(m => m.groupId);
  const groups = groupIds.length === 0
    ? []
    : await db.select().from(groupsTable).where(and(inArray(groupsTable.id, groupIds), isNull(groupsTable.deletedAt)));

  let totalOwed = 0;
  let totalIOwe = 0;

  const groupSummaries = await Promise.all(groups.map(async (group) => {
    const expenses = await db.select().from(expensesTable).where(and(eq(expensesTable.groupId, group.id), isNull(expensesTable.deletedAt)));

    let groupOwed = 0;
    let groupIOwe = 0;

    for (const expense of expenses) {
      const splits = await db.select().from(expenseSplitsTable).where(eq(expenseSplitsTable.expenseId, expense.id));
      if (expense.paidByUserId === userId) {
        for (const split of splits) {
          if (split.userId !== userId) {
            groupOwed += parseFloat(split.amount);
          }
        }
      } else {
        const mySplit = splits.find(s => s.userId === userId);
        if (mySplit) {
          groupIOwe += parseFloat(mySplit.amount);
        }
      }
    }

    // Subtract payments
    const receivedPayments = await db.select().from(paymentsTable)
      .where(and(eq(paymentsTable.groupId, group.id), eq(paymentsTable.toUserId, userId), isNull(paymentsTable.deletedAt)));
    const sentPayments = await db.select().from(paymentsTable)
      .where(and(eq(paymentsTable.groupId, group.id), eq(paymentsTable.fromUserId, userId), isNull(paymentsTable.deletedAt)));

    for (const p of receivedPayments) groupOwed -= parseFloat(p.amount);
    for (const p of sentPayments) groupIOwe -= parseFloat(p.amount);

    const groupNet = groupOwed - groupIOwe;
    if (groupNet > 0) totalOwed += groupNet;
    else if (groupNet < 0) totalIOwe += -groupNet;

    return {
      groupId: group.id,
      groupName: group.name,
      avatarUrl: group.avatarUrl ?? null,
      myNetBalance: Math.round(groupNet * 100) / 100,
    };
  }));

  // ── Non-group (friend-only) expenses ────────────────────────────────────
  // Aggregate balances from expenses with groupId = NULL where the user is the
  // payer or appears in a split.
  const nonGroupAsPayer = await db
    .select()
    .from(expensesTable)
    .where(and(isNull(expensesTable.groupId), isNull(expensesTable.deletedAt), eq(expensesTable.paidByUserId, userId)));

  const myNonGroupSplitRows = await db
    .select({ expenseId: expenseSplitsTable.expenseId })
    .from(expenseSplitsTable)
    .innerJoin(expensesTable, eq(expensesTable.id, expenseSplitsTable.expenseId))
    .where(and(isNull(expensesTable.groupId), isNull(expensesTable.deletedAt), eq(expenseSplitsTable.userId, userId)));

  const nonGroupExpenseIds = Array.from(
    new Set<string>([
      ...nonGroupAsPayer.map((e) => e.id),
      ...myNonGroupSplitRows.map((r) => r.expenseId),
    ]),
  );

  let nonGroupOwed = 0;
  let nonGroupIOwe = 0;

  if (nonGroupExpenseIds.length > 0) {
    const expenses = await db
      .select()
      .from(expensesTable)
      .where(and(inArray(expensesTable.id, nonGroupExpenseIds), isNull(expensesTable.deletedAt)));
    const splits = await db
      .select()
      .from(expenseSplitsTable)
      .where(inArray(expenseSplitsTable.expenseId, nonGroupExpenseIds));

    const splitsByExpense = new Map<string, typeof splits>();
    for (const s of splits) {
      if (!splitsByExpense.has(s.expenseId)) splitsByExpense.set(s.expenseId, []);
      splitsByExpense.get(s.expenseId)!.push(s);
    }

    for (const expense of expenses) {
      const expSplits = splitsByExpense.get(expense.id) ?? [];
      if (expense.paidByUserId === userId) {
        for (const s of expSplits) {
          if (s.userId !== userId) nonGroupOwed += parseFloat(s.amount);
        }
      } else {
        const mine = expSplits.find((s) => s.userId === userId);
        if (mine) nonGroupIOwe += parseFloat(mine.amount);
      }
    }
  }

  // ── Non-group payments (groupId IS NULL) ───────────────────────────────
  const nonGroupReceived = await db
    .select()
    .from(paymentsTable)
    .where(
      and(
        isNull(paymentsTable.groupId),
        isNull(paymentsTable.deletedAt),
        eq(paymentsTable.toUserId, userId),
      ),
    );
  const nonGroupSent = await db
    .select()
    .from(paymentsTable)
    .where(
      and(
        isNull(paymentsTable.groupId),
        isNull(paymentsTable.deletedAt),
        eq(paymentsTable.fromUserId, userId),
      ),
    );
  for (const p of nonGroupReceived) nonGroupOwed -= parseFloat(p.amount);
  for (const p of nonGroupSent) nonGroupIOwe -= parseFloat(p.amount);

  // Clamp so overpayments don't drive a bucket below zero.
  totalOwed += Math.max(0, nonGroupOwed);
  totalIOwe += Math.max(0, nonGroupIOwe);

  res.json({
    totalOwed: Math.round(totalOwed * 100) / 100,
    totalIOwe: Math.round(totalIOwe * 100) / 100,
    netBalance: Math.round((totalOwed - totalIOwe) * 100) / 100,
    groupCount: groups.length,
    groupSummaries,
    nonGroupNetBalance: Math.round((nonGroupOwed - nonGroupIOwe) * 100) / 100,
    nonGroupExpenseCount: nonGroupExpenseIds.length,
  });
});

// GET /dashboard/activity
router.get("/dashboard/activity", requireAuth, async (req, res): Promise<void> => {
  const userId = req.dbUserId!;

  const queryParams = GetActivityQueryParams.safeParse(req.query);
  const limit = queryParams.success ? (queryParams.data.limit ?? 20) : 20;

  const memberships = await db.select().from(groupMembersTable).where(and(eq(groupMembersTable.userId, userId), isNull(groupMembersTable.deletedAt)));

  if (memberships.length === 0) {
    res.json([]);
    return;
  }

  const groupIds = memberships.map(m => m.groupId);
  const groups = await db.select().from(groupsTable).where(and(inArray(groupsTable.id, groupIds), isNull(groupsTable.deletedAt)));
  const groupMap = new Map(groups.map(g => [g.id, g]));

  // Fetch recent expenses
  const expenses = await db.select().from(expensesTable)
    .where(and(inArray(expensesTable.groupId, groupIds), isNull(expensesTable.deletedAt)))
    .orderBy(desc(expensesTable.createdAt))
    .limit(limit);

  // Fetch recent payments
  const payments = await db.select().from(paymentsTable)
    .where(and(inArray(paymentsTable.groupId, groupIds), isNull(paymentsTable.deletedAt)))
    .orderBy(desc(paymentsTable.createdAt))
    .limit(limit);

  const activityItems = [];

  for (const expense of expenses) {
    // The query above filters by inArray(groupId, groupIds), so groupId is non-null here.
    const expenseGroupId = expense.groupId!;
    const paidByUser = await getUserById(expense.paidByUserId);
    const group = groupMap.get(expenseGroupId);
    activityItems.push({
      id: `expense-${expense.id}`,
      type: "expense" as const,
      groupId: expenseGroupId,
      groupName: group?.name ?? "Unknown",
      description: expense.description,
      amount: parseFloat(expense.totalAmount),
      involvedUserId: expense.paidByUserId,
      involvedUser: { ...paidByUser, createdAt: paidByUser.createdAt.toISOString() },
      date: expense.date,
      createdAt: expense.createdAt.toISOString(),
    });
  }

  for (const payment of payments) {
    const fromUser = await getUserById(payment.fromUserId);
    const group = payment.groupId ? groupMap.get(payment.groupId) : undefined;
    activityItems.push({
      id: `payment-${payment.id}`,
      type: "payment" as const,
      groupId: payment.groupId ?? "",
      groupName: group?.name ?? (payment.groupId ? "Unknown" : "Friends"),
      description: payment.note ?? `${fromUser?.name ?? "Someone"} paid`,
      amount: parseFloat(payment.amount),
      involvedUserId: payment.fromUserId,
      involvedUser: { ...fromUser, createdAt: fromUser.createdAt.toISOString() },
      date: payment.date,
      createdAt: payment.createdAt.toISOString(),
    });
  }

  // Sort by createdAt desc and limit
  activityItems.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  res.json(activityItems.slice(0, limit));
});

export default router;
