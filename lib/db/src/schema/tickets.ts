import { pgTable, text, serial, timestamp, integer, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const categoryEnum = pgEnum("category", ["network", "hardware", "software", "security", "other"]);
export const priorityEnum = pgEnum("priority", ["low", "medium", "high", "critical"]);
export const statusEnum = pgEnum("status", ["open", "in_progress", "pending", "resolved", "closed"]);

export const ticketsTable = pgTable("tickets", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  category: categoryEnum("category").notNull(),
  priority: priorityEnum("priority").notNull(),
  status: statusEnum("status").notNull().default("open"),
  createdById: integer("created_by_id").notNull().references(() => usersTable.id),
  assigneeId: integer("assignee_id").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
});

export const insertTicketSchema = createInsertSchema(ticketsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTicket = z.infer<typeof insertTicketSchema>;
export type Ticket = typeof ticketsTable.$inferSelect;
