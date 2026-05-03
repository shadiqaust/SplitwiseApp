import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import currenciesRouter from "./currencies";
import usersRouter from "./users";
import groupsRouter from "./groups";
import expensesRouter from "./expenses";
import paymentsRouter from "./payments";
import dashboardRouter from "./dashboard";
import friendsRouter from "./friends";
import storageRouter from "./storage";
import notificationsRouter from "./notifications";
import devicesRouter from "./devices";
import adminRouter from "./admin";
import adminSmtpRouter from "./admin-smtp";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(currenciesRouter);
router.use(usersRouter);
router.use(groupsRouter);
router.use(expensesRouter);
router.use(paymentsRouter);
router.use(dashboardRouter);
router.use(friendsRouter);
router.use(storageRouter);
router.use(notificationsRouter);
router.use(devicesRouter);
router.use(adminRouter);
router.use(adminSmtpRouter);

export default router;
