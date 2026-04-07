import { Router, type IRouter, type Request, type Response } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db, notificationsTable, usersTable } from "@workspace/db";
import { requireAuth } from "../middlewares/session";
import { addSSEClient, removeSSEClient } from "../lib/sse";

const router: IRouter = Router();

router.get("/notifications/stream", requireAuth, (req: Request, res: Response): void => {
  const userId = req.session.userId!;

  const [user] = (req as any).__user ? [(req as any).__user] : [];
  const role = user?.role ?? "agent";

  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
    "Access-Control-Allow-Origin": "*",
  });
  res.flushHeaders();
  res.write(": connected\n\n");

  const fetchRole = async () => {
    const [u] = await db.select({ role: usersTable.role }).from(usersTable).where(eq(usersTable.id, userId));
    return u?.role ?? "agent";
  };

  fetchRole().then((r) => {
    addSSEClient(userId, r, res);
  });

  const heartbeat = setInterval(() => {
    try {
      res.write(": heartbeat\n\n");
    } catch {
      clearInterval(heartbeat);
      removeSSEClient(userId);
    }
  }, 25000);

  req.on("close", () => {
    clearInterval(heartbeat);
    removeSSEClient(userId);
  });
});

router.get("/notifications", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const userId = req.session.userId!;
  const onlyUnread = req.query.unread === "true";

  const conditions = [eq(notificationsTable.userId, userId)];
  if (onlyUnread) {
    conditions.push(eq(notificationsTable.isRead, false));
  }

  const notifications = await db
    .select()
    .from(notificationsTable)
    .where(and(...conditions))
    .orderBy(desc(notificationsTable.createdAt))
    .limit(50);

  res.json(notifications);
});

router.patch("/notifications/read-all", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const userId = req.session.userId!;

  await db
    .update(notificationsTable)
    .set({ isRead: true })
    .where(and(eq(notificationsTable.userId, userId), eq(notificationsTable.isRead, false)));

  res.json({ success: true });
});

router.patch("/notifications/:id/read", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const notifId = parseInt(req.params.id);
  const userId = req.session.userId!;

  if (isNaN(notifId)) {
    res.status(400).json({ error: "Invalid notification ID" });
    return;
  }

  await db
    .update(notificationsTable)
    .set({ isRead: true })
    .where(and(eq(notificationsTable.id, notifId), eq(notificationsTable.userId, userId)));

  res.json({ success: true });
});

export default router;
