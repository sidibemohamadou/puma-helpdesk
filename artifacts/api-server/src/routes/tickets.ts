import { Router, type IRouter } from "express";
import { eq, and, sql, like, or, inArray } from "drizzle-orm";
import { db, ticketsTable, usersTable, commentsTable, activityLogTable, notificationsTable } from "@workspace/db";
import {
  CreateTicketBody,
  UpdateTicketBody,
  GetTicketParams,
  UpdateTicketParams,
  DeleteTicketParams,
  ListTicketsQueryParams,
  CreateCommentBody,
  ListCommentsParams,
  CreateCommentParams,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/session";
import { broadcastToRoles, sendToUser } from "../lib/sse";

const router: IRouter = Router();

async function logActivity(ticketId: number, actorId: number, action: string) {
  await db.insert(activityLogTable).values({ ticketId, actorId, action });
}

async function notifyStaff(
  ticketId: number,
  type: "new_ticket" | "ticket_assigned" | "status_changed" | "comment_added",
  message: string,
  targetUserIds?: number[],
): Promise<void> {
  let userIds: number[] = targetUserIds ?? [];

  if (!targetUserIds) {
    const staffUsers = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(inArray(usersTable.role, ["technician", "admin"]));
    userIds = staffUsers.map((u) => u.id);
  }

  if (userIds.length === 0) return;

  await db.insert(notificationsTable).values(
    userIds.map((userId) => ({ userId, ticketId, type, message })),
  );
}

async function getTicketWithRelations(ticketId: number) {
  const [ticket] = await db.select().from(ticketsTable).where(eq(ticketsTable.id, ticketId));
  if (!ticket) return null;

  const [createdBy] = await db.select().from(usersTable).where(eq(usersTable.id, ticket.createdById));
  const assignee = ticket.assigneeId
    ? (await db.select().from(usersTable).where(eq(usersTable.id, ticket.assigneeId)))[0]
    : null;

  const safeUser = (u: typeof usersTable.$inferSelect) => {
    const { passwordHash: _ph, ...rest } = u;
    return rest;
  };

  return {
    ...ticket,
    createdBy: safeUser(createdBy),
    assignee: assignee ? safeUser(assignee) : null,
  };
}

router.get("/tickets", requireAuth, async (req, res): Promise<void> => {
  const params = ListTicketsQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const { status, priority, category, assigneeId, createdById, search, page = 1, limit = 20 } = params.data;

  const conditions = [];
  if (status) conditions.push(eq(ticketsTable.status, status));
  if (priority) conditions.push(eq(ticketsTable.priority, priority));
  if (category) conditions.push(eq(ticketsTable.category, category));
  if (assigneeId) conditions.push(eq(ticketsTable.assigneeId, assigneeId));
  if (createdById) conditions.push(eq(ticketsTable.createdById, createdById));
  if (search) {
    conditions.push(
      or(
        like(ticketsTable.title, `%${search}%`),
        like(ticketsTable.description, `%${search}%`),
      )
    );
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [countResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(ticketsTable)
    .where(whereClause);

  const total = countResult?.count ?? 0;
  const offset = (page - 1) * limit;

  const tickets = await db
    .select()
    .from(ticketsTable)
    .where(whereClause)
    .orderBy(sql`${ticketsTable.createdAt} DESC`)
    .limit(limit)
    .offset(offset);

  const safeUser = (u: typeof usersTable.$inferSelect) => {
    const { passwordHash: _ph, ...rest } = u;
    return rest;
  };

  const enrichedTickets = await Promise.all(
    tickets.map(async (ticket) => {
      const [createdBy] = await db.select().from(usersTable).where(eq(usersTable.id, ticket.createdById));
      const assignee = ticket.assigneeId
        ? (await db.select().from(usersTable).where(eq(usersTable.id, ticket.assigneeId)))[0]
        : null;
      return {
        ...ticket,
        createdBy: safeUser(createdBy),
        assignee: assignee ? safeUser(assignee) : null,
      };
    })
  );

  res.json({
    tickets: enrichedTickets,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  });
});

router.post("/tickets", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateTicketBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const userId = req.session.userId!;
  const [ticket] = await db
    .insert(ticketsTable)
    .values({ ...parsed.data, createdById: userId })
    .returning();

  await logActivity(ticket.id, userId, "Ticket created");

  const enriched = await getTicketWithRelations(ticket.id);

  const creator = enriched?.createdBy?.name ?? "Un agent";
  const notifMessage = `Nouveau ticket #${ticket.id.toString().padStart(4, "0")} — "${ticket.title}" soumis par ${creator}`;

  await notifyStaff(ticket.id, "new_ticket", notifMessage);

  const ssePayload = {
    ticketId: ticket.id,
    title: ticket.title,
    priority: ticket.priority,
    category: ticket.category,
    createdBy: creator,
    message: notifMessage,
    timestamp: new Date().toISOString(),
  };
  broadcastToRoles(["technician", "admin"], "new_ticket", ssePayload);

  if (parsed.data.assigneeId) {
    const assignMsg = `Ticket #${ticket.id.toString().padStart(4, "0")} — "${ticket.title}" vous a été assigné`;
    await notifyStaff(ticket.id, "ticket_assigned", assignMsg, [parsed.data.assigneeId]);
    sendToUser(parsed.data.assigneeId, "ticket_assigned", { ticketId: ticket.id, title: ticket.title, message: assignMsg });
  }

  res.status(201).json(enriched);
});

router.get("/tickets/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetTicketParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const ticket = await getTicketWithRelations(params.data.id);
  if (!ticket) {
    res.status(404).json({ error: "Ticket not found" });
    return;
  }

  const safeUser = (u: typeof usersTable.$inferSelect) => {
    const { passwordHash: _ph, ...rest } = u;
    return rest;
  };

  const comments = await db
    .select()
    .from(commentsTable)
    .where(eq(commentsTable.ticketId, params.data.id))
    .orderBy(commentsTable.createdAt);

  const enrichedComments = await Promise.all(
    comments.map(async (comment) => {
      const [author] = await db.select().from(usersTable).where(eq(usersTable.id, comment.authorId));
      return { ...comment, author: safeUser(author) };
    })
  );

  res.json({ ...ticket, comments: enrichedComments });
});

router.patch("/tickets/:id", requireAuth, async (req, res): Promise<void> => {
  const params = UpdateTicketParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateTicketBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db.select().from(ticketsTable).where(eq(ticketsTable.id, params.data.id));
  if (!existing) {
    res.status(404).json({ error: "Ticket not found" });
    return;
  }

  const userId = req.session.userId!;
  const updateData: Partial<typeof ticketsTable.$inferInsert> = { ...parsed.data };

  if (parsed.data.status === "resolved" && existing.status !== "resolved") {
    updateData.resolvedAt = new Date();
  } else if (parsed.data.status && parsed.data.status !== "resolved") {
    updateData.resolvedAt = undefined;
  }

  const [ticket] = await db
    .update(ticketsTable)
    .set(updateData)
    .where(eq(ticketsTable.id, params.data.id))
    .returning();

  const changes = [];
  if (parsed.data.status && parsed.data.status !== existing.status) {
    changes.push(`Statut changé en ${parsed.data.status}`);
  }
  if (parsed.data.assigneeId !== undefined && parsed.data.assigneeId !== existing.assigneeId) {
    changes.push(`Assigné mis à jour`);
  }
  if (changes.length > 0) {
    await logActivity(ticket.id, userId, changes.join(", "));
  }

  if (parsed.data.assigneeId !== undefined && parsed.data.assigneeId !== existing.assigneeId && parsed.data.assigneeId !== null) {
    const assignMsg = `Ticket #${ticket.id.toString().padStart(4, "0")} — "${existing.title}" vous a été assigné`;
    await notifyStaff(ticket.id, "ticket_assigned", assignMsg, [parsed.data.assigneeId]);
    sendToUser(parsed.data.assigneeId, "ticket_assigned", {
      ticketId: ticket.id,
      title: existing.title,
      message: assignMsg,
      timestamp: new Date().toISOString(),
    });
  }

  const enriched = await getTicketWithRelations(ticket.id);
  res.json(enriched);
});

router.delete("/tickets/:id", requireAuth, async (req, res): Promise<void> => {
  const params = DeleteTicketParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [ticket] = await db
    .delete(ticketsTable)
    .where(eq(ticketsTable.id, params.data.id))
    .returning();

  if (!ticket) {
    res.status(404).json({ error: "Ticket not found" });
    return;
  }

  res.json({ success: true, message: "Ticket deleted" });
});

router.get("/tickets/:id/comments", requireAuth, async (req, res): Promise<void> => {
  const params = ListCommentsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const safeUser = (u: typeof usersTable.$inferSelect) => {
    const { passwordHash: _ph, ...rest } = u;
    return rest;
  };

  const comments = await db
    .select()
    .from(commentsTable)
    .where(eq(commentsTable.ticketId, params.data.id))
    .orderBy(commentsTable.createdAt);

  const enriched = await Promise.all(
    comments.map(async (comment) => {
      const [author] = await db.select().from(usersTable).where(eq(usersTable.id, comment.authorId));
      return { ...comment, author: safeUser(author) };
    })
  );

  res.json(enriched);
});

router.post("/tickets/:id/comments", requireAuth, async (req, res): Promise<void> => {
  const params = CreateCommentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = CreateCommentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const userId = req.session.userId!;
  const [comment] = await db
    .insert(commentsTable)
    .values({
      ticketId: params.data.id,
      authorId: userId,
      content: parsed.data.content,
      isInternal: parsed.data.isInternal ?? false,
    })
    .returning();

  await logActivity(params.data.id, userId, `Comment added`);

  const safeUser = (u: typeof usersTable.$inferSelect) => {
    const { passwordHash: _ph, ...rest } = u;
    return rest;
  };

  const [author] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  res.status(201).json({ ...comment, author: safeUser(author) });
});

export default router;
