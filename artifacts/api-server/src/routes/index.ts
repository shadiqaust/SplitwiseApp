import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import usersRouter from "./users";
import groupsRouter from "./groups";
import expensesRouter from "./expenses";
import paymentsRouter from "./payments";
import dashboardRouter from "./dashboard";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(usersRouter);
router.use(groupsRouter);
router.use(expensesRouter);
router.use(paymentsRouter);
router.use(dashboardRouter);

export default router;
