import { Router, type IRouter } from "express";
import { eq, desc, inArray, and, or, isNull } from "drizzle-orm";
import {
  db,
  expensesTable,
  expenseSplitsTable,
  expenseCommentsTable,
  usersTable,
  groupMembersTable,
  friendshipsTable,
  paymentsTable,
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
    .where(and(eq(groupMembersTable.groupId, groupId), isNull(groupMembersTable.deletedAt)));
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
      and(
        isNull(friendshipsTable.deletedAt),
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
      ),
    );
  if (direct) return true;

  // Shared group?
  const aGroups = await db
    .select({ groupId: groupMembersTable.groupId })
    .from(groupMembersTable)
    .where(and(eq(groupMembersTable.userId, userA), isNull(groupMembersTable.deletedAt)));
  if (aGroups.length === 0) return false;
  const aGroupIds = aGroups.map((g) => g.groupId);
  const [sharedRow] = await db
    .select({ id: groupMembersTable.id })
    .from(groupMembersTable)
    .where(
      and(
        eq(groupMembersTable.userId, userB),
        isNull(groupMembersTable.deletedAt),
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
        and(
          isNull(expensesTable.groupId),
          isNull(expensesTable.deletedAt),
          eq(expensesTable.paidByUserId, me),
        ),
      );

    const asSplit = await db
      .select({ expenseId: expenseSplitsTable.expenseId })
      .from(expenseSplitsTable)
      .innerJoin(expensesTable, eq(expensesTable.id, expenseSplitsTable.expenseId))
      .where(
        and(
          isNull(expensesTable.groupId),
          isNull(expensesTable.deletedAt),
          eq(expenseSplitsTable.userId, me),
        ),
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
      .where(and(inArray(expensesTable.id, expenseIds), isNull(expensesTable.deletedAt)))
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

    // Per-friend net for non-group activity. Positive = friend owes me.
    const friendNets = new Map<string, number>();
    const bump = (friendId: string, delta: number) => {
      friendNets.set(friendId, (friendNets.get(friendId) ?? 0) + delta);
    };

    let myNet = 0;
    for (const e of expenses) {
      const splits = splitsByExpense.get(e.id) ?? [];
      if (e.paidByUserId === me) {
        for (const s of splits) {
          if (s.userId !== me) {
            const v = parseFloat(s.amount);
            myNet += v;
            bump(s.userId, v);
          }
        }
      } else {
        const mine = splits.find((s) => s.userId === me);
        if (mine) {
          const v = parseFloat(mine.amount);
          myNet -= v;
          bump(e.paidByUserId, -v);
        }
      }
    }

    // Fold non-group payments into the per-friend net AND aggregate net.
    const nonGroupPayments = await db
      .select()
      .from(paymentsTable)
      .where(
        and(
          isNull(paymentsTable.groupId),
          isNull(paymentsTable.deletedAt),
          or(
            eq(paymentsTable.fromUserId, me),
            eq(paymentsTable.toUserId, me),
          ),
        ),
      );
    for (const p of nonGroupPayments) {
      const amt = parseFloat(p.amount);
      if (p.fromUserId === me) {
        // I paid friend → reduces what I owe → my net goes up.
        myNet += amt;
        bump(p.toUserId, amt);
      } else {
        // Friend paid me → reduces what friend owes me → my net goes down.
        myNet -= amt;
        bump(p.fromUserId, -amt);
      }
    }

    const built = await Promise.all(expenses.map(buildExpenseWithSplits));
    const friendNetsObj: Record<string, number> = {};
    for (const [k, v] of friendNets) {
      friendNetsObj[k] = Math.round(v * 100) / 100;
    }

    res.json({
      myNetBalance: Math.round(myNet * 100) / 100,
      count: built.length,
      expenses: built,
      friendNets: friendNetsObj,
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
      .where(and(eq(expensesTable.groupId, groupId), isNull(expensesTable.deletedAt)))
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
      .where(and(eq(expensesTable.id, expenseId), isNull(expensesTable.deletedAt)));
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
      .where(and(eq(expensesTable.id, expenseId), isNull(expensesTable.deletedAt)));
    if (!current) {
      res.status(404).json({ error: "Expense not found" });
      return;
    }

    // For group expenses, allowed participants are group members.
    // For non-group (friend) expenses, allowed participants are the existing
    // split user IDs (the original payer + friend(s)).
    let memberIds: Set<string>;
    if (current.groupId !== null) {
      memberIds = await getMemberIds(current.groupId);
    } else {
      const existingSplits = await db
        .select({ userId: expenseSplitsTable.userId })
        .from(expenseSplitsTable)
        .where(eq(expenseSplitsTable.expenseId, expenseId));
      memberIds = new Set(existingSplits.map((s) => s.userId));
      memberIds.add(current.paidByUserId);
    }

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
      res.status(400).json({
        error:
          current.groupId !== null
            ? "Payer must be a group member"
            : "Payer must be one of the original participants",
      });
      return;
    }

    const updateData: Record<string, unknown> = {};
    if (parsed.data.description !== undefined) updateData.description = parsed.data.description;
    if (parsed.data.category !== undefined) updateData.category = parsed.data.category;
    if (parsed.data.totalAmount !== undefined)
      updateData.totalAmount = parsed.data.totalAmount.toFixed(2);
    if (parsed.data.currency !== undefined) updateData.currency = parsed.data.currency;
    if (parsed.data.splitType !== undefined) updateData.splitType = parsed.data.splitType;
    if (parsed.data.paidByUserId !== undefined) updateData.paidByUserId = parsed.data.paidByUserId;
    if (parsed.data.date !== undefined) updateData.date = toDateString(String(parsed.data.date));
    if (parsed.data.photoUrl !== undefined) updateData.photoUrl = parsed.data.photoUrl;

    if (parsed.data.splits) {
      for (const s of parsed.data.splits) {
        if (!memberIds.has(s.userId)) {
          res.status(400).json({
            error:
              current.groupId !== null
                ? "All split participants must be group members"
                : "All split participants must be among the original participants",
          });
          return;
        }
      }
      const splitUserIds = new Set(parsed.data.splits.map((s) => s.userId));
      if (!splitUserIds.has(newPaidBy)) {
        res
          .status(400)
          .json({ error: "Payer must be included in the split participants" });
        return;
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
      .where(and(eq(expensesTable.id, expenseId), isNull(expensesTable.deletedAt)))
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
    const [expense] = await db
      .update(expensesTable)
      .set({ deletedAt: new Date() })
      .where(and(eq(expensesTable.id, expenseId), isNull(expensesTable.deletedAt)))
      .returning();
    if (!expense) {
      res.status(404).json({ error: "Expense not found" });
      return;
    }
    res.sendStatus(204);
  },
);

// ─── Comments on an expense ────────────────────────────────────────────────
router.get(
  "/expenses/:expenseId/comments",
  requireAuth,
  requireExpenseAccess(),
  async (req, res): Promise<void> => {
    const raw = Array.isArray(req.params.expenseId)
      ? req.params.expenseId[0]
      : req.params.expenseId;
    const expenseId = raw;
    const rows = await db
      .select({
        id: expenseCommentsTable.id,
        expenseId: expenseCommentsTable.expenseId,
        userId: expenseCommentsTable.userId,
        body: expenseCommentsTable.body,
        createdAt: expenseCommentsTable.createdAt,
        userName: usersTable.name,
        userEmail: usersTable.email,
        userAvatarUrl: usersTable.avatarUrl,
      })
      .from(expenseCommentsTable)
      .innerJoin(usersTable, eq(usersTable.id, expenseCommentsTable.userId))
      .where(
        and(
          eq(expenseCommentsTable.expenseId, expenseId),
          isNull(expenseCommentsTable.deletedAt),
        ),
      )
      .orderBy(expenseCommentsTable.createdAt);
    res.json(
      rows.map((r) => ({
        id: r.id,
        expenseId: r.expenseId,
        userId: r.userId,
        user: {
          id: r.userId,
          name: r.userName,
          email: r.userEmail,
          avatarUrl: r.userAvatarUrl,
        },
        body: r.body,
        createdAt: r.createdAt,
      })),
    );
  },
);

router.post(
  "/expenses/:expenseId/comments",
  requireAuth,
  requireExpenseAccess(),
  async (req, res): Promise<void> => {
    const userId = req.dbUserId;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const raw = Array.isArray(req.params.expenseId)
      ? req.params.expenseId[0]
      : req.params.expenseId;
    const expenseId = raw;
    const body =
      typeof req.body?.body === "string" ? req.body.body.trim() : "";
    if (!body) {
      res.status(400).json({ error: "Comment body required" });
      return;
    }
    if (body.length > 2000) {
      res.status(400).json({ error: "Comment too long (max 2000 chars)" });
      return;
    }
    const [inserted] = await db
      .insert(expenseCommentsTable)
      .values({ expenseId, userId, body })
      .returning();
    const author = await getUserById(userId);
    res.status(201).json({
      id: inserted.id,
      expenseId: inserted.expenseId,
      userId: inserted.userId,
      user: author
        ? {
            id: author.id,
            name: author.name,
            email: author.email,
            avatarUrl: author.avatarUrl,
          }
        : null,
      body: inserted.body,
      createdAt: inserted.createdAt,
    });
  },
);

router.delete(
  "/expenses/:expenseId/comments/:commentId",
  requireAuth,
  requireExpenseAccess(),
  async (req, res): Promise<void> => {
    const userId = req.dbUserId;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const expenseId = Array.isArray(req.params.expenseId)
      ? req.params.expenseId[0]
      : req.params.expenseId;
    const commentId = Array.isArray(req.params.commentId)
      ? req.params.commentId[0]
      : req.params.commentId;
    const UUID_RE =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!commentId || !UUID_RE.test(commentId)) {
      res.status(400).json({ error: "Invalid comment id" });
      return;
    }
    const [comment] = await db
      .select()
      .from(expenseCommentsTable)
      .where(
        and(
          eq(expenseCommentsTable.id, commentId),
          eq(expenseCommentsTable.expenseId, expenseId),
          isNull(expenseCommentsTable.deletedAt),
        ),
      );
    if (!comment) {
      res.status(404).json({ error: "Comment not found" });
      return;
    }
    if (comment.userId !== userId) {
      res.status(403).json({ error: "You can only delete your own comments" });
      return;
    }
    await db
      .update(expenseCommentsTable)
      .set({ deletedAt: new Date() })
      .where(eq(expenseCommentsTable.id, commentId));
    res.sendStatus(204);
  },
);

export default router;
