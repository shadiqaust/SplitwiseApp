import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// Stores Expo push tokens (one or many per user — a user can have multiple
// devices). The token itself is the natural key, so we (userId, token) unique.
export const deviceTokensTable = pgTable(
  "device_tokens",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    platform: text("platform").notNull(), // 'ios' | 'android' | 'web'
    createdAt: timestamp("created_at").notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at").notNull().defaultNow(),
  },
  (table) => ({
    userIdx: index("device_tokens_user_idx").on(table.userId),
  }),
);

export type DeviceToken = typeof deviceTokensTable.$inferSelect;
export type InsertDeviceToken = typeof deviceTokensTable.$inferInsert;
