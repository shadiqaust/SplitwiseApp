import { Router, type IRouter } from "express";
import { eq, desc, inArray, and, or, isNull } from "drizzle-orm";
import {
  db,
  expensesTable,
  expenseSplitsTable,
  usersTable,
  groupMembersTable,
  friendshipsTable,
} from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import {
  requireGroupMember,
  requireExpenseAccess,
} from "../middlewares/requireGroupAccess";
import {
  CreateExpenseBody,
  CreateFriendExpenseBody,
  UpdateExpenseBody,
  ListExpensesQueryParams,
} from "@workspace/api-zod";

function toDateString(value: string): string {
  const d = new Date(value);
  return isNaN(d.getTime()) ? value : d.toISOString().split("T")[0];
}

const router: IRouter = Router();

async function getUserById(id: string) {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id));
  return user;
}

async function buildExpenseWithSplits(expense: typeof expensesTable.$inferSelect) {
  const splits = await db
    .select()
    .from(expenseSplitsTable)
    .where(eq(expenseSplitsTable.expenseId, expense.id));
  const paidByUser = await getUserById(expense.paidByUserId);
  const splitsWithUsers = await Promise.all(
    splits.map(async (split) => {
      const user = await getUserById(split.userId);
      return {
        ...split,
        user: { ...user, createdAt: user.createdAt.toISOString() },
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

async function getMemberIds(groupId: string): Promise<Set<string>> {
  const rows = await db
    .select({ userId: groupMembersTable.userId })
    .from(groupMembersTable)
    .where(eq(groupMembersTable.groupId, groupId));
  return new Set(rows.map((r) => r.userId));
}

type SplitInput = { userId: string; amount?: number | null; percentage?: number | null };

function computeFinalSplits(
  splitType: "equal" | "exact" | "percentage",
  totalAmount: number,
  splits: SplitInput[],
): { ok: true; rows: Array<{ userId: string; amount: string; percentage: string | null }> } | { ok: false; error: string } {
  if (splits.length === 0) return { ok: false, error: "At least one split is required" };

  const totalCents = Math.round(totalAmount * 100);

  if (splitType === "equal") {
    const baseCents = Math.floor(totalCents / splits.length);
    let remainder = totalCents - baseCents * splits.length;
    const rows = splits.map((s) => {
      const cents = baseCents + (remainder > 0 ? 1 : 0);
      if (remainder > 0) remainder -= 1;
      return {
        userId: s.userId,
        amount: (cents / 100).toFixed(2),
        percentage: null,
      };
    });
    return { ok: true, rows };
  }

  if (splitType === "exact") {
    let sumCents = 0;
    const rows = splits.map((s) => {
      const amt = Number(s.amount ?? 0);
      const cents = Math.round(amt * 100);
      sumCents += cents;
      return {
        userId: s.userId,
        amount: (cents / 100).toFixed(2),
        percentage: null,
      };
    });
    if (sumCents !== totalCents) {
      return {
        ok: false,
        error: `Exact split amounts (${(sumCents / 100).toFixed(2)}) must sum to total (${totalAmount.toFixed(2)})`,
      };
    }
    return { ok: true, rows };
  }

  // percentage
  let sumPctTimes100 = 0;
  let allocatedCents = 0;
  const rows: Array<{ userId: string; amount: string; percentage: string | null }> = [];
  splits.forEach((s, i) => {
    const pct = Number(s.percentage ?? 0);
    sumPctTimes100 += Math.round(pct * 100);
    let cents: number;
    if (i === splits.length - 1) {
      cents = totalCents - allocatedCents;
    } else {
      cents = Math.round((totalCents * pct) / 100);
      allocatedCents += cents;
    }
    rows.push({
      userId: s.userId,
      amount: (cents / 100).toFixed(2),
      percentage: pct.toFixed(2),
    });
  });
  if (sumPctTimes100 !== 10000) {
    return {
      ok: false,
      error: `Percentages must sum to 100 (got ${(sumPctTimes100 / 100).toFixed(2)})`,
    };
  }
  return { ok: true, rows };
}

// Helper: are these two users friends? (direct friendship OR shared group member)
async function areFriends(userA: string, userB: string): Promise<boolean> {
  // Direct friendship?
  const [direct] = await db
    .select({ id: friendshipsTable.id })
    .from(friendshipsTable)
    .where(
      or(
        and(
          eq(friendshipsTable.userId, userA),
          eq(friendshipsTable.friendId, userB),
        ),
        and(
          eq(friendshipsTable.userId, userB),
          eq(friendshipsTable.friendId, userA),
        ),
      ),
    );
  if (direct) return true;

  // Shared group?
  const aGroups = await db
    .select({ groupId: groupMembersTable.groupId })
    .from(groupMembersTable)
    .where(eq(groupMembersTable.userId, userA));
  if (aGroups.length === 0) return false;
  const aGroupIds = aGroups.map((g) => g.groupId);
  const [sharedRow] = await db
    .select({ id: groupMembersTable.id })
    .from(groupMembersTable)
    .where(
      and(
        eq(groupMembersTable.userId, userB),
        inArray(groupMembersTable.groupId, aGroupIds),
      ),
    );
  return Boolean(sharedRow);
}

// GET /expenses/non-group — list all non-group expenses involving the current user.
router.get(
  "/expenses/non-group",
  requireAuth,
  async (req, res): Promise<void> => {
    const me = req.dbUserId!;

    const asPayer = await db
      .select()
      .from(expensesTable)
      .where(
        and(isNull(expensesTable.groupId), eq(expensesTable.paidByUserId, me)),
      );

    const asSplit = await db
      .select({ expenseId: expenseSplitsTable.expenseId })
      .from(expenseSplitsTable)
      .innerJoin(expensesTable, eq(expensesTable.id, expenseSplitsTable.expenseId))
      .where(
        and(isNull(expensesTable.groupId), eq(expenseSplitsTable.userId, me)),
      );

    const expenseIds = Array.from(
      new Set<string>([
        ...asPayer.map((e) => e.id),
        ...asSplit.map((r) => r.expenseId),
      ]),
    );

    if (expenseIds.length === 0) {
      res.json({ myNetBalance: 0, count: 0, expenses: [] });
      return;
    }

    const expenses = await db
      .select()
      .from(expensesTable)
      .where(inArray(expensesTable.id, expenseIds))
      .orderBy(desc(expensesTable.date), desc(expensesTable.createdAt));

    const allSplits = await db
      .select()
      .from(expenseSplitsTable)
      .where(inArray(expenseSplitsTable.expenseId, expenseIds));

    const splitsByExpense = new Map<string, typeof allSplits>();
    for (const s of allSplits) {
      if (!splitsByExpense.has(s.expenseId)) splitsByExpense.set(s.expenseId, []);
      splitsByExpense.get(s.expenseId)!.push(s);
    }

    let myNet = 0;
    for (const e of expenses) {
      const splits = splitsByExpense.get(e.id) ?? [];
      if (e.paidByUserId === me) {
        for (const s of splits) {
          if (s.userId !== me) myNet += parseFloat(s.amount);
        }
      } else {
        const mine = splits.find((s) => s.userId === me);
        if (mine) myNet -= parseFloat(mine.amount);
      }
    }

    const built = await Promise.all(expenses.map(buildExpenseWithSplits));

    res.json({
      myNetBalance: Math.round(myNet * 100) / 100,
      count: built.length,
      expenses: built,
    });
  },
);

// POST /expenses — create a non-group expense between current user and a friend.
router.post(
  "/expenses",
  requireAuth,
  async (req, res): Promise<void> => {
    const me = req.dbUserId!;
    const parsed = CreateFriendExpenseBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const {
      friendUserId,
      friendUserIds,
      description,
      category,
      totalAmount,
      currency,
      splitType,
      paidByUserId,
      date,
      splits,
    } = parsed.data;

    if (totalAmount <= 0) {
      res.status(400).json({ error: "Total amount must be positive" });
      return;
    }

    // Resolve friend list: prefer friendUserIds (multi), fall back to friendUserId (single).
    const rawFriendIds: string[] =
      friendUserIds && friendUserIds.length > 0
        ? friendUserIds
        : friendUserId
          ? [friendUserId]
          : [];

    if (rawFriendIds.length === 0) {
      res.status(400).json({
        error: "Must include at least one friend (friendUserId or friendUserIds)",
      });
      return;
    }
    const friendIdSet = new Set(rawFriendIds);
    if (friendIdSet.size !== rawFriendIds.length) {
      res.status(400).json({ error: "Duplicate friends in request" });
      return;
    }
    if (friendIdSet.has(me)) {
      res
        .status(400)
        .json({ error: "Cannot create an expense with yourself" });
      return;
    }
    for (const fid of rawFriendIds) {
      if (!(await areFriends(me, fid))) {
        res
          .status(403)
          .json({ error: "You can only add expenses with your friends" });
        return;
      }
    }

    const allowed = new Set([me, ...rawFriendIds]);
    if (!allowed.has(paidByUserId)) {
      res
        .status(400)
        .json({ error: "Payer must be you or one of the selected friends" });
      return;
    }
    // Multi-friend non-group expenses must split equally (UI invariant + simpler UX).
    if (rawFriendIds.length > 1 && splitType !== "equal") {
      res.status(400).json({
        error: "Multi-friend expenses must use equal split",
      });
      return;
    }
    // Splits must reference exactly all participants, each once.
    const splitUserIds = splits.map((s) => s.userId);
    const uniqueSplitUserIds = new Set(splitUserIds);
    if (
      splitUserIds.length !== allowed.size ||
      uniqueSplitUserIds.size !== allowed.size
    ) {
      res.status(400).json({
        error: "Splits must include each participant exactly once",
      });
      return;
    }
    for (const id of allowed) {
      if (!uniqueSplitUserIds.has(id)) {
        res.status(400).json({
          error: "Splits must cover you and every selected friend",
        });
        return;
      }
    }

    const computed = computeFinalSplits(splitType, totalAmount, splits);
    if (!computed.ok) {
      res.status(400).json({ error: computed.error });
      return;
    }

    const [expense] = await db
      .insert(expensesTable)
      .values({
        groupId: null,
        description,
        category: category ?? null,
        totalAmount: totalAmount.toFixed(2),
        currency: currency ?? "USD",
        splitType,
        paidByUserId,
        date: toDateString(String(date)),
      })
      .returning();

    for (const row of computed.rows) {
      await db.insert(expenseSplitsTable).values({
        expenseId: expense.id,
        userId: row.userId,
        amount: row.amount,
        percentage: row.percentage,
      });
    }

    res.status(201).json(await buildExpenseWithSplits(expense));
  },
);

router.get(
  "/groups/:groupId/expenses",
  requireAuth,
  requireGroupMember(),
  async (req, res): Promise<void> => {
    const groupId = req.authorizedGroupId!;
    const queryParams = ListExpensesQueryParams.safeParse(req.query);
    const limit = queryParams.success ? (queryParams.data.limit ?? 50) : 50;
    const offset = queryParams.success ? (queryParams.data.offset ?? 0) : 0;

    const expenses = await db
      .select()
      .from(expensesTable)
      .where(eq(expensesTable.groupId, groupId))
      .orderBy(desc(expensesTable.date), desc(expensesTable.createdAt))
      .limit(limit)
      .offset(offset);

    const result = await Promise.all(expenses.map(buildExpenseWithSplits));
    res.json(result);
  },
);

router.post(
  "/groups/:groupId/expenses",
  requireAuth,
  requireGroupMember(),
  async (req, res): Promise<void> => {
    const groupId = req.authorizedGroupId!;
    const parsed = CreateExpenseBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const { description, category, totalAmount, currency, splitType, paidByUserId, date, splits } =
      parsed.data;

    if (totalAmount <= 0) {
      res.status(400).json({ error: "Total amount must be positive" });
      return;
    }

    const memberIds = await getMemberIds(groupId);
    if (!memberIds.has(paidByUserId)) {
      res.status(400).json({ error: "Payer must be a group member" });
      return;
    }
    for (const s of splits) {
      if (!memberIds.has(s.userId)) {
        res.status(400).json({ error: "All split participants must be group members" });
        return;
      }
    }

    const computed = computeFinalSplits(splitType, totalAmount, splits);
    if (!computed.ok) {
      res.status(400).json({ error: computed.error });
      return;
    }

    const [expense] = await db
      .insert(expensesTable)
      .values({
        groupId,
        description,
        category: category ?? null,
        totalAmount: totalAmount.toFixed(2),
        currency: currency ?? "USD",
        splitType,
        paidByUserId,
        date: toDateString(String(date)),
      })
      .returning();

    for (const row of computed.rows) {
      await db.insert(expenseSplitsTable).values({
        expenseId: expense.id,
        userId: row.userId,
        amount: row.amount,
        percentage: row.percentage,
      });
    }

    res.status(201).json(await buildExpenseWithSplits(expense));
  },
);

router.get(
  "/expenses/:expenseId",
  requireAuth,
  requireExpenseAccess(),
  async (req, res): Promise<void> => {
    const raw = Array.isArray(req.params.expenseId)
      ? req.params.expenseId[0]
      : req.params.expenseId;
    const expenseId = raw;
    const [expense] = await db
      .select()
      .from(expensesTable)
      .where(eq(expensesTable.id, expenseId));
    if (!expense) {
      res.status(404).json({ error: "Expense not found" });
      return;
    }
    res.json(await buildExpenseWithSplits(expense));
  },
);

router.put(
  "/expenses/:expenseId",
  requireAuth,
  requireExpenseAccess(),
  async (req, res): Promise<void> => {
    const raw = Array.isArray(req.params.expenseId)
      ? req.params.expenseId[0]
      : req.params.expenseId;
    const expenseId = raw;

    const parsed = UpdateExpenseBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const [current] = await db
      .select()
      .from(expensesTable)
      .where(eq(expensesTable.id, expenseId));
    if (!current) {
      res.status(404).json({ error: "Expense not found" });
      return;
    }

    // Editing non-group (friend-only) expenses is not yet supported.
    if (current.groupId === null) {
      res.status(400).json({
        error: "Editing non-group friend expenses is not supported yet",
      });
      return;
    }

    const groupId = current.groupId;
    const memberIds = await getMemberIds(groupId);

    const newSplitType = (parsed.data.splitType ?? current.splitType) as
      | "equal"
      | "exact"
      | "percentage";
    const newTotal =
      parsed.data.totalAmount !== undefined
        ? parsed.data.totalAmount
        : parseFloat(current.totalAmount);
    const newPaidBy =
      parsed.data.paidByUserId !== undefined
        ? parsed.data.paidByUserId
        : current.paidByUserId;

    if (newTotal <= 0) {
      res.status(400).json({ error: "Total amount must be positive" });
      return;
    }
    if (!memberIds.has(newPaidBy)) {
      res.status(400).json({ error: "Payer must be a group member" });
      return;
    }

    const updateData: Record<string, unknown> = {};
    if (parsed.data.description !== undefined) updateData.description = parsed.data.description;
    if (parsed.data.totalAmount !== undefined)
      updateData.totalAmount = parsed.data.totalAmount.toFixed(2);
    if (parsed.data.currency !== undefined) updateData.currency = parsed.data.currency;
    if (parsed.data.splitType !== undefined) updateData.splitType = parsed.data.splitType;
    if (parsed.data.paidByUserId !== undefined) updateData.paidByUserId = parsed.data.paidByUserId;
    if (parsed.data.date !== undefined) updateData.date = toDateString(String(parsed.data.date));

    if (parsed.data.splits) {
      for (const s of parsed.data.splits) {
        if (!memberIds.has(s.userId)) {
          res.status(400).json({ error: "All split participants must be group members" });
          return;
        }
      }
      const computed = computeFinalSplits(
        newSplitType,
        newTotal,
        parsed.data.splits as SplitInput[],
      );
      if (!computed.ok) {
        res.status(400).json({ error: computed.error });
        return;
      }
      await db.delete(expenseSplitsTable).where(eq(expenseSplitsTable.expenseId, expenseId));
      for (const row of computed.rows) {
        await db.insert(expenseSplitsTable).values({
          expenseId,
          userId: row.userId,
          amount: row.amount,
          percentage: row.percentage,
        });
      }
    }

    const [expense] = await db
      .update(expensesTable)
      .set(updateData)
      .where(eq(expensesTable.id, expenseId))
      .returning();

    res.json(await buildExpenseWithSplits(expense));
  },
);

router.delete(
  "/expenses/:expenseId",
  requireAuth,
  requireExpenseAccess(),
  async (req, res): Promise<void> => {
    const raw = Array.isArray(req.params.expenseId)
      ? req.params.expenseId[0]
      : req.params.expenseId;
    const expenseId = raw;
    await db.delete(expenseSplitsTable).where(eq(expenseSplitsTable.expenseId, expenseId));
    const [expense] = await db
      .delete(expensesTable)
      .where(eq(expensesTable.id, expenseId))
      .returning();
    if (!expense) {
      res.status(404).json({ error: "Expense not found" });
      return;
    }
    res.sendStatus(204);
  },
);

export default router;
