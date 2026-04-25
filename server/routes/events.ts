import { Router } from "express";

import { ingest } from "../controllers/events";

export const eventsRouter = Router();

eventsRouter.post("/", ingest);
