import { Router } from "express";

import { discrepancies, summary } from "../controllers/reconciliation";

export const reconciliationRouter = Router();

reconciliationRouter.get("/summary", summary);
reconciliationRouter.get("/discrepancies", discrepancies);
