import { Router, type IRouter } from "express";
import { eq, and, sql, inArray } from "drizzle-orm";
import { db, groupsTable, groupMembersTable, usersTable, expensesTable, expenseSplitsTable, paymentsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import {
  CreateGroupBody,
  UpdateGroupBody,
  AddGroupMemberBody,
  GetGroupParams,
  UpdateGroupParams,
  DeleteGroupParams,
  AddGroupMemberParams,
  RemoveGroupMemberParams,
  GetGroupBalancesParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

// Helper: fetch full user object
async function getUserById(id: number) {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id));
  return user;
}

// Helper: build a group member with nested user
async function buildMember(gm: { id: number; groupId: number; userId: number; joinedAt: Date }) {
  const user = await getUserById(gm.userId);
  return { ...gm, user, joinedAt: gm.joinedAt.toISOString() };
}

// Helper: compute net balance for a user in a group
async function computeMyNetBalance(groupId: number, userId: number): Promise<number> {
  // Amount I paid that others owe me
  const expenses = await db.select({
    id: expensesTable.id,
    paidByUserId: expensesTable.paidByUserId,
    totalAmount: expensesTable.totalAmount,
  }).from(expensesTable).where(eq(expensesTable.groupId, groupId));

  let totalOwedToMe = 0;
  let totalIOwe = 0;

  for (const expense of expenses) {
    const splits = await db.select().from(expenseSplitsTable).where(eq(expenseSplitsTable.expenseId, expense.id));
    if (expense.paidByUserId === userId) {
      // I paid — others owe me their split
      for (const split of splits) {
        if (split.userId !== userId) {
          totalOwedToMe += parseFloat(split.amount);
        }
      }
    } else {
      // Someone else paid — I owe my split
      const mySplit = splits.find(s => s.userId === userId);
      if (mySplit) {
        totalIOwe += parseFloat(mySplit.amount);
      }
    }
  }

  // Payments: money I received or sent
  const receivedPayments = await db.select().from(paymentsTable)
    .where(and(eq(paymentsTable.groupId, groupId), eq(paymentsTable.toUserId, userId)));
  const sentPayments = await db.select().from(paymentsTable)
    .where(and(eq(paymentsTable.groupId, groupId), eq(paymentsTable.fromUserId, userId)));

  for (const p of receivedPayments) totalOwedToMe -= parseFloat(p.amount); // payment reduced what's owed to me
  for (const p of sentPayments) totalIOwe -= parseFloat(p.amount); // payment reduced what I owe

  return totalOwedToMe - totalIOwe;
}

// GET /groups
router.get("/groups", requireAuth, async (req, res): Promise<void> => {
  const memberships = await db.select()
    .from(groupMembersTable)
    .where(eq(groupMembersTable.userId, req.dbUserId!));

  if (memberships.length === 0) {
    res.json([]);
    return;
  }

  const groupIds = memberships.map(m => m.groupId);
  const groups = await db.select().from(groupsTable).where(inArray(groupsTable.id, groupIds));

  const result = await Promise.all(groups.map(async (group) => {
    const memberCount = await db.$count(groupMembersTable, eq(groupMembersTable.groupId, group.id));
    const myNetBalance = await computeMyNetBalance(group.id, req.dbUserId!);
    return {
      ...group,
      memberCount,
      myNetBalance,
      createdAt: group.createdAt.toISOString(),
    };
  }));

  res.json(result);
});

// POST /groups
router.post("/groups", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateGroupBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [group] = await db.insert(groupsTable).values({
    name: parsed.data.name,
    description: parsed.data.description ?? null,
    category: parsed.data.category ?? null,
    createdByUserId: req.dbUserId!,
  }).returning();

  // Auto-add creator as member
  await db.insert(groupMembersTable).values({ groupId: group.id, userId: req.dbUserId! });

  res.status(201).json({ ...group, createdAt: group.createdAt.toISOString() });
});

// GET /groups/:groupId
router.get("/groups/:groupId", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.groupId) ? req.params.groupId[0] : req.params.groupId;
  const groupId = parseInt(raw, 10);

  const [group] = await db.select().from(groupsTable).where(eq(groupsTable.id, groupId));
  if (!group) {
    res.status(404).json({ error: "Group not found" });
    return;
  }

  const memberRows = await db.select().from(groupMembersTable).where(eq(groupMembersTable.groupId, groupId));
  const members = await Promise.all(memberRows.map(buildMember));

  res.json({
    ...group,
    createdAt: group.createdAt.toISOString(),
    members,
  });
});

// PUT /groups/:groupId
router.put("/groups/:groupId", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.groupId) ? req.params.groupId[0] : req.params.groupId;
  const groupId = parseInt(raw, 10);

  const parsed = UpdateGroupBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updateData: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) updateData.name = parsed.data.name;
  if (parsed.data.description !== undefined) updateData.description = parsed.data.description;
  if (parsed.data.category !== undefined) updateData.category = parsed.data.category;

  const [group] = await db.update(groupsTable)
    .set(updateData)
    .where(eq(groupsTable.id, groupId))
    .returning();

  if (!group) {
    res.status(404).json({ error: "Group not found" });
    return;
  }

  res.json({ ...group, createdAt: group.createdAt.toISOString() });
});

// DELETE /groups/:groupId
router.delete("/groups/:groupId", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.groupId) ? req.params.groupId[0] : req.params.groupId;
  const groupId = parseInt(raw, 10);

  const [group] = await db.delete(groupsTable).where(eq(groupsTable.id, groupId)).returning();
  if (!group) {
    res.status(404).json({ error: "Group not found" });
    return;
  }

  res.sendStatus(204);
});

