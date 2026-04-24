import { Router, type IRouter } from "express";
import { eq, desc, and } from "drizzle-orm";
import { db, expensesTable, expenseSplitsTable, usersTable, groupMembersTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import {
  CreateExpenseBody,
  UpdateExpenseBody,
  ListExpensesQueryParams,
  GetExpenseParams,
  UpdateExpenseParams,
  DeleteExpenseParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

async function getUserById(id: number) {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id));
  return user;
}

async function buildExpenseWithSplits(expense: typeof expensesTable.$inferSelect) {
  const splits = await db.select().from(expenseSplitsTable).where(eq(expenseSplitsTable.expenseId, expense.id));
  const paidByUser = await getUserById(expense.paidByUserId);
  const splitsWithUsers = await Promise.all(splits.map(async (split) => {
    const user = await getUserById(split.userId);
    return {
      ...split,
      user: { ...user, createdAt: user.createdAt.toISOString() },
      amount: parseFloat(split.amount),
      percentage: split.percentage !== null ? parseFloat(split.percentage) : null,
    };
  }));

  return {
    ...expense,
    createdAt: expense.createdAt.toISOString(),
    totalAmount: parseFloat(expense.totalAmount),
    paidByUser: { ...paidByUser, createdAt: paidByUser.createdAt.toISOString() },
    splits: splitsWithUsers,
  };
}

// GET /groups/:groupId/expenses
router.get("/groups/:groupId/expenses", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.groupId) ? req.params.groupId[0] : req.params.groupId;
  const groupId = parseInt(raw, 10);

  const queryParams = ListExpensesQueryParams.safeParse(req.query);
  const limit = queryParams.success ? (queryParams.data.limit ?? 50) : 50;
  const offset = queryParams.success ? (queryParams.data.offset ?? 0) : 0;

  const expenses = await db.select()
    .from(expensesTable)
    .where(eq(expensesTable.groupId, groupId))
    .orderBy(desc(expensesTable.date), desc(expensesTable.createdAt))
    .limit(limit)
    .offset(offset);

  const result = await Promise.all(expenses.map(buildExpenseWithSplits));
  res.json(result);
});

// POST /groups/:groupId/expenses
router.post("/groups/:groupId/expenses", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.groupId) ? req.params.groupId[0] : req.params.groupId;
  const groupId = parseInt(raw, 10);

  const parsed = CreateExpenseBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { description, totalAmount, currency, splitType, paidByUserId, date, splits } = parsed.data;

  // Validate split amounts add up
  if (splitType === "equal") {
    const equalShare = totalAmount / splits.length;
    const [expense] = await db.insert(expensesTable).values({
      groupId,
      description,
      totalAmount: totalAmount.toFixed(2),
      currency: currency ?? "USD",
      splitType,
      paidByUserId,
      date: String(date),
    }).returning();

    for (const split of splits) {
      await db.insert(expenseSplitsTable).values({
        expenseId: expense.id,
        userId: split.userId,
        amount: equalShare.toFixed(2),
        percentage: null,
      });
    }

    const result = await buildExpenseWithSplits(expense);
    res.status(201).json(result);
    return;
  }

  if (splitType === "percentage") {
    const [expense] = await db.insert(expensesTable).values({
      groupId,
      description,
      totalAmount: totalAmount.toFixed(2),
      currency: currency ?? "USD",
      splitType,
      paidByUserId,
      date: String(date),
    }).returning();

    for (const split of splits) {
      const pct = split.percentage ?? 0;
      const amount = (totalAmount * pct) / 100;
      await db.insert(expenseSplitsTable).values({
        expenseId: expense.id,
        userId: split.userId,
        amount: amount.toFixed(2),
        percentage: pct.toFixed(2),
      });
    }

    const result = await buildExpenseWithSplits(expense);
    res.status(201).json(result);
    return;
  }

  // exact
  const [expense] = await db.insert(expensesTable).values({
    groupId,
    description,
    totalAmount: totalAmount.toFixed(2),
    currency: currency ?? "USD",
    splitType,
    paidByUserId,
    date: String(date),
  }).returning();

  for (const split of splits) {
    await db.insert(expenseSplitsTable).values({
      expenseId: expense.id,
      userId: split.userId,
      amount: (split.amount ?? 0).toFixed(2),
      percentage: null,
    });
  }

  const result = await buildExpenseWithSplits(expense);
  res.status(201).json(result);
});

// GET /expenses/:expenseId
router.get("/expenses/:expenseId", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.expenseId) ? req.params.expenseId[0] : req.params.expenseId;
  const expenseId = parseInt(raw, 10);

  const [expense] = await db.select().from(expensesTable).where(eq(expensesTable.id, expenseId));
  if (!expense) {
    res.status(404).json({ error: "Expense not found" });
    return;
  }

  res.json(await buildExpenseWithSplits(expense));
});

// PUT /expenses/:expenseId
router.put("/expenses/:expenseId", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.expenseId) ? req.params.expenseId[0] : req.params.expenseId;
  const expenseId = parseInt(raw, 10);

  const parsed = UpdateExpenseBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updateData: Record<string, unknown> = {};
  if (parsed.data.description !== undefined) updateData.description = parsed.data.description;
  if (parsed.data.totalAmount !== undefined) updateData.totalAmount = parsed.data.totalAmount.toFixed(2);
  if (parsed.data.currency !== undefined) updateData.currency = parsed.data.currency;
  if (parsed.data.splitType !== undefined) updateData.splitType = parsed.data.splitType;
  if (parsed.data.paidByUserId !== undefined) updateData.paidByUserId = parsed.data.paidByUserId;
  if (parsed.data.date !== undefined) updateData.date = String(parsed.data.date);

  const [expense] = await db.update(expensesTable)
    .set(updateData)
    .where(eq(expensesTable.id, expenseId))
    .returning();

  if (!expense) {
    res.status(404).json({ error: "Expense not found" });
    return;
  }

  // Rebuild splits if provided
  if (parsed.data.splits) {
    await db.delete(expenseSplitsTable).where(eq(expenseSplitsTable.expenseId, expenseId));
    const totalAmount = parseFloat(expense.totalAmount);
    const splitType = expense.splitType;

    for (const split of parsed.data.splits) {
      let amount = split.amount ?? 0;
      let percentage = null as string | null;

      if (splitType === "equal") {
        amount = totalAmount / parsed.data.splits.length;
      } else if (splitType === "percentage" && split.percentage !== null && split.percentage !== undefined) {
        amount = (totalAmount * split.percentage) / 100;
        percentage = split.percentage.toFixed(2);
      }

      await db.insert(expenseSplitsTable).values({
        expenseId,
        userId: split.userId,
        amount: amount.toFixed(2),
        percentage,
      });
    }
  }

  res.json(await buildExpenseWithSplits(expense));
});

// DELETE /expenses/:expenseId
router.delete("/expenses/:expenseId", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.expenseId) ? req.params.expenseId[0] : req.params.expenseId;
  const expenseId = parseInt(raw, 10);

  const [expense] = await db.delete(expensesTable).where(eq(expensesTable.id, expenseId)).returning();
  if (!expense) {
    res.status(404).json({ error: "Expense not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;
