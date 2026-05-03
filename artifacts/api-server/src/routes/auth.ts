import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import {
  db,
  usersTable,
  emailVerificationTokensTable,
} from "@workspace/db";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { signToken } from "../lib/jwt";
import { z } from "zod";
import { isSupportedCurrency } from "../lib/currencies.js";
import {
  sendMail,
  renderVerifyEmail,
  getAppPublicUrl,
} from "../lib/email";
import { logger } from "../lib/logger";
import { requireAuth } from "../middlewares/requireAuth";

function isSuperadminEmail(email: string): boolean {
  const target = process.env.SUPERADMIN_EMAIL?.trim().toLowerCase();
  if (!target) return false;
  return email.trim().toLowerCase() === target;
}

const router: IRouter = Router();

const RegisterBody = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  defaultCurrency: z.string().min(1).optional(),
  // Optional referrer user id captured from `?ref=<userId>` on the install
  // link. Must be a well-formed uuid (malformed values fail validation with
  // 400 — the web client only forwards valid uuids). Unknown-but-well-formed
  // ids are silently dropped during the existence check below so a stale
  // share link can't block signup.
  // NOTE: this is *attribution only* — it is not a fraud-prevention signal.
  // Anyone can submit any user id as their referrer. If referrals start
  // driving rewards, swap this for a signed invite token (HMAC/JWT).
  referrerId: z.string().uuid().optional(),
});

const LoginBody = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// ─── Email verification helpers ────────────────────────────────────────────

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24h

function hashToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

/**
 * Issue a fresh verification token for the user, persist its hash, and email
 * the user the verification link. Returns whether the email was actually
 * delivered (false when SMTP isn't configured — caller can surface that).
 *
 * The previous unused tokens for this user aren't deleted; they simply expire.
 * Each token is single-use (`usedAt`) so reuse after success fails cleanly.
 */
async function issueVerificationEmail(user: {
  id: string;
  name: string;
  email: string;
}): Promise<{ delivered: boolean; reason?: string }> {
  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);
  await db.insert(emailVerificationTokensTable).values({
    userId: user.id,
    tokenHash,
    expiresAt,
  });

  const baseUrl = await getAppPublicUrl();
  // We always include the token; the front-end web app at /verify-email
  // calls back into this API to consume it. If no public URL is configured
  // we still produce a relative path so the email at least shows the link.
  const verifyUrl = baseUrl
    ? `${baseUrl}/verify-email?token=${rawToken}`
    : `/verify-email?token=${rawToken}`;

  const { subject, html } = renderVerifyEmail({
    name: user.name,
    verifyUrl,
  });
  try {
    const result = await sendMail({ to: user.email, subject, html });
    if (!result.sent) {
      return { delivered: false, reason: result.reason };
    }
    return { delivered: true };
  } catch (err) {
    logger.error({ err, userId: user.id }, "Failed to send verification email");
    return {
      delivered: false,
      reason: err instanceof Error ? err.message : "Email send failed",
    };
  }
}

router.post("/auth/register", async (req, res): Promise<void> => {
  const parsed = RegisterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body", details: parsed.error.issues });
    return;
  }

  const { name, password, defaultCurrency, referrerId: rawReferrerId } = parsed.data;
  // Normalize emails to lowercase so logins are case-insensitive and we can
  // never end up with two accounts that differ only in casing.
  const email = parsed.data.email.trim().toLowerCase();

  if (defaultCurrency !== undefined && !(await isSupportedCurrency(defaultCurrency))) {
    res.status(400).json({ error: "Unsupported currency code" });
    return;
  }

  const [existing] = await db
    .select()
    .from(usersTable)
    .where(sql`lower(${usersTable.email}) = ${email}`);
  if (existing) {
    res.status(409).json({ error: "An account with this email already exists" });
    return;
  }

  // Validate the referrer is a real, existing user. If the caller passed a
  // syntactically-valid uuid that doesn't match anyone, drop it silently
  // rather than failing the signup.
  let referrerId: string | undefined;
  if (rawReferrerId) {
    const [ref] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.id, rawReferrerId));
    if (ref) referrerId = ref.id;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const role = isSuperadminEmail(email) ? "superadmin" : "user";
  const [user] = await db
    .insert(usersTable)
    .values({
      name,
      email,
      passwordHash,
      role,
      ...(defaultCurrency ? { defaultCurrency } : {}),
      ...(referrerId ? { referrerId } : {}),
    })
    .returning();

  // Fire off the verification email. We don't fail registration if SMTP is
  // misconfigured — we just surface a flag so the client can show a "couldn't
  // send, please retry" notice. Superadmins can still verify by editing the
  // DB directly if needed.
  const emailResult = await issueVerificationEmail({
    id: user.id,
    name: user.name,
    email: user.email,
  });

  const token = signToken({ userId: user.id, tokenVersion: user.tokenVersion ?? 0 });
  res.status(201).json({
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      avatarUrl: user.avatarUrl,
      defaultCurrency: user.defaultCurrency,
      role: user.role,
      emailVerifiedAt: user.emailVerifiedAt
        ? user.emailVerifiedAt.toISOString()
        : null,
    },
    verificationEmail: {
      sent: emailResult.delivered,
      reason: emailResult.reason ?? null,
    },
  });
});

