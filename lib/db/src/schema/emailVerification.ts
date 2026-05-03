import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// Stores tokens emailed to users to confirm their address.
// We store the SHA-256 *hash* of the token (never the token itself) so a DB
// dump can't be replayed. Tokens are single-use (`usedAt`) and expire after
// 24 hours by convention.
export const emailVerificationTokensTable = pgTable("email_verification_tokens", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type EmailVerificationToken =
  typeof emailVerificationTokensTable.$inferSelect;
