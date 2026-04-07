import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import usersRouter from "./users";
import ticketsRouter from "./tickets";
import dashboardRouter from "./dashboard";
import notificationsRouter from "./notifications";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(usersRouter);
router.use(ticketsRouter);
router.use(dashboardRouter);
router.use(notificationsRouter);

export default router;
