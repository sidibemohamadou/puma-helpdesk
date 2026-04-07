import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { ticketsTable } from "./tickets";
import { usersTable } from "./users";

export const activityLogTable = pgTable("activity_log", {
  id: serial("id").primaryKey(),
  ticketId: integer("ticket_id").notNull().references(() => ticketsTable.id, { onDelete: "cascade" }),
  actorId: integer("actor_id").references(() => usersTable.id),
  action: text("action").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ActivityLog = typeof activityLogTable.$inferSelect;
