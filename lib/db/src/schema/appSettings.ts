import { pgTable, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";

// Single-row table holding superadmin-editable runtime configuration.
// Currently scoped to outbound SMTP credentials used by the email
// verification flow. The single row is identified by id='smtp'.
//
// SECURITY NOTE: smtpPassword is stored in plaintext so the admin UI can
// edit it directly. Anyone with DB access can read the password — same trust
// boundary as session tokens / hashed passwords. Treat the DB accordingly.
export const appSmtpSettingsTable = pgTable("app_smtp_settings", {
  id: text("id").primaryKey(), // always "smtp"
  enabled: boolean("enabled").notNull().default(false),
  host: text("host").notNull().default(""),
  port: integer("port").notNull().default(587),
  // STARTTLS on 587, implicit TLS on 465.
  secure: boolean("secure").notNull().default(false),
  username: text("username").notNull().default(""),
  password: text("password").notNull().default(""),
  fromAddress: text("from_address").notNull().default(""),
  fromName: text("from_name").notNull().default("Splitix"),
  // Public web URL used to build verification links in outgoing emails
  // (e.g. https://splitix.example.com). Falls back to APP_PUBLIC_URL env if
  // empty. Stored without trailing slash by convention.
  appPublicUrl: text("app_public_url").notNull().default(""),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type AppSmtpSettings = typeof appSmtpSettingsTable.$inferSelect;
