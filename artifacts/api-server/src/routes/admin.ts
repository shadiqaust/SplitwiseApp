import { Router, type IRouter } from "express";
import { z } from "zod";
import { and, asc, count, desc, eq, ilike, isNull, or, sql, sum } from "drizzle-orm";
import {
  db,
  usersTable,
  groupsTable,
  groupMembersTable,
  expensesTable,
  paymentsTable,
  notificationsTable,
  currenciesTable,
} from "@workspace/db";
import { requireSuperadmin } from "../middlewares/requireSuperadmin";

const router: IRouter = Router();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ─── Users ─────────────────────────────────────────────────────────────────

router.get("/admin/users", requireSuperadmin, async (req, res) => {
  const q = String(req.query.q ?? "").trim();
  const where = q
    ? or(ilike(usersTable.name, `%${q}%`), ilike(usersTable.email, `%${q}%`))
    : undefined;

  const rows = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
      avatarUrl: usersTable.avatarUrl,
      defaultCurrency: usersTable.defaultCurrency,
      role: usersTable.role,
      createdAt: usersTable.createdAt,
    })
    .from(usersTable)
    .where(where)
    .orderBy(desc(usersTable.createdAt))
    .limit(500);

  res.json({
    users: rows.map((u) => ({ ...u, createdAt: u.createdAt.toISOString() })),
  });
});

router.get("/admin/users/:userId", requireSuperadmin, async (req, res): Promise<void> => {
  const id = String(req.params.userId);
  if (!UUID_RE.test(id)) {
    res.status(400).json({ error: "Invalid user id" });
    return;
  }

  const [user] = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
      avatarUrl: usersTable.avatarUrl,
      country: usersTable.country,
      location: usersTable.location,
      defaultCurrency: usersTable.defaultCurrency,
      role: usersTable.role,
      createdAt: usersTable.createdAt,
    })
    .from(usersTable)
    .where(eq(usersTable.id, id));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const [{ groupCount = 0 } = {}] = await db
    .select({ groupCount: count() })
    .from(groupMembersTable)
    .where(and(eq(groupMembersTable.userId, id), isNull(groupMembersTable.deletedAt)));

  const [{ paidCount = 0, paidTotal = "0" } = {}] = await db
    .select({
      paidCount: count(),
      paidTotal: sum(expensesTable.totalAmount).mapWith(String),
    })
    .from(expensesTable)
    .where(and(eq(expensesTable.paidByUserId, id), isNull(expensesTable.deletedAt)));

  const [{ paymentsSent = 0 } = {}] = await db
    .select({ paymentsSent: count() })
    .from(paymentsTable)
    .where(and(eq(paymentsTable.fromUserId, id), isNull(paymentsTable.deletedAt)));

  const [{ paymentsReceived = 0 } = {}] = await db
    .select({ paymentsReceived: count() })
    .from(paymentsTable)
    .where(and(eq(paymentsTable.toUserId, id), isNull(paymentsTable.deletedAt)));

  // Recent groups
  const groups = await db
    .select({
      id: groupsTable.id,
      name: groupsTable.name,
      currency: groupsTable.currency,
      joinedAt: groupMembersTable.joinedAt,
    })
    .from(groupMembersTable)
    .innerJoin(groupsTable, eq(groupsTable.id, groupMembersTable.groupId))
    .where(
      and(
        eq(groupMembersTable.userId, id),
        isNull(groupMembersTable.deletedAt),
        isNull(groupsTable.deletedAt),
      ),
    )
    .orderBy(desc(groupMembersTable.joinedAt))
    .limit(20);

  const expenses = await db
    .select({
      id: expensesTable.id,
      description: expensesTable.description,
      totalAmount: expensesTable.totalAmount,
      currency: expensesTable.currency,
      date: expensesTable.date,
      groupId: expensesTable.groupId,
      createdAt: expensesTable.createdAt,
    })
    .from(expensesTable)
    .where(and(eq(expensesTable.paidByUserId, id), isNull(expensesTable.deletedAt)))
    .orderBy(desc(expensesTable.createdAt))
    .limit(20);

  const payments = await db
    .select({
      id: paymentsTable.id,
      amount: paymentsTable.amount,
      fromUserId: paymentsTable.fromUserId,
      toUserId: paymentsTable.toUserId,
      note: paymentsTable.note,
      date: paymentsTable.date,
      createdAt: paymentsTable.createdAt,
    })
    .from(paymentsTable)
    .where(
      and(
        or(eq(paymentsTable.fromUserId, id), eq(paymentsTable.toUserId, id)),
        isNull(paymentsTable.deletedAt),
      ),
    )
    .orderBy(desc(paymentsTable.createdAt))
    .limit(20);

  res.json({
    user: { ...user, createdAt: user.createdAt.toISOString() },
    stats: {
      groupCount: Number(groupCount),
      paidCount: Number(paidCount),
      paidTotal: paidTotal ?? "0",
      paymentsSent: Number(paymentsSent),
      paymentsReceived: Number(paymentsReceived),
    },
    groups: groups.map((g) => ({ ...g, joinedAt: g.joinedAt.toISOString() })),
    expenses: expenses.map((e) => ({ ...e, createdAt: e.createdAt.toISOString() })),
    payments: payments.map((p) => ({ ...p, createdAt: p.createdAt.toISOString() })),
  });
});

