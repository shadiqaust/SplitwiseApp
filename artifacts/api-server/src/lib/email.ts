import nodemailer, { type Transporter } from "nodemailer";
import { db, appSmtpSettingsTable, type AppSmtpSettings } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

// Loaded from DB on every send so superadmin edits take effect without
// restarting the server. If the row is missing or `enabled=false`, sending
// is treated as a no-op (returns { skipped: true }) — useful in dev where
// SMTP isn't configured.

const SMTP_ROW_ID = "smtp";

export async function getSmtpSettings(): Promise<AppSmtpSettings | null> {
  const [row] = await db
    .select()
    .from(appSmtpSettingsTable)
    .where(eq(appSmtpSettingsTable.id, SMTP_ROW_ID));
  return row ?? null;
}

export async function upsertSmtpSettings(
  patch: Partial<Omit<AppSmtpSettings, "id" | "updatedAt">>,
): Promise<AppSmtpSettings> {
  const existing = await getSmtpSettings();
  if (!existing) {
    const [row] = await db
      .insert(appSmtpSettingsTable)
      .values({
        id: SMTP_ROW_ID,
        enabled: patch.enabled ?? false,
        host: patch.host ?? "",
        port: patch.port ?? 587,
        secure: patch.secure ?? false,
        username: patch.username ?? "",
        password: patch.password ?? "",
        fromAddress: patch.fromAddress ?? "",
        fromName: patch.fromName ?? "Splitix",
        appPublicUrl: patch.appPublicUrl ?? "",
      })
      .returning();
    return row!;
  }
  const [row] = await db
    .update(appSmtpSettingsTable)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(appSmtpSettingsTable.id, SMTP_ROW_ID))
    .returning();
  return row!;
}

function buildTransport(s: AppSmtpSettings): Transporter {
  return nodemailer.createTransport({
    host: s.host,
    port: s.port,
    secure: s.secure,
    auth:
      s.username || s.password
        ? { user: s.username, pass: s.password }
        : undefined,
  });
}

export interface SendResult {
  sent: boolean;
  skipped?: boolean;
  reason?: string;
  messageId?: string;
}

export async function sendMail(opts: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}): Promise<SendResult> {
  const settings = await getSmtpSettings();
  if (!settings || !settings.enabled) {
    logger.warn(
      { to: opts.to, subject: opts.subject },
      "SMTP not configured/enabled — email not sent",
    );
    return { sent: false, skipped: true, reason: "SMTP not configured" };
  }
  if (!settings.host || !settings.fromAddress) {
    return {
      sent: false,
      skipped: true,
      reason: "SMTP host or from address missing",
    };
  }
  const transport = buildTransport(settings);
  const from = settings.fromName
    ? `"${settings.fromName}" <${settings.fromAddress}>`
    : settings.fromAddress;
  const info = await transport.sendMail({
    from,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
    text: opts.text ?? stripHtml(opts.html),
  });
  return { sent: true, messageId: info.messageId };
}

export async function verifySmtpConnection(): Promise<{
  ok: boolean;
  error?: string;
}> {
  const settings = await getSmtpSettings();
  if (!settings) return { ok: false, error: "No SMTP settings configured" };
  if (!settings.host) return { ok: false, error: "Host is required" };
  try {
    await buildTransport(settings).verify();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

function stripHtml(s: string): string {
  return s
    .replace(/<style[\s\S]*?<\/style>/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export async function getAppPublicUrl(): Promise<string> {
  const settings = await getSmtpSettings();
  const fromDb = settings?.appPublicUrl?.trim();
  if (fromDb) return fromDb.replace(/\/$/, "");
  const fromEnv = process.env["APP_PUBLIC_URL"]?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  return "";
}

export function renderVerifyEmail(opts: {
  name: string;
  verifyUrl: string;
}): { subject: string; html: string } {
  const subject = "Verify your Splitix email";
  const html = `<!doctype html>
<html><body style="font-family: -apple-system, system-ui, sans-serif; color: #111; max-width: 560px; margin: 0 auto; padding: 24px;">
  <h2 style="margin: 0 0 16px;">Welcome to Splitix, ${escapeHtml(opts.name)}!</h2>
  <p>Tap the button below to confirm this email address. The link expires in 24 hours.</p>
  <p style="margin: 24px 0;">
    <a href="${opts.verifyUrl}" style="background: #16a34a; color: #fff; padding: 12px 20px; border-radius: 8px; text-decoration: none; font-weight: 600;">Verify email</a>
  </p>
  <p style="color: #555; font-size: 13px;">Or paste this link into your browser:<br/>
    <a href="${opts.verifyUrl}">${opts.verifyUrl}</a>
  </p>
  <hr style="border: none; border-top: 1px solid #eee; margin: 32px 0;"/>
  <p style="color: #888; font-size: 12px;">If you didn't create a Splitix account, you can ignore this email.</p>
</body></html>`;
  return { subject, html };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
