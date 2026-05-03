import { Router, type IRouter } from "express";
import { randomBytes } from "node:crypto";
import { eq, and, inArray, sql, or, isNull, desc } from "drizzle-orm";
import {
  db,
  groupsTable,
  groupMembersTable,
  usersTable,
  expensesTable,
  expenseSplitsTable,
  paymentsTable,
  friendshipsTable,
} from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import {
  requireGroupMember,
  requireGroupMemberByMember,
} from "../middlewares/requireGroupAccess";
import {
  CreateGroupBody,
  UpdateGroupBody,
  AddGroupMemberBody,
  IncludeMemberInPastExpensesBody,
  JoinGroupBody,
} from "@workspace/api-zod";
import { isSupportedCurrency } from "../lib/currencies.js";

const router: IRouter = Router();

// Crockford-ish base32 (no easily confused chars: 0/O, 1/I/L)
const INVITE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateInviteCode(): string {
  const bytes = randomBytes(10);
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += INVITE_ALPHABET[bytes[i] % INVITE_ALPHABET.length];
  }
  return out;
}

async function ensureInviteCode(groupId: string, current: string | null): Promise<string> {
  if (current) return current;
  // Try a few times in the unlikely case of collision.
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateInviteCode();
    try {
      const [updated] = await db
        .update(groupsTable)
        .set({ inviteCode: code })
        .where(and(eq(groupsTable.id, groupId), isNull(groupsTable.inviteCode)))
        .returning();
      if (updated?.inviteCode) return updated.inviteCode;
      // Someone else backfilled in parallel — re-read.
      const [g] = await db.select().from(groupsTable).where(eq(groupsTable.id, groupId));
      if (g?.inviteCode) return g.inviteCode;
    } catch {
      // unique collision — try a new code
    }
  }
  throw new Error("Could not generate invite code");
}

async function getUserById(id: string) {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id));
  return user;
}

async function buildMember(gm: {
  id: string;
  groupId: string;
  userId: string;
  joinedAt: Date;
}) {
  const user = await getUserById(gm.userId);
  return { ...gm, user, joinedAt: gm.joinedAt.toISOString() };
}

async function computeMyNetBalance(groupId: string, userId: string): Promise<number> {
  const expenses = await db
    .select({
      id: expensesTable.id,
      paidByUserId: expensesTable.paidByUserId,
      totalAmount: expensesTable.totalAmount,
    })
    .from(expensesTable)
    .where(and(eq(expensesTable.groupId, groupId), isNull(expensesTable.deletedAt)));

  let net = 0;

  for (const expense of expenses) {
    const splits = await db
      .select()
      .from(expenseSplitsTable)
      .where(eq(expenseSplitsTable.expenseId, expense.id));
    if (expense.paidByUserId === userId) {
      for (const split of splits) {
        if (split.userId !== userId) net += parseFloat(split.amount);
      }
    } else {
      const mySplit = splits.find((s) => s.userId === userId);
      if (mySplit) net -= parseFloat(mySplit.amount);
    }
  }

  const receivedPayments = await db
    .select()
    .from(paymentsTable)
    .where(and(eq(paymentsTable.groupId, groupId), eq(paymentsTable.toUserId, userId), isNull(paymentsTable.deletedAt)));
  const sentPayments = await db
    .select()
    .from(paymentsTable)
    .where(and(eq(paymentsTable.groupId, groupId), eq(paymentsTable.fromUserId, userId), isNull(paymentsTable.deletedAt)));

  for (const p of receivedPayments) net -= parseFloat(p.amount);
  for (const p of sentPayments) net += parseFloat(p.amount);

  return Math.round(net * 100) / 100;
}

