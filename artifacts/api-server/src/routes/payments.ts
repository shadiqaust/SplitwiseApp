import { Router, type IRouter } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db, paymentsTable, usersTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { CreatePaymentBody } from "@workspace/api-zod";

const router: IRouter = Router();

async function getUserById(id: number) {
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

// GET /groups/:groupId/payments
router.get("/groups/:groupId/payments", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.groupId) ? req.params.groupId[0] : req.params.groupId;
  const groupId = parseInt(raw, 10);

  const payments = await db.select()
    .from(paymentsTable)
    .where(eq(paymentsTable.groupId, groupId))
    .orderBy(desc(paymentsTable.date), desc(paymentsTable.createdAt));

  const result = await Promise.all(payments.map(buildPayment));
  res.json(result);
});

// POST /groups/:groupId/payments
router.post("/groups/:groupId/payments", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.groupId) ? req.params.groupId[0] : req.params.groupId;
  const groupId = parseInt(raw, 10);

  const parsed = CreatePaymentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [payment] = await db.insert(paymentsTable).values({
    groupId,
    fromUserId: parsed.data.fromUserId,
    toUserId: parsed.data.toUserId,
    amount: parsed.data.amount.toFixed(2),
    note: parsed.data.note ?? null,
    date: String(parsed.data.date),
  }).returning();

  res.status(201).json(await buildPayment(payment));
});

// DELETE /payments/:paymentId
router.delete("/payments/:paymentId", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.paymentId) ? req.params.paymentId[0] : req.params.paymentId;
  const paymentId = parseInt(raw, 10);

  const [payment] = await db.delete(paymentsTable).where(eq(paymentsTable.id, paymentId)).returning();
  if (!payment) {
    res.status(404).json({ error: "Payment not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;
