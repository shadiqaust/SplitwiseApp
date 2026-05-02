import { pgTable, uuid, text, timestamp, numeric, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { groupsTable } from "./groups";

export const splitTypeEnum = ["equal", "exact", "percentage"] as const;

export const expensesTable = pgTable("expenses", {
  id: uuid("id").defaultRandom().primaryKey(),
  // Nullable: when null, the expense is a non-group expense between two friends
  // (validated at the API layer). When set, it belongs to the referenced group.
  groupId: uuid("group_id").references(() => groupsTable.id, {
    onDelete: "cascade",
  }),
  description: text("description").notNull(),
  category: text("category"),
  totalAmount: numeric("total_amount", { precision: 12, scale: 2 }).notNull(),
  currency: text("currency").notNull().default("USD"),
  splitType: text("split_type").notNull().default("equal"),
  paidByUserId: uuid("paid_by_user_id")
    .notNull()
    .references(() => usersTable.id),
  date: date("date").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const expenseSplitsTable = pgTable("expense_splits", {
  id: uuid("id").defaultRandom().primaryKey(),
  expenseId: uuid("expense_id")
    .notNull()
    .references(() => expensesTable.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => usersTable.id),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  percentage: numeric("percentage", { precision: 5, scale: 2 }),
});

export const expenseCommentsTable = pgTable("expense_comments", {
  id: uuid("id").defaultRandom().primaryKey(),
  expenseId: uuid("expense_id")
    .notNull()
    .references(() => expensesTable.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => usersTable.id),
  body: text("body").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertExpenseSchema = createInsertSchema(expensesTable).omit({ id: true, createdAt: true });
export const insertExpenseSplitSchema = createInsertSchema(expenseSplitsTable).omit({ id: true });
export const insertExpenseCommentSchema = createInsertSchema(expenseCommentsTable).omit({ id: true, createdAt: true });

export type InsertExpense = z.infer<typeof insertExpenseSchema>;
export type InsertExpenseSplit = z.infer<typeof insertExpenseSplitSchema>;
export type InsertExpenseComment = z.infer<typeof insertExpenseCommentSchema>;
export type Expense = typeof expensesTable.$inferSelect;
export type ExpenseSplit = typeof expenseSplitsTable.$inferSelect;
export type ExpenseComment = typeof expenseCommentsTable.$inferSelect;
