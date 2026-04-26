import { Router, type IRouter } from "express";
import { eq, and, desc, inArray } from "drizzle-orm";
import { db, groupMembersTable, groupsTable, expensesTable, expenseSplitsTable, paymentsTable, usersTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { GetActivityQueryParams } from "@workspace/api-zod";

const router: IRouter = Router();

async function getUserById(id: number) {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id));
  return user;
}

// GET /dashboard/summary
router.get("/dashboard/summary", requireAuth, async (req, res): Promise<void> => {
  const userId = req.dbUserId!;

  // Get all groups the user belongs to
  const memberships = await db.select().from(groupMembersTable).where(eq(groupMembersTable.userId, userId));

  if (memberships.length === 0) {
    res.json({
      totalOwed: 0,
      totalIOwe: 0,
      netBalance: 0,
      groupCount: 0,
      groupSummaries: [],
    });
    return;
  }

  const groupIds = memberships.map(m => m.groupId);
  const groups = await db.select().from(groupsTable).where(inArray(groupsTable.id, groupIds));

  let totalOwed = 0;
  let totalIOwe = 0;

  const groupSummaries = await Promise.all(groups.map(async (group) => {
    const expenses = await db.select().from(expensesTable).where(eq(expensesTable.groupId, group.id));

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
      .where(and(eq(paymentsTable.groupId, group.id), eq(paymentsTable.toUserId, userId)));
    const sentPayments = await db.select().from(paymentsTable)
      .where(and(eq(paymentsTable.groupId, group.id), eq(paymentsTable.fromUserId, userId)));

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

  res.json({
    totalOwed: Math.round(totalOwed * 100) / 100,
    totalIOwe: Math.round(totalIOwe * 100) / 100,
    netBalance: Math.round((totalOwed - totalIOwe) * 100) / 100,
    groupCount: groups.length,
    groupSummaries,
  });
});

// GET /dashboard/activity
router.get("/dashboard/activity", requireAuth, async (req, res): Promise<void> => {
  const userId = req.dbUserId!;

  const queryParams = GetActivityQueryParams.safeParse(req.query);
  const limit = queryParams.success ? (queryParams.data.limit ?? 20) : 20;

  const memberships = await db.select().from(groupMembersTable).where(eq(groupMembersTable.userId, userId));

  if (memberships.length === 0) {
    res.json([]);
    return;
  }

  const groupIds = memberships.map(m => m.groupId);
  const groups = await db.select().from(groupsTable).where(inArray(groupsTable.id, groupIds));
  const groupMap = new Map(groups.map(g => [g.id, g]));

  // Fetch recent expenses
  const expenses = await db.select().from(expensesTable)
    .where(inArray(expensesTable.groupId, groupIds))
    .orderBy(desc(expensesTable.createdAt))
    .limit(limit);

  // Fetch recent payments
  const payments = await db.select().from(paymentsTable)
    .where(inArray(paymentsTable.groupId, groupIds))
    .orderBy(desc(paymentsTable.createdAt))
    .limit(limit);

  const activityItems = [];

  for (const expense of expenses) {
    const paidByUser = await getUserById(expense.paidByUserId);
    const group = groupMap.get(expense.groupId);
    activityItems.push({
      id: `expense-${expense.id}`,
      type: "expense" as const,
      groupId: expense.groupId,
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
    const group = groupMap.get(payment.groupId);
    activityItems.push({
      id: `payment-${payment.id}`,
      type: "payment" as const,
      groupId: payment.groupId,
      groupName: group?.name ?? "Unknown",
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
