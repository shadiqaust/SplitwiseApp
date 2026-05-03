import { Router, type IRouter } from "express";
import { z } from "zod";
import {
  getSmtpSettings,
  upsertSmtpSettings,
  sendMail,
  verifySmtpConnection,
} from "../lib/email";
import { requireSuperadmin } from "../middlewares/requireSuperadmin";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

// Mask the password in GET responses so it can never be exfiltrated via the
// admin UI / browser devtools. The admin can re-enter it on PUT to change it;
// an empty string in the PUT body means "leave unchanged".
const PASSWORD_MASK = "__unchanged__";

router.get("/admin/settings/smtp", requireSuperadmin, async (_req, res) => {
  const s = await getSmtpSettings();
  if (!s) {
    res.json({
      enabled: false,
      host: "",
      port: 587,
      secure: false,
      username: "",
      password: "",
      hasPassword: false,
      fromAddress: "",
      fromName: "Splitix",
      appPublicUrl: "",
      updatedAt: null,
    });
    return;
  }
  res.json({
    enabled: s.enabled,
    host: s.host,
    port: s.port,
    secure: s.secure,
    username: s.username,
    password: "",
    hasPassword: !!s.password,
    fromAddress: s.fromAddress,
    fromName: s.fromName,
    appPublicUrl: s.appPublicUrl,
    updatedAt: s.updatedAt.toISOString(),
  });
});

const SmtpBody = z.object({
  enabled: z.boolean(),
  host: z.string(),
  port: z.number().int().min(1).max(65535),
  secure: z.boolean(),
  username: z.string(),
  // Empty string => keep existing password unchanged.
  password: z.string(),
  fromAddress: z.string(),
  fromName: z.string(),
  appPublicUrl: z.string(),
});

router.put("/admin/settings/smtp", requireSuperadmin, async (req, res): Promise<void> => {
  const parsed = SmtpBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", details: parsed.error.issues });
    return;
  }
  const { password, ...rest } = parsed.data;
  const existing = await getSmtpSettings();
  // Only overwrite the stored password when the admin actually typed
  // something — empty input means "no change". This lets the masked GET +
  // PUT round-trip work without forcing the admin to retype on every save.
  const passwordToWrite =
    password === "" || password === PASSWORD_MASK
      ? existing?.password ?? ""
      : password;
  const updated = await upsertSmtpSettings({
    ...rest,
    password: passwordToWrite,
  });
  res.json({
    enabled: updated.enabled,
    host: updated.host,
    port: updated.port,
    secure: updated.secure,
    username: updated.username,
    password: "",
    hasPassword: !!updated.password,
    fromAddress: updated.fromAddress,
    fromName: updated.fromName,
    appPublicUrl: updated.appPublicUrl,
    updatedAt: updated.updatedAt.toISOString(),
  });
});

const TestBody = z.object({
  to: z.string().email().optional(),
});

router.post(
  "/admin/settings/smtp/test",
  requireSuperadmin,
  async (req, res): Promise<void> => {
    const parsed = TestBody.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid body" });
      return;
    }
    // First sanity-check the connection so we surface auth/host errors
    // without bombing the admin's own inbox with retries.
    const verified = await verifySmtpConnection();
    if (!verified.ok) {
      res.status(400).json({ ok: false, error: verified.error });
      return;
    }

    let to = parsed.data.to;
    if (!to) {
      const [me] = await db
        .select({ email: usersTable.email })
        .from(usersTable)
        .where(eq(usersTable.id, req.dbUserId!));
      to = me?.email;
    }
    if (!to) {
      res.status(400).json({ ok: false, error: "No recipient available" });
      return;
    }

    try {
      const result = await sendMail({
        to,
        subject: "Splitix SMTP test",
        html: `<p>This is a test email from your Splitix admin panel.</p>
<p>If you received this, your SMTP configuration is working.</p>`,
      });
      if (!result.sent) {
        res
          .status(400)
          .json({ ok: false, error: result.reason ?? "Email not sent" });
        return;
      }
      res.json({ ok: true, messageId: result.messageId });
    } catch (err) {
      res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : "Unexpected SMTP error",
      });
    }
  },
);

export default router;
