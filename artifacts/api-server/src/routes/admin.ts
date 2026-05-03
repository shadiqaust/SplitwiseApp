import { Router, type IRouter } from "express";
import { z } from "zod";
import { and, asc, count, desc, eq, ilike, inArray, isNotNull, isNull, or, sql, sum } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
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
import { createNotifications } from "../lib/notifications";

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

// ─── User role management ─────────────────────────────────────────────────

const RoleBody = z.object({ role: z.enum(["user", "superadmin"]) });

router.patch(
  "/admin/users/:userId/role",
  requireSuperadmin,
  async (req, res): Promise<void> => {
    const id = String(req.params.userId);
    if (!UUID_RE.test(id)) {
      res.status(400).json({ error: "Invalid user id" });
      return;
    }
    const parsed = RoleBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid body — role must be 'user' or 'superadmin'" });
      return;
    }
    const { role } = parsed.data;

    // Refuse to let an admin demote themselves — easy way to lock the
    // app's only admin out of the dashboard.
    if (id === req.dbUserId && role !== "superadmin") {
      res.status(400).json({ error: "You can't change your own admin role." });
      return;
    }

    const [target] = await db
      .select({ id: usersTable.id, role: usersTable.role })
      .from(usersTable)
      .where(eq(usersTable.id, id));
    if (!target) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    // No-op if role isn't actually changing — return the current row so the
    // client cache stays in sync without a write.
    if (target.role === role) {
      res.json({ id: target.id, role: target.role });
      return;
    }

    // Don't allow demoting the last remaining superadmin — there must
    // always be at least one admin so the /admin section stays reachable.
    if (target.role === "superadmin" && role !== "superadmin") {
      const [{ remaining = 0 } = {}] = await db
        .select({ remaining: count() })
        .from(usersTable)
        .where(eq(usersTable.role, "superadmin"));
      if (Number(remaining) <= 1) {
        res
          .status(400)
          .json({ error: "Cannot demote the last superadmin. Promote someone else first." });
        return;
      }
    }

    const [updated] = await db
      .update(usersTable)
      .set({ role })
      .where(eq(usersTable.id, id))
      .returning({ id: usersTable.id, role: usersTable.role });
    res.json(updated);
  },
);

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

const SendNotifBody = z
  .object({
    target: z.union([z.literal("all"), z.string().uuid()]),
    title: z.string().min(1).max(200),
    body: z.string().min(1).max(2000),
    channels: z
      .object({
        inApp: z.boolean().optional(),
        push: z.boolean().optional(),
      })
      .optional(),
  })
  .refine(
    (v) => {
      const inApp = v.channels?.inApp ?? true;
      const push = v.channels?.push ?? true;
      return inApp || push;
    },
    { message: "At least one delivery channel must be enabled", path: ["channels"] },
  );

