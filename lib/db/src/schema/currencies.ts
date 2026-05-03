import { pgTable, text, integer } from "drizzle-orm/pg-core";

export const currenciesTable = pgTable("currencies", {
  code: text("code").primaryKey(),
  name: text("name").notNull(),
  symbol: text("symbol").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
});

export type Currency = typeof currenciesTable.$inferSelect;
export type InsertCurrency = typeof currenciesTable.$inferInsert;
