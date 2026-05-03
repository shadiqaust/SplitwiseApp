import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";
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
  location: text("location"),
  defaultCurrency: text("default_currency")
    .notNull()
    .default("USD")
    .references(() => currenciesTable.code),
  // Authorization role. 'user' is the default; 'superadmin' grants access to
  // the /admin section. Promotion is automatic when SUPERADMIN_EMAIL matches
  // the user's email at login/register time.
  role: text("role").notNull().default("user"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
