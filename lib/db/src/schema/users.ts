import { pgTable, uuid, text, timestamp, integer, type AnyPgColumn } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { currenciesTable } from "./currencies";

export const usersTable = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  avatarUrl: text("avatar_url"),
  country: text("country"),
  defaultCurrency: text("default_currency")
    .notNull()
    .default("USD")
    .references(() => currenciesTable.code),
  // Authorization role. 'user' is the default; 'superadmin' grants access to
  // the /admin section. Promotion is automatic when SUPERADMIN_EMAIL matches
  // the user's email at login/register time.
  role: text("role").notNull().default("user"),
  // Referral tracking: who invited this user (if anyone). Set at signup time
  // from the ?ref=<userId> query param on the install/share link. Null when
  // the user signed up organically. SET NULL on referrer deletion so we
  // never block account removal due to outstanding referrals.
  referrerId: uuid("referrer_id").references((): AnyPgColumn => usersTable.id, {
    onDelete: "set null",
  }),
  // When the user confirmed their email via the verification link.
  // NULL = unverified. Sensitive mutations (creating expenses, adding
  // members, etc.) are blocked while this is null; read-only browsing
  // remains allowed (hybrid enforcement mode).
  emailVerifiedAt: timestamp("email_verified_at"),
  // Bumped by admin "force logout" to invalidate every existing JWT for this
  // user. Tokens carry the version they were issued at; requireAuth rejects
  // any token whose version is below the current row value.
  tokenVersion: integer("token_version").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