// ─── Currencies ────────────────────────────────────────────────────────────

router.get("/admin/currencies", requireSuperadmin, async (_req, res) => {
  const rows = await db
    .select()
    .from(currenciesTable)
    .orderBy(asc(currenciesTable.sortOrder), asc(currenciesTable.code));
  res.json({ currencies: rows });
});

const CurrencyBody = z.object({
  code: z.string().min(1).max(10),
  name: z.string().min(1),
  symbol: z.string().min(1),
  sortOrder: z.number().int().optional(),
});

router.post("/admin/currencies", requireSuperadmin, async (req, res): Promise<void> => {
  const parsed = CurrencyBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", details: parsed.error.issues });
    return;
  }
  const code = parsed.data.code.toUpperCase();
  const [existing] = await db
    .select({ code: currenciesTable.code })
    .from(currenciesTable)
    .where(eq(currenciesTable.code, code));
  if (existing) {
    res.status(409).json({ error: "Currency already exists" });
    return;
  }
  const [row] = await db
    .insert(currenciesTable)
    .values({
      code,
      name: parsed.data.name,
      symbol: parsed.data.symbol,
      sortOrder: parsed.data.sortOrder ?? 9999,
    })
    .returning();
  res.status(201).json(row);
});

const CurrencyPatch = z.object({
  name: z.string().min(1).optional(),
  symbol: z.string().min(1).optional(),
  sortOrder: z.number().int().optional(),
});

router.patch("/admin/currencies/:code", requireSuperadmin, async (req, res): Promise<void> => {
  const code = String(req.params.code).toUpperCase();
  const parsed = CurrencyPatch.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }
  const [row] = await db
    .update(currenciesTable)
    .set(parsed.data)
    .where(eq(currenciesTable.code, code))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Currency not found" });
    return;
  }
  res.json(row);
});

router.delete("/admin/currencies/:code", requireSuperadmin, async (req, res): Promise<void> => {
  const code = String(req.params.code).toUpperCase();
  // Refuse deletion if anyone references this currency.
  const [{ uCount = 0 } = {}] = await db
    .select({ uCount: count() })
    .from(usersTable)
    .where(eq(usersTable.defaultCurrency, code));
  const [{ gCount = 0 } = {}] = await db
    .select({ gCount: count() })
    .from(groupsTable)
    .where(eq(groupsTable.currency, code));
  const [{ eCount = 0 } = {}] = await db
    .select({ eCount: count() })
    .from(expensesTable)
    .where(eq(expensesTable.currency, code));
  if (Number(uCount) + Number(gCount) + Number(eCount) > 0) {
    res.status(409).json({
      error: "Currency is in use and cannot be deleted",
      usage: { users: Number(uCount), groups: Number(gCount), expenses: Number(eCount) },
    });
    return;
  }
  const [row] = await db
    .delete(currenciesTable)
    .where(eq(currenciesTable.code, code))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Currency not found" });
    return;
  }
  res.sendStatus(204);
});

