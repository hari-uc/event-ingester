import { Router } from "express";

import { eventsRouter } from "./events";
import { reconciliationRouter } from "./reconciliation";
import { transactionsRouter } from "./transactions";

export const apiRouter = Router();

apiRouter.use("/events", eventsRouter);
apiRouter.use("/transactions", transactionsRouter);
apiRouter.use("/reconciliation", reconciliationRouter);
