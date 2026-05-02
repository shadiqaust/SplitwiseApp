import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import {
  db,
  paymentsTable,
  usersTable,
  groupMembersTable,
} from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import {
  requireGroupMember,
  requirePaymentAccess,
} from "../middlewares/requireGroupAccess";
import { CreatePaymentBody } from "@workspace/api-zod";

const router: IRouter = Router();

async function getUserById(id: string) {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id));
  return user;
}

async function buildPayment(payment: typeof paymentsTable.$inferSelect) {
  const fromUser = await getUserById(payment.fromUserId);
  const toUser = await getUserById(payment.toUserId);
  return {
    ...payment,
    createdAt: payment.createdAt.toISOString(),
    amount: parseFloat(payment.amount),
    fromUser: { ...fromUser, createdAt: fromUser.createdAt.toISOString() },
    toUser: { ...toUser, createdAt: toUser.createdAt.toISOString() },
  };
}

async function getMemberIds(groupId: string): Promise<Set<string>> {
  const rows = await db
    .select({ userId: groupMembersTable.userId })
    .from(groupMembersTable)
    .where(eq(groupMembersTable.groupId, groupId));
  return new Set(rows.map((r) => r.userId));
}

router.get(
  "/groups/:groupId/payments",
  requireAuth,
  requireGroupMember(),
  async (req, res): Promise<void> => {
    const groupId = req.authorizedGroupId!;
    const payments = await db
      .select()
      .from(paymentsTable)
      .where(eq(paymentsTable.groupId, groupId))
      .orderBy(desc(paymentsTable.date), desc(paymentsTable.createdAt));
    const result = await Promise.all(payments.map(buildPayment));
    res.json(result);
  },
);

router.post(
  "/groups/:groupId/payments",
  requireAuth,
  requireGroupMember(),
  async (req, res): Promise<void> => {
    const groupId = req.authorizedGroupId!;
    const parsed = CreatePaymentBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const { fromUserId, toUserId, amount, note, date } = parsed.data;

    if (amount <= 0) {
      res.status(400).json({ error: "Amount must be positive" });
      return;
    }
    if (fromUserId === toUserId) {
      res.status(400).json({ error: "From and to users must differ" });
      return;
    }
    const memberIds = await getMemberIds(groupId);
    if (!memberIds.has(fromUserId) || !memberIds.has(toUserId)) {
      res.status(400).json({ error: "Both users must be group members" });
      return;
    }

    const dateStr = (date instanceof Date ? date.toISOString() : String(date)).slice(0, 10);

    const [payment] = await db
      .insert(paymentsTable)
      .values({
        groupId,
        fromUserId,
        toUserId,
        amount: amount.toFixed(2),
        note: note ?? null,
        date: dateStr,
      })
      .returning();

    res.status(201).json(await buildPayment(payment));
  },
);

router.delete(
  "/payments/:paymentId",
  requireAuth,
  requirePaymentAccess(),
  async (req, res): Promise<void> => {
    const raw = Array.isArray(req.params.paymentId)
      ? req.params.paymentId[0]
      : req.params.paymentId;
    const paymentId = raw;
    const [payment] = await db
      .delete(paymentsTable)
      .where(eq(paymentsTable.id, paymentId))
      .returning();
    if (!payment) {
      res.status(404).json({ error: "Payment not found" });
      return;
    }
    res.sendStatus(204);
  },
);

export default router;
