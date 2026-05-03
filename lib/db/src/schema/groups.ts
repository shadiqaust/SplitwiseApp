import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { currenciesTable } from "./currencies";

export const groupsTable = pgTable("groups", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  category: text("category"),
  avatarUrl: text("avatar_url"),
  currency: text("currency")
    .notNull()
    .default("USD")
    .references(() => currenciesTable.code),
  inviteCode: text("invite_code").unique(),
  createdByUserId: uuid("created_by_user_id")
    .notNull()
    .references(() => usersTable.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  deletedAt: timestamp("deleted_at"),
});

export const groupMembersTable = pgTable("group_members", {
  id: uuid("id").defaultRandom().primaryKey(),
  groupId: uuid("group_id")
    .notNull()
    .references(() => groupsTable.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => usersTable.id),
  joinedAt: timestamp("joined_at").notNull().defaultNow(),
  deletedAt: timestamp("deleted_at"),
});

export const insertGroupSchema = createInsertSchema(groupsTable).omit({ id: true, createdAt: true });
export const insertGroupMemberSchema = createInsertSchema(groupMembersTable).omit({ id: true, joinedAt: true });

export type InsertGroup = z.infer<typeof insertGroupSchema>;
export type InsertGroupMember = z.infer<typeof insertGroupMemberSchema>;
export type Group = typeof groupsTable.$inferSelect;
export type GroupMember = typeof groupMembersTable.$inferSelect;