// ─── Notifications ────────────────────────────────────────────────────────

const SendNotifBody = z.object({
  target: z.union([z.literal("all"), z.string().uuid()]),
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(2000),
});

router.post("/admin/notifications", requireSuperadmin, async (req, res): Promise<void> => {
  const parsed = SendNotifBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", details: parsed.error.issues });
    return;
  }
  const { target, title, body } = parsed.data;

  let recipients: Array<{ id: string }> = [];
  if (target === "all") {
    recipients = await db.select({ id: usersTable.id }).from(usersTable);
  } else {
    const [u] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.id, target));
    if (!u) {
      res.status(404).json({ error: "Target user not found" });
      return;
    }
    recipients = [u];
  }

  if (recipients.length === 0) {
    res.json({ sent: 0 });
    return;
  }

  await db.insert(notificationsTable).values(
    recipients.map((r) => ({
      userId: r.id,
      type: target === "all" ? "admin_broadcast" : "admin_direct",
      title,
      body,
      data: { sentBy: req.dbUserId, target },
    })),
  );

  res.status(201).json({ sent: recipients.length });
});

router.get("/admin/notifications/sent", requireSuperadmin, async (_req, res) => {
  // Show a deduplicated view of admin-sent messages: for broadcasts we collapse
  // by (title, body, createdAt second), counting recipients.
  const rows = await db
    .select({
      type: notificationsTable.type,
      title: notificationsTable.title,
      body: notificationsTable.body,
      createdAt: notificationsTable.createdAt,
      recipients: count(),
    })
    .from(notificationsTable)
    .where(
      or(
        eq(notificationsTable.type, "admin_broadcast"),
        eq(notificationsTable.type, "admin_direct"),
      ),
    )
    .groupBy(
      notificationsTable.type,
      notificationsTable.title,
      notificationsTable.body,
      notificationsTable.createdAt,
    )
    .orderBy(desc(notificationsTable.createdAt))
    .limit(100);

  res.json({
    items: rows.map((r) => ({
      ...r,
      recipients: Number(r.recipients),
      createdAt: r.createdAt.toISOString(),
    })),
  });
});

// ─── Stats summary (for /admin landing) ────────────────────────────────────

router.get("/admin/stats", requireSuperadmin, async (_req, res) => {
  const [{ total: userCount = 0 } = {}] = await db
    .select({ total: count() })
    .from(usersTable);
  const [{ total: groupCount = 0 } = {}] = await db
    .select({ total: count() })
    .from(groupsTable)
    .where(isNull(groupsTable.deletedAt));
  const [{ total: expenseCount = 0 } = {}] = await db
    .select({ total: count() })
    .from(expensesTable)
    .where(isNull(expensesTable.deletedAt));
  const [{ total: paymentCount = 0 } = {}] = await db
    .select({ total: count() })
    .from(paymentsTable)
    .where(isNull(paymentsTable.deletedAt));
  const [{ total: currencyCount = 0 } = {}] = await db
    .select({ total: count() })
    .from(currenciesTable);
  res.json({
    users: Number(userCount),
    groups: Number(groupCount),
    expenses: Number(expenseCount),
    payments: Number(paymentCount),
    currencies: Number(currencyCount),
  });
});

// avoid unused import warning when sql isn't used
void sql;