router.get("/groups", requireAuth, async (req, res): Promise<void> => {
  const memberships = await db
    .select()
    .from(groupMembersTable)
    .where(and(eq(groupMembersTable.userId, req.dbUserId!), isNull(groupMembersTable.deletedAt)));

  if (memberships.length === 0) {
    res.json([]);
    return;
  }

  const groupIds = memberships.map((m) => m.groupId);
  const groups = await db
    .select()
    .from(groupsTable)
    .where(and(inArray(groupsTable.id, groupIds), isNull(groupsTable.deletedAt)))
    .orderBy(desc(groupsTable.createdAt));

  const result = await Promise.all(
    groups.map(async (group) => {
      const memberCount = await db.$count(
        groupMembersTable,
        and(eq(groupMembersTable.groupId, group.id), isNull(groupMembersTable.deletedAt)),
      );
      const myNetBalance = await computeMyNetBalance(group.id, req.dbUserId!);
      return {
        ...group,
        memberCount,
        myNetBalance,
        createdAt: group.createdAt.toISOString(),
      };
    }),
  );

  res.json(result);
});

router.post("/groups", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateGroupBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const currency = parsed.data.currency ?? "USD";
  if (!(await isSupportedCurrency(currency))) {
    res.status(400).json({ error: "Unsupported currency code" });
    return;
  }

  const [group] = await db
    .insert(groupsTable)
    .values({
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      category: parsed.data.category ?? null,
      currency,
      createdByUserId: req.dbUserId!,
      inviteCode: generateInviteCode(),
    })
    .returning();

  await db.insert(groupMembersTable).values({ groupId: group.id, userId: req.dbUserId! });

  res.status(201).json({ ...group, createdAt: group.createdAt.toISOString() });
});

// Look up a group by invite code (preview before joining). Authenticated.
router.get(
  "/groups/by-invite/:inviteCode",
  requireAuth,
  async (req, res): Promise<void> => {
    const code = String(req.params.inviteCode ?? "").trim().toUpperCase();
    if (!code) {
      res.status(400).json({ error: "Invite code required" });
      return;
    }
    const [group] = await db
      .select()
      .from(groupsTable)
      .where(and(eq(groupsTable.inviteCode, code), isNull(groupsTable.deletedAt)));
    if (!group) {
      res.status(404).json({ error: "Invite not found or expired" });
      return;
    }
    const memberCount = await db.$count(
      groupMembersTable,
      and(eq(groupMembersTable.groupId, group.id), isNull(groupMembersTable.deletedAt)),
    );
    const [existing] = await db
      .select()
      .from(groupMembersTable)
      .where(
        and(
          eq(groupMembersTable.groupId, group.id),
          eq(groupMembersTable.userId, req.dbUserId!),
          isNull(groupMembersTable.deletedAt),
        ),
      );
    res.json({
      id: group.id,
      name: group.name,
      description: group.description,
      category: group.category,
      avatarUrl: group.avatarUrl,
      memberCount,
      alreadyMember: Boolean(existing),
    });
  },
);

// Join a group via its invite code. Authenticated.
router.post("/groups/join", requireAuth, async (req, res): Promise<void> => {
  const parsed = JoinGroupBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const code = parsed.data.inviteCode.trim().toUpperCase();
  const [group] = await db
    .select()
    .from(groupsTable)
    .where(and(eq(groupsTable.inviteCode, code), isNull(groupsTable.deletedAt)));
  if (!group) {
    res.status(404).json({ error: "Invite not found or expired" });
    return;
  }

  const [existing] = await db
    .select()
    .from(groupMembersTable)
    .where(
      and(
        eq(groupMembersTable.groupId, group.id),
        eq(groupMembersTable.userId, req.dbUserId!),
      ),
    );

  if (existing) {
    if (existing.deletedAt !== null) {
      await db
        .update(groupMembersTable)
        .set({ deletedAt: null, joinedAt: new Date() })
        .where(eq(groupMembersTable.id, existing.id));
    }
  } else {
    await db
      .insert(groupMembersTable)
      .values({ groupId: group.id, userId: req.dbUserId! });
  }

  res.status(200).json({ ...group, createdAt: group.createdAt.toISOString() });
});