// POST /groups/:groupId/members
router.post("/groups/:groupId/members", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.groupId) ? req.params.groupId[0] : req.params.groupId;
  const groupId = parseInt(raw, 10);

  const parsed = AddGroupMemberBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [targetUser] = await db.select().from(usersTable).where(eq(usersTable.email, parsed.data.email));
  if (!targetUser) {
    // Create a placeholder user for invite-by-email
    const [newUser] = await db.insert(usersTable).values({
      clerkId: `invite_${Date.now()}_${parsed.data.email}`,
      name: parsed.data.email.split("@")[0],
      email: parsed.data.email,
    }).returning();

    const [member] = await db.insert(groupMembersTable)
      .values({ groupId, userId: newUser.id })
      .returning();

    res.status(201).json({ ...member, user: { ...newUser, createdAt: newUser.createdAt.toISOString() }, joinedAt: member.joinedAt.toISOString() });
    return;
  }

  const [existing] = await db.select().from(groupMembersTable)
    .where(and(eq(groupMembersTable.groupId, groupId), eq(groupMembersTable.userId, targetUser.id)));

  if (existing) {
    res.status(400).json({ error: "User is already a member" });
    return;
  }

  const [member] = await db.insert(groupMembersTable)
    .values({ groupId, userId: targetUser.id })
    .returning();

  res.status(201).json({
    ...member,
    user: { ...targetUser, createdAt: targetUser.createdAt.toISOString() },
    joinedAt: member.joinedAt.toISOString(),
  });
});

// DELETE /groups/:groupId/members/:memberId
router.delete("/groups/:groupId/members/:memberId", requireAuth, async (req, res): Promise<void> => {
  const rawMemberId = Array.isArray(req.params.memberId) ? req.params.memberId[0] : req.params.memberId;
  const memberId = parseInt(rawMemberId, 10);

  const [member] = await db.delete(groupMembersTable).where(eq(groupMembersTable.id, memberId)).returning();
  if (!member) {
    res.status(404).json({ error: "Member not found" });
    return;
  }

  res.sendStatus(204);
});

// GET /groups/:groupId/balances
router.get("/groups/:groupId/balances", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.groupId) ? req.params.groupId[0] : req.params.groupId;
  const groupId = parseInt(raw, 10);

  // Get all members
  const memberRows = await db.select().from(groupMembersTable).where(eq(groupMembersTable.groupId, groupId));
  if (memberRows.length === 0) {
    res.json([]);
    return;
  }

  const userIds = memberRows.map(m => m.userId);
  const users = await db.select().from(usersTable).where(inArray(usersTable.id, userIds));
  const userMap = new Map(users.map(u => [u.id, u]));

  // Build net balance matrix: netOwed[from][to] = amount from owes to
  const netOwed: Map<string, number> = new Map();

  const expenses = await db.select().from(expensesTable).where(eq(expensesTable.groupId, groupId));
  for (const expense of expenses) {
    const splits = await db.select().from(expenseSplitsTable).where(eq(expenseSplitsTable.expenseId, expense.id));
    for (const split of splits) {
      if (split.userId === expense.paidByUserId) continue;
      const key = `${split.userId}:${expense.paidByUserId}`;
      netOwed.set(key, (netOwed.get(key) ?? 0) + parseFloat(split.amount));
    }
  }

  // Apply payments
  const payments = await db.select().from(paymentsTable).where(eq(paymentsTable.groupId, groupId));
  for (const payment of payments) {
    // fromUser paid toUser — reduces debt of from -> to
    const key = `${payment.fromUserId}:${payment.toUserId}`;
    const reverseKey = `${payment.toUserId}:${payment.fromUserId}`;
    const amount = parseFloat(payment.amount);
    const currentDebt = netOwed.get(key) ?? 0;
    if (currentDebt >= amount) {
      netOwed.set(key, currentDebt - amount);
    } else {
      netOwed.set(key, 0);
      const remaining = amount - currentDebt;
      netOwed.set(reverseKey, (netOwed.get(reverseKey) ?? 0) - remaining);
    }
  }

  // Simplified debt algorithm
  const balances: Array<{fromUserId: number; fromUser: unknown; toUserId: number; toUser: unknown; amount: number}> = [];

  // Build net amounts per person (+means owed to them, -means they owe)
  const net = new Map<number, number>();
  for (const id of userIds) net.set(id, 0);

  for (const [key, amount] of netOwed) {
    if (amount <= 0.005) continue;
    const [fromId, toId] = key.split(":").map(Number);
    net.set(fromId, (net.get(fromId) ?? 0) - amount);
    net.set(toId, (net.get(toId) ?? 0) + amount);
  }

  const creditors = [...net.entries()].filter(([, v]) => v > 0.005).sort((a, b) => b[1] - a[1]);
  const debtors = [...net.entries()].filter(([, v]) => v < -0.005).sort((a, b) => a[1] - b[1]);

  let ci = 0, di = 0;
  while (ci < creditors.length && di < debtors.length) {
    const [creditorId, credit] = creditors[ci];
    const [debtorId, debtNeg] = debtors[di];
    const debt = Math.abs(debtNeg);
    const amount = Math.min(credit, debt);

    if (amount > 0.005) {
      balances.push({
        fromUserId: debtorId,
        fromUser: { ...userMap.get(debtorId)!, createdAt: userMap.get(debtorId)!.createdAt.toISOString() },
        toUserId: creditorId,
        toUser: { ...userMap.get(creditorId)!, createdAt: userMap.get(creditorId)!.createdAt.toISOString() },
        amount: Math.round(amount * 100) / 100,
      });
    }

    creditors[ci] = [creditorId, credit - amount];
    debtors[di] = [debtorId, -(debt - amount)];
    if (creditors[ci][1] < 0.005) ci++;
    if (Math.abs(debtors[di][1]) < 0.005) di++;
  }

  res.json(balances);
});

export default router;