// ─── Monthly analytics ─────────────────────────────────────────────────────
//
// Returns a 12-month rolling window (oldest first) of:
//   - newUsers      — accounts created that month
//   - expenses      — expenses created that month
//   - payments      — payments created that month
//   - activeUsers   — distinct user IDs that paid an expense OR sent/received
//                     a payment that month (rough engagement proxy)
router.get("/admin/analytics/monthly", requireSuperadmin, async (_req, res) => {
  // Build a series of the last 12 months (current month inclusive) so the
  // response always has 12 buckets even when nothing happened.
  const monthsSeries = sql<string>`
    to_char(
      generate_series(
        date_trunc('month', now()) - interval '11 months',
        date_trunc('month', now()),
        interval '1 month'
      ),
      'YYYY-MM'
    )
  `;

  const usersAgg = db
    .select({
      m: sql<string>`to_char(date_trunc('month', ${usersTable.createdAt}), 'YYYY-MM')`.as("m"),
      c: count().as("c"),
    })
    .from(usersTable)
    .where(sql`${usersTable.createdAt} >= date_trunc('month', now()) - interval '11 months'`)
    .groupBy(sql`1`)
    .as("u");

  const expensesAgg = db
    .select({
      m: sql<string>`to_char(date_trunc('month', ${expensesTable.createdAt}), 'YYYY-MM')`.as("m"),
      c: count().as("c"),
      a: sql<string>`count(distinct ${expensesTable.paidByUserId})`.as("a"),
    })
    .from(expensesTable)
    .where(sql`${expensesTable.createdAt} >= date_trunc('month', now()) - interval '11 months'`)
    .groupBy(sql`1`)
    .as("e");

  const paymentsAgg = db
    .select({
      m: sql<string>`to_char(date_trunc('month', ${paymentsTable.createdAt}), 'YYYY-MM')`.as("m"),
      c: count().as("c"),
      af: sql<string>`count(distinct ${paymentsTable.fromUserId})`.as("af"),
      at: sql<string>`count(distinct ${paymentsTable.toUserId})`.as("at"),
    })
    .from(paymentsTable)
    .where(sql`${paymentsTable.createdAt} >= date_trunc('month', now()) - interval '11 months'`)
    .groupBy(sql`1`)
    .as("p");

  const rows = await db.execute(sql`
    with
      months as (select ${monthsSeries} as m),
      u as (
        select to_char(date_trunc('month', ${usersTable.createdAt}), 'YYYY-MM') as m,
               count(*)::int as c
        from ${usersTable}
        where ${usersTable.createdAt} >= date_trunc('month', now()) - interval '11 months'
        group by 1
      ),
      e as (
        select to_char(date_trunc('month', ${expensesTable.createdAt}), 'YYYY-MM') as m,
               count(*)::int as c,
               array_agg(distinct ${expensesTable.paidByUserId}::text) as actors
        from ${expensesTable}
        where ${expensesTable.createdAt} >= date_trunc('month', now()) - interval '11 months'
        group by 1
      ),
      p as (
        select to_char(date_trunc('month', ${paymentsTable.createdAt}), 'YYYY-MM') as m,
               count(*)::int as c,
               array_agg(distinct ${paymentsTable.fromUserId}::text) as senders,
               array_agg(distinct ${paymentsTable.toUserId}::text) as receivers
        from ${paymentsTable}
        where ${paymentsTable.createdAt} >= date_trunc('month', now()) - interval '11 months'
        group by 1
      )
    select
      months.m as month,
      coalesce(u.c, 0) as new_users,
      coalesce(e.c, 0) as expenses,
      coalesce(p.c, 0) as payments,
      coalesce(
        cardinality(
          (
            select array(
              select distinct unnest(
                coalesce(e.actors, ARRAY[]::text[]) ||
                coalesce(p.senders, ARRAY[]::text[]) ||
                coalesce(p.receivers, ARRAY[]::text[])
              )
            )
          )
        ),
        0
      ) as active_users
    from months
    left join u on u.m = months.m
    left join e on e.m = months.m
    left join p on p.m = months.m
    order by months.m asc;
  `);

  // suppress unused warnings (these helpers are kept for potential reuse)
  void usersAgg; void expensesAgg; void paymentsAgg;

  const items = (rows.rows as Array<{
    month: string;
    new_users: number | string;
    expenses: number | string;
    payments: number | string;
    active_users: number | string;
  }>).map((r) => ({
    month: r.month,
    newUsers: Number(r.new_users),
    expenses: Number(r.expenses),
    payments: Number(r.payments),
    activeUsers: Number(r.active_users),
  }));

  res.json({ months: items });
});

export default router;