router.get(
  "/groups/:groupId",
  requireAuth,
  requireGroupMember(),
  async (req, res): Promise<void> => {
    const groupId = req.authorizedGroupId!;
    const [group] = await db
      .select()
      .from(groupsTable)
      .where(and(eq(groupsTable.id, groupId), isNull(groupsTable.deletedAt)));
    if (!group) {
      res.status(404).json({ error: "Group not found" });
      return;
    }
    const memberRows = await db
      .select()
      .from(groupMembersTable)
      .where(and(eq(groupMembersTable.groupId, groupId), isNull(groupMembersTable.deletedAt)));
    const members = await Promise.all(memberRows.map(buildMember));
    const inviteCode = await ensureInviteCode(group.id, group.inviteCode);
    res.json({
      ...group,
      inviteCode,
      createdAt: group.createdAt.toISOString(),
      members,
    });
  },
);

router.put(
  "/groups/:groupId",
  requireAuth,
  requireGroupMember(),
  async (req, res): Promise<void> => {
    const groupId = req.authorizedGroupId!;
    const parsed = UpdateGroupBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const updateData: Record<string, unknown> = {};
    if (parsed.data.name !== undefined) updateData.name = parsed.data.name;
    if (parsed.data.description !== undefined) updateData.description = parsed.data.description;
    if (parsed.data.category !== undefined) updateData.category = parsed.data.category;
    if (parsed.data.avatarUrl !== undefined) updateData.avatarUrl = parsed.data.avatarUrl ?? null;
    if (parsed.data.currency !== undefined && parsed.data.currency) {
      if (!(await isSupportedCurrency(parsed.data.currency))) {
        res.status(400).json({ error: "Unsupported currency code" });
        return;
      }
      updateData.currency = parsed.data.currency;
    }

    const [group] = await db
      .update(groupsTable)
      .set(updateData)
      .where(and(eq(groupsTable.id, groupId), isNull(groupsTable.deletedAt)))
      .returning();

    if (!group) {
      res.status(404).json({ error: "Group not found" });
      return;
    }
    res.json({ ...group, createdAt: group.createdAt.toISOString() });
  },
);

router.delete(
  "/groups/:groupId",
  requireAuth,
  requireGroupMember(),
  async (req, res): Promise<void> => {
    const groupId = req.authorizedGroupId!;
    const [group] = await db
      .select()
      .from(groupsTable)
      .where(and(eq(groupsTable.id, groupId), isNull(groupsTable.deletedAt)));
    if (!group) {
      res.status(404).json({ error: "Group not found" });
      return;
    }
    if (group.createdByUserId !== req.dbUserId) {
      res.status(403).json({ error: "Only the group creator can delete this group" });
      return;
    }
    const now = new Date();
    // Cascade soft-delete: mark group's expenses, payments, and memberships as deleted.
    await db
      .update(expensesTable)
      .set({ deletedAt: now })
      .where(and(eq(expensesTable.groupId, groupId), isNull(expensesTable.deletedAt)));
    await db
      .update(paymentsTable)
      .set({ deletedAt: now })
      .where(and(eq(paymentsTable.groupId, groupId), isNull(paymentsTable.deletedAt)));
    await db
      .update(groupMembersTable)
      .set({ deletedAt: now })
      .where(and(eq(groupMembersTable.groupId, groupId), isNull(groupMembersTable.deletedAt)));
    await db
      .update(groupsTable)
      .set({ deletedAt: now })
      .where(and(eq(groupsTable.id, groupId), isNull(groupsTable.deletedAt)));
    res.sendStatus(204);
  },
);

