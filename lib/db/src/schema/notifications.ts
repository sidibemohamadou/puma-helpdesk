import { pgTable, serial, integer, text, boolean, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { ticketsTable } from "./tickets";

export const notificationTypeEnum = pgEnum("notification_type", [
  "new_ticket",
  "ticket_assigned",
  "status_changed",
  "comment_added",
]);

export const notificationsTable = pgTable("notifications", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  ticketId: integer("ticket_id").references(() => ticketsTable.id, { onDelete: "cascade" }),
  type: notificationTypeEnum("type").notNull(),
  message: text("message").notNull(),
  isRead: boolean("is_read").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
