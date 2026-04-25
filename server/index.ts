import path from "node:path";

import express, { type NextFunction, type Request, type Response } from "express";

import { config } from "../app/config";
import { sql } from "../app/db";
import { apiRouter } from "./routes";

const app = express();

app.use(express.json({ limit: "2mb" }));

// Dashboard — served from /public at the root. The static middleware looks
// up index.html for "/" automatically, so no explicit handler needed.
app.use(express.static(path.resolve(import.meta.dir, "..", "public")));

app.get("/health", async (_req, res) => {
  try {
    await sql`SELECT 1`;
    res.json({ status: "ok", db: "ok" });
  } catch (err) {
    res.status(503).json({ status: "degraded", db: String(err) });
  }
});

app.use("/api", apiRouter);

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error("unhandled error:", err);
  res.status(500).json({ error: "internal_error", message: err.message });
});

const server = app.listen(config.port, () => {
  console.log(`server listening on :${config.port}`);
});

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    console.log(`received ${sig}, shutting down`);
    server.close(async () => {
      await sql.end({ timeout: 5 });
      process.exit(0);
    });
  });
}