router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const { password } = parsed.data;
  const email = parsed.data.email.trim().toLowerCase();

  const [user] = await db
    .select()
    .from(usersTable)
    .where(sql`lower(${usersTable.email}) = ${email}`);
  if (!user) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  // Auto-promote: if this user's email matches SUPERADMIN_EMAIL and they
  // aren't already a superadmin, upgrade their role on the fly. This lets the
  // designated owner gain admin access without a manual DB edit.
  let role = user.role;
  if (role !== "superadmin" && isSuperadminEmail(user.email)) {
    await db
      .update(usersTable)
      .set({ role: "superadmin" })
      .where(eq(usersTable.id, user.id));
    role = "superadmin";
  }

  const token = signToken({ userId: user.id, tokenVersion: user.tokenVersion ?? 0 });
  res.json({
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      avatarUrl: user.avatarUrl,
      defaultCurrency: user.defaultCurrency,
      role,
      emailVerifiedAt: user.emailVerifiedAt
        ? user.emailVerifiedAt.toISOString()
        : null,
    },
  });
});

router.post("/auth/logout", (_req, res): void => {
  res.json({ success: true });
});

// ─── Verification ──────────────────────────────────────────────────────────

const VerifyQuery = z.object({
  token: z.string().min(32).max(256),
});

/**
 * Consume a verification token. Idempotent for a single token row in the
 * sense that a second call with the same token returns 410 (already used).
 *
 * Accepts both GET (so users can click directly from email if a web layer
 * isn't around to proxy) and POST (so the web SPA can call it without
 * leaking the token via the Referer header on a navigation).
 */
async function handleVerify(token: string): Promise<
  | { ok: true; userId: string }
  | { ok: false; status: number; error: string }
> {
  const tokenHash = hashToken(token);
  const [row] = await db
    .select()
    .from(emailVerificationTokensTable)
    .where(eq(emailVerificationTokensTable.tokenHash, tokenHash));

  if (!row) {
    return { ok: false, status: 400, error: "Invalid verification link" };
  }
  if (row.usedAt) {
    // Already-used tokens are a frequent benign case — the user clicked
    // the email twice. We still treat this as a "verified" success if the
    // underlying account is verified, so the user gets a friendly UI.
    const [u] = await db
      .select({ emailVerifiedAt: usersTable.emailVerifiedAt })
      .from(usersTable)
      .where(eq(usersTable.id, row.userId));
    if (u?.emailVerifiedAt) return { ok: true, userId: row.userId };
    return { ok: false, status: 410, error: "Verification link already used" };
  }
  if (row.expiresAt.getTime() < Date.now()) {
    return { ok: false, status: 410, error: "Verification link has expired" };
  }

  const now = new Date();
  // Atomically claim the token: only the first concurrent verifier whose
  // UPDATE matches `used_at IS NULL` wins. Others see zero rows updated and
  // fall through to the "already verified" idempotent success path.
  const claimed = await db
    .update(emailVerificationTokensTable)
    .set({ usedAt: now })
    .where(
      and(
        eq(emailVerificationTokensTable.id, row.id),
        isNull(emailVerificationTokensTable.usedAt),
      ),
    )
    .returning({ id: emailVerificationTokensTable.id });
  if (claimed.length > 0) {
    await db
      .update(usersTable)
      .set({ emailVerifiedAt: now })
      .where(eq(usersTable.id, row.userId));
  }
  return { ok: true, userId: row.userId };
}

router.get("/auth/verify-email", async (req, res): Promise<void> => {
  const parsed = VerifyQuery.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Missing or malformed token" });
    return;
  }
  const result = await handleVerify(parsed.data.token);
  if (!result.ok) {
    res.status(result.status).json({ error: result.error });
    return;
  }
  res.json({ ok: true });
});

router.post("/auth/verify-email", async (req, res): Promise<void> => {
  const parsed = VerifyQuery.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Missing or malformed token" });
    return;
  }
  const result = await handleVerify(parsed.data.token);
  if (!result.ok) {
    res.status(result.status).json({ error: result.error });
    return;
  }
  res.json({ ok: true });
});

// Throttle: a verified user shouldn't be able to spam the resend endpoint and
// blast their inbox (or our SMTP quota). One outstanding token per minute is
// plenty for a real user.
router.post(
  "/auth/resend-verification",
  requireAuth,
  async (req, res): Promise<void> => {
    const userId = req.dbUserId;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const [u] = await db
      .select({
        id: usersTable.id,
        name: usersTable.name,
        email: usersTable.email,
        emailVerifiedAt: usersTable.emailVerifiedAt,
      })
      .from(usersTable)
      .where(eq(usersTable.id, userId));
    if (!u) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    if (u.emailVerifiedAt) {
      res.json({ ok: true, alreadyVerified: true });
      return;
    }

    const oneMinuteAgo = new Date(Date.now() - 60_000);
    const [recent] = await db
      .select({ id: emailVerificationTokensTable.id })
      .from(emailVerificationTokensTable)
      .where(
        and(
          eq(emailVerificationTokensTable.userId, u.id),
          isNull(emailVerificationTokensTable.usedAt),
          gt(emailVerificationTokensTable.createdAt, oneMinuteAgo),
        ),
      )
      .limit(1);
    if (recent) {
      res
        .status(429)
        .json({ error: "A verification email was just sent. Please wait a minute before retrying." });
      return;
    }

    const result = await issueVerificationEmail(u);
    res.json({
      ok: true,
      sent: result.delivered,
      reason: result.reason ?? null,
    });
  },
);

export default router;