router.post("/admin/notifications", requireSuperadmin, async (req, res): Promise<void> => {
  const parsed = SendNotifBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", details: parsed.error.issues });
    return;
  }
  const { target, title, body, channels } = parsed.data;
  const inApp = channels?.inApp ?? true;
  const push = channels?.push ?? true;

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

  // Route through createNotifications so the same code path can fire the
  // in-app inbox insert and/or the OS-level Expo push, per the admin's choice.
  await createNotifications(
    recipients.map((r) => ({
      userId: r.id,
      type: target === "all" ? "admin_broadcast" : "admin_direct",
      title,
      body,
      data: { sentBy: req.dbUserId, target, channels: { inApp, push } },
    })),
    { inApp, push },
  );

  res.status(201).json({ sent: recipients.length, channels: { inApp, push } });
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

// ─── Referrals ─────────────────────────────────────────────────────────────

router.get("/admin/referrals", requireSuperadmin, async (req, res) => {
  // Optional `?q=` matches against either the new user's OR the referrer's
  // name/email. Implemented as a self-join so a single SQL statement handles
  // both sides; the case without `q` keeps the original two-step query for
  // efficiency on the leaderboard reuse path.
  const q = String(req.query.q ?? "").trim();
  const referrerAlias = alias(usersTable, "ref_user");

  const baseRows = await db
    .select({
      newUserId: usersTable.id,
      newUserName: usersTable.name,
      newUserEmail: usersTable.email,
      newUserAvatar: usersTable.avatarUrl,
      newUserCreatedAt: usersTable.createdAt,
      referrerId: usersTable.referrerId,
      refId: referrerAlias.id,
      refName: referrerAlias.name,
      refEmail: referrerAlias.email,
      refAvatar: referrerAlias.avatarUrl,
    })
    .from(usersTable)
    .innerJoin(referrerAlias, eq(referrerAlias.id, usersTable.referrerId))
    .where(
      q
        ? and(
            isNotNull(usersTable.referrerId),
            or(
              ilike(usersTable.name, `%${q}%`),
              ilike(usersTable.email, `%${q}%`),
              ilike(referrerAlias.name, `%${q}%`),
              ilike(referrerAlias.email, `%${q}%`),
            ),
          )
        : isNotNull(usersTable.referrerId),
    )
    .orderBy(desc(usersTable.createdAt))
    .limit(500);

  // Re-shape into the same row + lookup-map structure the rest of the
  // handler expects, so the leaderboard merge below stays unchanged.
  const rows = baseRows.map((r) => ({
    newUserId: r.newUserId,
    newUserName: r.newUserName,
    newUserEmail: r.newUserEmail,
    newUserAvatar: r.newUserAvatar,
    newUserCreatedAt: r.newUserCreatedAt,
    referrerId: r.referrerId,
  }));

  // Build the referrer lookup map directly from the joined rows — saves the
  // extra round-trip the previous IN-query needed.
  const refById = new Map<string, {
    id: string;
    name: string;
    email: string;
    avatarUrl: string | null;
  }>();
  for (const r of baseRows) {
    if (r.refId && !refById.has(r.refId)) {
      refById.set(r.refId, {
        id: r.refId,
        name: r.refName ?? "",
        email: r.refEmail ?? "",
        avatarUrl: r.refAvatar,
      });
    }
  }

  const referrals = rows
    .map((r) => {
      const ref = r.referrerId ? refById.get(r.referrerId) : undefined;
      if (!ref) return null;
      return {
        user: {
          id: r.newUserId,
          name: r.newUserName,
          email: r.newUserEmail,
          avatarUrl: r.newUserAvatar,
          createdAt: r.newUserCreatedAt.toISOString(),
        },
        referrer: ref,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  // Leaderboard: who has invited the most users. Group by the referrer id
  // explicitly and select that same column so the result row carries the
  // referrer's id (not an arbitrary user id).
  const topRows = await db
    .select({
      referrerId: usersTable.referrerId,
      total: count(),
    })
    .from(usersTable)
    .where(isNotNull(usersTable.referrerId))
    .groupBy(usersTable.referrerId)
    .orderBy(desc(count()))
    .limit(10);

  // Re-use the same profile lookup map; only fetch any referrers we haven't
  // already loaded from the recent-signups query above.
  const missingTopIds = topRows
    .map((t) => t.referrerId)
    .filter((id): id is string => !!id && !refById.has(id));
  if (missingTopIds.length) {
    const extra = await db
      .select({
        id: usersTable.id,
        name: usersTable.name,
        email: usersTable.email,
        avatarUrl: usersTable.avatarUrl,
      })
      .from(usersTable)
      .where(inArray(usersTable.id, missingTopIds));
    for (const r of extra) refById.set(r.id, r);
  }
  const topReferrers = topRows
    .map((t) => {
      if (!t.referrerId) return null;
      const ref = refById.get(t.referrerId);
      if (!ref) return null;
      return { ...ref, count: Number(t.total) };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  res.json({ referrals, topReferrers });
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
router.get("/admin/analytics/monthly", requireSuperadmin, async (req, res): Promise<void> => {
  // Filters:
  //   ?from=YYYY-MM-DD  (inclusive, defaults to first day of "11 months ago")
  //   ?to=YYYY-MM-DD    (inclusive end-of-day, defaults to now)
  // Both are optional; the response always contains a contiguous, zero-filled
  // monthly series between (truncated) from and to.
  // Strict YYYY-MM-DD parsing — rejects garbage and refuses to silently
  // re-interpret invalid calendar dates (e.g. "2026-02-31" → March).
  // Returns: Date when valid, "invalid" when present-but-bad, null when absent.
  const parseDate = (s: unknown): Date | "invalid" | null => {
    if (s === undefined || s === null || s === "") return null;
    if (typeof s !== "string") return "invalid";
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (!m) return "invalid";
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const da = Number(m[3]);
    const d = new Date(y, mo - 1, da);
    if (
      d.getFullYear() !== y ||
      d.getMonth() !== mo - 1 ||
      d.getDate() !== da
    ) {
      return "invalid";
    }
    return d;
  };

  const fromParsed = parseDate(req.query.from);
  const toParsed = parseDate(req.query.to);
  if (fromParsed === "invalid" || toParsed === "invalid") {
    res.status(400).json({
      error: "Invalid date — use YYYY-MM-DD",
      field: fromParsed === "invalid" ? "from" : "to",
    });
    return;
  }

  const now = new Date();
  const defaultFrom = new Date(now.getFullYear(), now.getMonth() - 11, 1);
  let from = fromParsed ?? defaultFrom;
  let to = toParsed ?? now;
  if (from > to) [from, to] = [to, from];
  // Push `to` to end-of-day so a same-day from/to still includes today.
  const toEnd = new Date(to.getFullYear(), to.getMonth(), to.getDate(), 23, 59, 59, 999);

  const fromIso = from.toISOString();
  const toIso = toEnd.toISOString();

  const rows = await db.execute(sql`
    with
      months as (
        select to_char(gs, 'YYYY-MM') as m
        from generate_series(
          date_trunc('month', ${fromIso}::timestamptz),
          date_trunc('month', ${toIso}::timestamptz),
          interval '1 month'
        ) as gs
      ),
      u as (
        select to_char(date_trunc('month', ${usersTable.createdAt}), 'YYYY-MM') as m,
               count(*)::int as c
        from ${usersTable}
        where ${usersTable.createdAt} >= ${fromIso}::timestamptz
          and ${usersTable.createdAt} <= ${toIso}::timestamptz
        group by 1
      ),
      e as (
        select to_char(date_trunc('month', ${expensesTable.createdAt}), 'YYYY-MM') as m,
               count(*)::int as c,
               array_agg(distinct ${expensesTable.paidByUserId}::text) as actors
        from ${expensesTable}
        where ${expensesTable.createdAt} >= ${fromIso}::timestamptz
          and ${expensesTable.createdAt} <= ${toIso}::timestamptz
        group by 1
      ),
      p as (
        select to_char(date_trunc('month', ${paymentsTable.createdAt}), 'YYYY-MM') as m,
               count(*)::int as c,
               array_agg(distinct ${paymentsTable.fromUserId}::text) as senders,
               array_agg(distinct ${paymentsTable.toUserId}::text) as receivers
        from ${paymentsTable}
        where ${paymentsTable.createdAt} >= ${fromIso}::timestamptz
          and ${paymentsTable.createdAt} <= ${toIso}::timestamptz
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

  res.json({
    range: { from: from.toISOString(), to: toEnd.toISOString() },
    months: items,
  });
});

export default router;
