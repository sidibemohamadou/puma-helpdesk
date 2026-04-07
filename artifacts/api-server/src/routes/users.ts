import { Router, type IRouter } from "express";
import { eq, like, or, sql, and, inArray } from "drizzle-orm";
import { db, usersTable, ticketsTable } from "@workspace/db";
import {
  CreateUserBody,
  UpdateUserBody,
  GetUserParams,
  UpdateUserParams,
  DeleteUserParams,
  ListUsersQueryParams,
} from "@workspace/api-zod";
import { hashPassword } from "../lib/auth";
import { requireAuth } from "../middlewares/session";

const router: IRouter = Router();

function safeUser(user: typeof usersTable.$inferSelect) {
  const { passwordHash: _ph, ...rest } = user;
  return rest;
}

router.get("/users", requireAuth, async (req, res): Promise<void> => {
  const params = ListUsersQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const { role, search } = params.data;

  let query = db.select().from(usersTable).$dynamic();

  if (role) {
    query = query.where(eq(usersTable.role, role));
  }

  if (search) {
    query = query.where(
      or(
        like(usersTable.name, `%${search}%`),
        like(usersTable.email, `%${search}%`),
      )
    );
  }

  const users = await query.orderBy(usersTable.createdAt);
  res.json(users.map(safeUser));
});

router.post("/users", requireAuth, async (req, res): Promise<void> => {
  const currentUserId = req.session.userId!;
  const [currentUser] = await db.select().from(usersTable).where(eq(usersTable.id, currentUserId));
  if (!currentUser || currentUser.role !== "admin") {
    res.status(403).json({ error: "Forbidden", message: "Admin access required" });
    return;
  }

  const parsed = CreateUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { password, ...rest } = parsed.data;
  const passwordHash = hashPassword(password);

  const [user] = await db
    .insert(usersTable)
    .values({ ...rest, passwordHash })
    .returning();

  res.status(201).json(safeUser(user));
});

router.get("/users/workload", requireAuth, async (_req, res): Promise<void> => {
  const technicians = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
    })
    .from(usersTable)
    .where(eq(usersTable.role, "technician"));

  const workloads = await Promise.all(
    technicians.map(async (tech) => {
      const [result] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(ticketsTable)
        .where(
          and(
            eq(ticketsTable.assigneeId, tech.id),
            inArray(ticketsTable.status, ["open", "in_progress", "pending"]),
          ),
        );
      return {
        id: tech.id,
        name: tech.name,
        email: tech.email,
        openTickets: result?.count ?? 0,
      };
    }),
  );

  res.json(workloads.sort((a, b) => a.openTickets - b.openTickets));
});

router.get("/users/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetUserParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, params.data.id));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json(safeUser(user));
});

router.patch("/users/:id", requireAuth, async (req, res): Promise<void> => {
  const currentUserId = req.session.userId!;
  const [currentUser] = await db.select().from(usersTable).where(eq(usersTable.id, currentUserId));
  if (!currentUser || currentUser.role !== "admin") {
    res.status(403).json({ error: "Forbidden", message: "Admin access required" });
    return;
  }

  const params = UpdateUserParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updateData: Partial<typeof usersTable.$inferInsert> = {};
  const { password, ...rest } = parsed.data;

  Object.assign(updateData, rest);
  if (password) {
    updateData.passwordHash = hashPassword(password);
  }

  const [user] = await db
    .update(usersTable)
    .set(updateData)
    .where(eq(usersTable.id, params.data.id))
    .returning();

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json(safeUser(user));
});

router.delete("/users/:id", requireAuth, async (req, res): Promise<void> => {
  const currentUserId = req.session.userId!;
  const [currentUser] = await db.select().from(usersTable).where(eq(usersTable.id, currentUserId));
  if (!currentUser || currentUser.role !== "admin") {
    res.status(403).json({ error: "Forbidden", message: "Admin access required" });
    return;
  }

  const params = DeleteUserParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [user] = await db
    .delete(usersTable)
    .where(eq(usersTable.id, params.data.id))
    .returning();

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json({ success: true, message: "User deleted" });
});

export { router as usersRouter };
export default router;
