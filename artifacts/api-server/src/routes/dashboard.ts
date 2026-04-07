import { Router, type IRouter } from "express";
import { eq, sql, and } from "drizzle-orm";
import { db, ticketsTable, usersTable, activityLogTable } from "@workspace/db";
import { GetRecentActivityQueryParams } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/session";

const router: IRouter = Router();

router.get("/dashboard/stats", requireAuth, async (_req, res): Promise<void> => {
  const [totalTickets] = await db.select({ count: sql<number>`count(*)::int` }).from(ticketsTable);
  const [openTickets] = await db.select({ count: sql<number>`count(*)::int` }).from(ticketsTable).where(eq(ticketsTable.status, "open"));
  const [inProgressTickets] = await db.select({ count: sql<number>`count(*)::int` }).from(ticketsTable).where(eq(ticketsTable.status, "in_progress"));
  const [pendingTickets] = await db.select({ count: sql<number>`count(*)::int` }).from(ticketsTable).where(eq(ticketsTable.status, "pending"));
  const [resolvedTickets] = await db.select({ count: sql<number>`count(*)::int` }).from(ticketsTable).where(eq(ticketsTable.status, "resolved"));
  const [closedTickets] = await db.select({ count: sql<number>`count(*)::int` }).from(ticketsTable).where(eq(ticketsTable.status, "closed"));
  const [criticalTickets] = await db.select({ count: sql<number>`count(*)::int` }).from(ticketsTable).where(eq(ticketsTable.priority, "critical"));
  const [totalUsers] = await db.select({ count: sql<number>`count(*)::int` }).from(usersTable);
  const [totalTechnicians] = await db.select({ count: sql<number>`count(*)::int` }).from(usersTable).where(eq(usersTable.role, "technician"));

  const [avgResolution] = await db
    .select({
      avg: sql<number | null>`
        EXTRACT(EPOCH FROM AVG(resolved_at - created_at)) / 3600
      `,
    })
    .from(ticketsTable)
    .where(and(sql`resolved_at IS NOT NULL`, eq(ticketsTable.status, "resolved")));

  res.json({
    totalTickets: totalTickets.count,
    openTickets: openTickets.count,
    inProgressTickets: inProgressTickets.count,
    pendingTickets: pendingTickets.count,
    resolvedTickets: resolvedTickets.count,
    closedTickets: closedTickets.count,
    criticalTickets: criticalTickets.count,
    avgResolutionTimeHours: avgResolution?.avg ?? null,
    totalUsers: totalUsers.count,
    totalTechnicians: totalTechnicians.count,
  });
});

router.get("/dashboard/recent-activity", requireAuth, async (req, res): Promise<void> => {
  const params = GetRecentActivityQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const limit = params.data.limit ?? 10;

  const activities = await db
    .select({
      id: activityLogTable.id,
      ticketId: activityLogTable.ticketId,
      ticketTitle: ticketsTable.title,
      action: activityLogTable.action,
      actorName: usersTable.name,
      createdAt: activityLogTable.createdAt,
    })
    .from(activityLogTable)
    .leftJoin(ticketsTable, eq(activityLogTable.ticketId, ticketsTable.id))
    .leftJoin(usersTable, eq(activityLogTable.actorId, usersTable.id))
    .orderBy(sql`${activityLogTable.createdAt} DESC`)
    .limit(limit);

  res.json(
    activities.map((a) => ({
      id: a.id,
      ticketId: a.ticketId,
      ticketTitle: a.ticketTitle ?? "Unknown ticket",
      action: a.action,
      actorName: a.actorName ?? "System",
      createdAt: a.createdAt,
    }))
  );
});

router.get("/dashboard/technician-performance", requireAuth, async (_req, res): Promise<void> => {
  const technicians = await db.select().from(usersTable).where(eq(usersTable.role, "technician"));

  const performance = await Promise.all(
    technicians.map(async (tech) => {
      const [assigned] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(ticketsTable)
        .where(eq(ticketsTable.assigneeId, tech.id));

      const [resolved] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(ticketsTable)
        .where(and(eq(ticketsTable.assigneeId, tech.id), eq(ticketsTable.status, "resolved")));

      const [avg] = await db
        .select({
          avg: sql<number | null>`EXTRACT(EPOCH FROM AVG(resolved_at - created_at)) / 3600`,
        })
        .from(ticketsTable)
        .where(and(eq(ticketsTable.assigneeId, tech.id), sql`resolved_at IS NOT NULL`));

      return {
        technicianId: tech.id,
        technicianName: tech.name,
        assignedTickets: assigned.count,
        resolvedTickets: resolved.count,
        avgResolutionTimeHours: avg?.avg ?? null,
      };
    })
  );

  res.json(performance);
});

router.get("/dashboard/tickets-by-category", requireAuth, async (_req, res): Promise<void> => {
  const results = await db
    .select({
      category: ticketsTable.category,
      count: sql<number>`count(*)::int`,
    })
    .from(ticketsTable)
    .groupBy(ticketsTable.category);

  res.json(results);
});

router.get("/dashboard/tickets-by-priority", requireAuth, async (_req, res): Promise<void> => {
  const results = await db
    .select({
      priority: ticketsTable.priority,
      count: sql<number>`count(*)::int`,
    })
    .from(ticketsTable)
    .groupBy(ticketsTable.priority);

  res.json(results);
});

export default router;
