import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { db, usersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { signToken } from "../lib/jwt";
import { z } from "zod";
import { isSupportedCurrency } from "../lib/currencies.js";

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

  const token = signToken({ userId: user.id });
  res.status(201).json({
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      avatarUrl: user.avatarUrl,
      defaultCurrency: user.defaultCurrency,
      role: user.role,
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

  const token = signToken({ userId: user.id });
  res.json({
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      avatarUrl: user.avatarUrl,
      defaultCurrency: user.defaultCurrency,
      role,
    },
  });
});

router.post("/auth/logout", (_req, res): void => {
  res.json({ success: true });
});

export default router;