router.post(
  "/groups/:groupId/members",
  requireAuth,
  requireGroupMember(),
  async (req, res): Promise<void> => {
    const groupId = req.authorizedGroupId!;
    const parsed = AddGroupMemberBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    let targetUser;
    if ("userId" in parsed.data) {
      [targetUser] = await db.select().from(usersTable).where(eq(usersTable.id, parsed.data.userId));
    } else {
      const email = parsed.data.email.trim();
      [targetUser] = await db.select().from(usersTable).where(sql`lower(${usersTable.email}) = lower(${email})`);
    }

    if (!targetUser) {
      res.status(404).json({ error: "No account found. Ask them to sign up first." });
      return;
    }

    const [existing] = await db
      .select()
      .from(groupMembersTable)
      .where(
        and(
          eq(groupMembersTable.groupId, groupId),
          eq(groupMembersTable.userId, targetUser.id),
        ),
      );

    if (existing) {
      // If previously soft-deleted, re-enable; else reject as already a member.
      if (existing.deletedAt !== null) {
        const [member] = await db
          .update(groupMembersTable)
          .set({ deletedAt: null, joinedAt: new Date() })
          .where(eq(groupMembersTable.id, existing.id))
          .returning();
        res.status(201).json({
          ...member,
          user: { ...targetUser, createdAt: targetUser.createdAt.toISOString() },
          joinedAt: member.joinedAt.toISOString(),
        });
        return;
      }
      res.status(400).json({ error: "User is already a member" });
      return;
    }

    const [member] = await db
      .insert(groupMembersTable)
      .values({ groupId, userId: targetUser.id })
      .returning();

    // Auto-create friendship if not already friends
    const currentUserId = req.dbUserId!;
    if (currentUserId !== targetUser.id) {
      const [existingFriendship] = await db
        .select()
        .from(friendshipsTable)
        .where(
          and(
            isNull(friendshipsTable.deletedAt),
            or(
              and(eq(friendshipsTable.userId, currentUserId), eq(friendshipsTable.friendId, targetUser.id)),
              and(eq(friendshipsTable.userId, targetUser.id), eq(friendshipsTable.friendId, currentUserId)),
            )!,
          ),
        );
      if (!existingFriendship) {
        await db
          .insert(friendshipsTable)
          .values({ userId: currentUserId, friendId: targetUser.id })
          .onConflictDoUpdate({
            target: [friendshipsTable.userId, friendshipsTable.friendId],
            set: { deletedAt: null },
          });
      }
    }

    res.status(201).json({
      ...member,
      user: { ...targetUser, createdAt: targetUser.createdAt.toISOString() },
      joinedAt: member.joinedAt.toISOString(),
    });
  },
);

router.post(
  "/groups/:groupId/expenses/include-member",
  requireAuth,
  requireGroupMember(),
  async (req, res): Promise<void> => {
    const groupId = req.authorizedGroupId!;
    const parsed = IncludeMemberInPastExpensesBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const targetUserId = parsed.data.userId;

    // Verify target user is a current member of this group
    const [targetMember] = await db
      .select()
      .from(groupMembersTable)
      .where(
        and(
          eq(groupMembersTable.groupId, groupId),
          eq(groupMembersTable.userId, targetUserId),
          isNull(groupMembersTable.deletedAt),
        ),
      );
    if (!targetMember) {
      res.status(404).json({ error: "User is not a member of this group" });
      return;
    }

    let updatedCount = 0;
    let skippedNonEqualCount = 0;
    let totalCount = 0;

    await db.transaction(async (tx) => {
      // Select expenses inside the transaction so concurrent inserts don't
      // create a race window between SELECT and re-split.
      const expenses = await tx
        .select()
        .from(expensesTable)
        .where(and(eq(expensesTable.groupId, groupId), isNull(expensesTable.deletedAt)));
      totalCount = expenses.length;

      for (const expense of expenses) {
        if (expense.splitType !== "equal") {
          skippedNonEqualCount++;
          continue;
        }
        const splits = await tx
          .select()
          .from(expenseSplitsTable)
          .where(eq(expenseSplitsTable.expenseId, expense.id));

        // Already included — nothing to do
        if (splits.some((s) => s.userId === targetUserId)) continue;

        const newUserIds = [...splits.map((s) => s.userId), targetUserId];
        const totalCents = Math.round(parseFloat(expense.totalAmount) * 100);
        const baseCents = Math.floor(totalCents / newUserIds.length);
        let remainder = totalCents - baseCents * newUserIds.length;
        const newRows = newUserIds.map((uid) => {
          const cents = baseCents + (remainder > 0 ? 1 : 0);
          if (remainder > 0) remainder -= 1;
          return {
            expenseId: expense.id,
            userId: uid,
            amount: (cents / 100).toFixed(2),
            percentage: null,
          };
        });

        await tx
          .delete(expenseSplitsTable)
          .where(eq(expenseSplitsTable.expenseId, expense.id));
        await tx.insert(expenseSplitsTable).values(newRows);
        updatedCount++;
      }
    });

    res.status(200).json({
      updatedCount,
      skippedNonEqualCount,
      totalCount,
    });
  },
);

