import { pgTable, uuid, timestamp, unique } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const friendshipsTable = pgTable(
  "friendships",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    friendId: uuid("friend_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [unique("friendships_unique").on(t.userId, t.friendId)],
);

export type Friendship = typeof friendshipsTable.$inferSelect;
