import { Router, type IRouter } from "express";
import { eq, and, inArray, sql, or } from "drizzle-orm";
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
} from "@workspace/api-zod";

const router: IRouter = Router();

async function getUserById(id: number) {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id));
  return user;
}

async function buildMember(gm: {
  id: number;
  groupId: number;
  userId: number;
  joinedAt: Date;
}) {
  const user = await getUserById(gm.userId);
  return { ...gm, user, joinedAt: gm.joinedAt.toISOString() };
}

async function computeMyNetBalance(groupId: number, userId: number): Promise<number> {
  const expenses = await db
    .select({
      id: expensesTable.id,
      paidByUserId: expensesTable.paidByUserId,
      totalAmount: expensesTable.totalAmount,
    })
    .from(expensesTable)
    .where(eq(expensesTable.groupId, groupId));

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
    .where(and(eq(paymentsTable.groupId, groupId), eq(paymentsTable.toUserId, userId)));
  const sentPayments = await db
    .select()
    .from(paymentsTable)
    .where(and(eq(paymentsTable.groupId, groupId), eq(paymentsTable.fromUserId, userId)));

  for (const p of receivedPayments) net -= parseFloat(p.amount);
  for (const p of sentPayments) net += parseFloat(p.amount);

  return Math.round(net * 100) / 100;
}

router.get("/groups", requireAuth, async (req, res): Promise<void> => {
  const memberships = await db
    .select()
    .from(groupMembersTable)
    .where(eq(groupMembersTable.userId, req.dbUserId!));

  if (memberships.length === 0) {
    res.json([]);
    return;
  }

  const groupIds = memberships.map((m) => m.groupId);
  const groups = await db.select().from(groupsTable).where(inArray(groupsTable.id, groupIds));

  const result = await Promise.all(
    groups.map(async (group) => {
      const memberCount = await db.$count(
        groupMembersTable,
        eq(groupMembersTable.groupId, group.id),
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

  const [group] = await db
    .insert(groupsTable)
    .values({
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      category: parsed.data.category ?? null,
      createdByUserId: req.dbUserId!,
    })
    .returning();

  await db.insert(groupMembersTable).values({ groupId: group.id, userId: req.dbUserId! });

  res.status(201).json({ ...group, createdAt: group.createdAt.toISOString() });
});

router.get(
  "/groups/:groupId",
  requireAuth,
  requireGroupMember(),
  async (req, res): Promise<void> => {
    const groupId = req.authorizedGroupId!;
    const [group] = await db.select().from(groupsTable).where(eq(groupsTable.id, groupId));
    if (!group) {
      res.status(404).json({ error: "Group not found" });
      return;
    }
    const memberRows = await db
      .select()
      .from(groupMembersTable)
      .where(eq(groupMembersTable.groupId, groupId));
    const members = await Promise.all(memberRows.map(buildMember));
    res.json({ ...group, createdAt: group.createdAt.toISOString(), members });
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

    const [group] = await db
      .update(groupsTable)
      .set(updateData)
      .where(eq(groupsTable.id, groupId))
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
    const [group] = await db.select().from(groupsTable).where(eq(groupsTable.id, groupId));
    if (!group) {
      res.status(404).json({ error: "Group not found" });
      return;
    }
    if (group.createdByUserId !== req.dbUserId) {
      res.status(403).json({ error: "Only the group creator can delete this group" });
      return;
    }
    await db.delete(expenseSplitsTable).where(
      inArray(
        expenseSplitsTable.expenseId,
        db
          .select({ id: expensesTable.id })
          .from(expensesTable)
          .where(eq(expensesTable.groupId, groupId)),
      ),
    );
    await db.delete(expensesTable).where(eq(expensesTable.groupId, groupId));
    await db.delete(paymentsTable).where(eq(paymentsTable.groupId, groupId));
    await db.delete(groupsTable).where(eq(groupsTable.id, groupId));
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
          or(
            and(eq(friendshipsTable.userId, currentUserId), eq(friendshipsTable.friendId, targetUser.id)),
            and(eq(friendshipsTable.userId, targetUser.id), eq(friendshipsTable.friendId, currentUserId)),
          )!,
        );
      if (!existingFriendship) {
        await db.insert(friendshipsTable).values({ userId: currentUserId, friendId: targetUser.id }).onConflictDoNothing();
      }
    }

    res.status(201).json({
      ...member,
      user: { ...targetUser, createdAt: targetUser.createdAt.toISOString() },
      joinedAt: member.joinedAt.toISOString(),
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
    const memberId = parseInt(memberIdRaw, 10);
    const [member] = await db
      .delete(groupMembersTable)
      .where(eq(groupMembersTable.id, memberId))
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
      .where(eq(groupMembersTable.groupId, groupId));
    if (memberRows.length === 0) {
      res.json([]);
      return;
    }

    const userIds = memberRows.map((m) => m.userId);
    const users = await db.select().from(usersTable).where(inArray(usersTable.id, userIds));
    const userMap = new Map(users.map((u) => [u.id, u]));

    const net = new Map<number, number>();
    for (const id of userIds) net.set(id, 0);

    const expenses = await db
      .select()
      .from(expensesTable)
      .where(eq(expensesTable.groupId, groupId));
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
      .where(eq(paymentsTable.groupId, groupId));
    for (const payment of payments) {
      const amount = parseFloat(payment.amount);
      net.set(payment.fromUserId, (net.get(payment.fromUserId) ?? 0) + amount);
      net.set(payment.toUserId, (net.get(payment.toUserId) ?? 0) - amount);
    }

    const balances: Array<{
      fromUserId: number;
      fromUser: unknown;
      toUserId: number;
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