router.delete(
  "/groups/:groupId/members/:memberId",
  requireAuth,
  requireGroupMemberByMember(),
  async (req, res): Promise<void> => {
    const memberIdRaw = Array.isArray(req.params.memberId)
      ? req.params.memberId[0]
      : req.params.memberId;
    const memberId = memberIdRaw;
    const [member] = await db
      .update(groupMembersTable)
      .set({ deletedAt: new Date() })
      .where(and(eq(groupMembersTable.id, memberId), isNull(groupMembersTable.deletedAt)))
      .returning();
    if (!member) {
      res.status(404).json({ error: "Member not found" });
      return;
    }
    res.sendStatus(204);
  },
);

router.get(
  "/groups/:groupId/balances",
  requireAuth,
  requireGroupMember(),
  async (req, res): Promise<void> => {
    const groupId = req.authorizedGroupId!;
    const memberRows = await db
      .select()
      .from(groupMembersTable)
      .where(and(eq(groupMembersTable.groupId, groupId), isNull(groupMembersTable.deletedAt)));
    if (memberRows.length === 0) {
      res.json([]);
      return;
    }

    const userIds = memberRows.map((m) => m.userId);
    const users = await db.select().from(usersTable).where(inArray(usersTable.id, userIds));
    const userMap = new Map(users.map((u) => [u.id, u]));

    const net = new Map<string, number>();
    for (const id of userIds) net.set(id, 0);

    const expenses = await db
      .select()
      .from(expensesTable)
      .where(and(eq(expensesTable.groupId, groupId), isNull(expensesTable.deletedAt)));
    for (const expense of expenses) {
      const splits = await db
        .select()
        .from(expenseSplitsTable)
        .where(eq(expenseSplitsTable.expenseId, expense.id));
      for (const split of splits) {
        if (split.userId === expense.paidByUserId) continue;
        const amount = parseFloat(split.amount);
        net.set(split.userId, (net.get(split.userId) ?? 0) - amount);
        net.set(expense.paidByUserId, (net.get(expense.paidByUserId) ?? 0) + amount);
      }
    }

    const payments = await db
      .select()
      .from(paymentsTable)
      .where(and(eq(paymentsTable.groupId, groupId), isNull(paymentsTable.deletedAt)));
    for (const payment of payments) {
      const amount = parseFloat(payment.amount);
      net.set(payment.fromUserId, (net.get(payment.fromUserId) ?? 0) + amount);
      net.set(payment.toUserId, (net.get(payment.toUserId) ?? 0) - amount);
    }

    const balances: Array<{
      fromUserId: string;
      fromUser: unknown;
      toUserId: string;
      toUser: unknown;
      amount: number;
    }> = [];

    const creditors = [...net.entries()]
      .filter(([, v]) => v > 0.005)
      .sort((a, b) => b[1] - a[1]);
    const debtors = [...net.entries()]
      .filter(([, v]) => v < -0.005)
      .sort((a, b) => a[1] - b[1]);

    let ci = 0;
    let di = 0;
    while (ci < creditors.length && di < debtors.length) {
      const [creditorId, credit] = creditors[ci];
      const [debtorId, debtNeg] = debtors[di];
      const debt = Math.abs(debtNeg);
      const amount = Math.min(credit, debt);

      if (amount > 0.005) {
        const fu = userMap.get(debtorId)!;
        const tu = userMap.get(creditorId)!;
        balances.push({
          fromUserId: debtorId,
          fromUser: { ...fu, createdAt: fu.createdAt.toISOString() },
          toUserId: creditorId,
          toUser: { ...tu, createdAt: tu.createdAt.toISOString() },
          amount: Math.round(amount * 100) / 100,
        });
      }

      creditors[ci] = [creditorId, credit - amount];
      debtors[di] = [debtorId, -(debt - amount)];
      if (creditors[ci][1] < 0.005) ci++;
      if (Math.abs(debtors[di][1]) < 0.005) di++;
    }

    res.json(balances);
  },
);

export default router;
