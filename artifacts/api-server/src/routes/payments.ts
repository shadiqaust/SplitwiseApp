import { Router, type IRouter } from "express";
import { eq, desc, or, and, inArray, isNull } from "drizzle-orm";
import {
  db,
  paymentsTable,
  usersTable,
  groupMembersTable,
  groupsTable,
  friendshipsTable,
} from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { requireVerifiedEmail } from "../middlewares/requireVerifiedEmail";
import {
  requireGroupMember,
  requirePaymentAccess,
} from "../middlewares/requireGroupAccess";
import { CreatePaymentBody, CreateNonGroupPaymentBody } from "@workspace/api-zod";
import { createNotifications, getActorName, getGroupName } from "../lib/notifications";

const router: IRouter = Router();

async function getUserById(id: string) {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id));
  return user;
}

export async function buildPayment(payment: typeof paymentsTable.$inferSelect) {
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
    .where(and(eq(groupMembersTable.groupId, groupId), isNull(groupMembersTable.deletedAt)));
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
      .where(and(eq(paymentsTable.groupId, groupId), isNull(paymentsTable.deletedAt)))
      .orderBy(desc(paymentsTable.date), desc(paymentsTable.createdAt));
    const result = await Promise.all(payments.map(buildPayment));
    res.json(result);
  },
);

router.post(
  "/groups/:groupId/payments",
  requireVerifiedEmail,
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

    const me = req.dbUserId!;
    const actorName = await getActorName(me);
    const groupName = await getGroupName(groupId);
    const [gc] = await db
      .select({ currency: groupsTable.currency })
      .from(groupsTable)
      .where(eq(groupsTable.id, groupId));
    const ccy = gc?.currency ?? "USD";
    const recipients = [fromUserId, toUserId].filter((id) => id !== me);
    await createNotifications(
      recipients.map((uid) => ({
        userId: uid,
        type: "payment_added",
        title: `${actorName} recorded a payment in ${groupName}`,
        body: `${ccy} ${amount.toFixed(2)}${note ? ` · ${note}` : ""}`,
        data: { paymentId: payment.id, groupId, actorUserId: me },
      })),
    );

    res.status(201).json(await buildPayment(payment));
  },
);

// Non-group payment between two friends (no groupId).
router.post(
  "/payments",
  requireVerifiedEmail,
  async (req, res): Promise<void> => {
    const me = req.dbUserId!;
    const parsed = CreateNonGroupPaymentBody.safeParse(req.body);
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
    if (fromUserId !== me && toUserId !== me) {
      res.status(403).json({
        error: "Payment must involve the current user",
      });
      return;
    }

    const friendId = fromUserId === me ? toUserId : fromUserId;

    // Verify friendship (direct or shared group).
    const [direct] = await db
      .select({ id: friendshipsTable.id })
      .from(friendshipsTable)
      .where(
        and(
          isNull(friendshipsTable.deletedAt),
          or(
            and(
              eq(friendshipsTable.userId, me),
              eq(friendshipsTable.friendId, friendId),
            ),
            and(
              eq(friendshipsTable.userId, friendId),
              eq(friendshipsTable.friendId, me),
            ),
          ),
        ),
      )
      .limit(1);

    let isFriend = Boolean(direct);
    if (!isFriend) {
      const myGroups = await db
        .select({ groupId: groupMembersTable.groupId })
        .from(groupMembersTable)
        .where(and(eq(groupMembersTable.userId, me), isNull(groupMembersTable.deletedAt)));
      if (myGroups.length > 0) {
        const [shared] = await db
          .select({ id: groupMembersTable.id })
          .from(groupMembersTable)
          .where(
            and(
              eq(groupMembersTable.userId, friendId),
              isNull(groupMembersTable.deletedAt),
              inArray(
                groupMembersTable.groupId,
                myGroups.map((g) => g.groupId),
              ),
            ),
          )
          .limit(1);
        isFriend = Boolean(shared);
      }
    }

    if (!isFriend) {
      res.status(403).json({ error: "Recipient is not your friend" });
      return;
    }

    const dateStr = (date instanceof Date ? date.toISOString() : String(date)).slice(0, 10);

    const [payment] = await db
      .insert(paymentsTable)
      .values({
        groupId: null,
        fromUserId,
        toUserId,
        amount: amount.toFixed(2),
        note: note ?? null,
        date: dateStr,
      })
      .returning();

    const actorName = await getActorName(me);
    const [actor] = await db
      .select({ defaultCurrency: usersTable.defaultCurrency })
      .from(usersTable)
      .where(eq(usersTable.id, me));
    const ccy = actor?.defaultCurrency ?? "USD";
    await createNotifications([
      {
        userId: friendId,
        type: "payment_added",
        title: `${actorName} recorded a payment`,
        body: `${ccy} ${amount.toFixed(2)}${note ? ` · ${note}` : ""}`,
        data: { paymentId: payment.id, groupId: null, actorUserId: me },
      },
    ]);

    res.status(201).json(await buildPayment(payment));
  },
);

router.delete(
  "/payments/:paymentId",
  requireVerifiedEmail,
  requirePaymentAccess(),
  async (req, res): Promise<void> => {
    const raw = Array.isArray(req.params.paymentId)
      ? req.params.paymentId[0]
      : req.params.paymentId;
    const paymentId = raw;
    const [payment] = await db
      .update(paymentsTable)
      .set({ deletedAt: new Date() })
      .where(and(eq(paymentsTable.id, paymentId), isNull(paymentsTable.deletedAt)))
      .returning();
    if (!payment) {
      res.status(404).json({ error: "Payment not found" });
      return;
    }
    res.sendStatus(204);
  },
);

export default router;
