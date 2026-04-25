import { Router } from "express";

import { getById, list } from "../controllers/transactions";

export const transactionsRouter = Router();

transactionsRouter.get("/", list);
transactionsRouter.get("/:id", getById);
