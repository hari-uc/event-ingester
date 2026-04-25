import type { Request, Response } from "express";

import { EventIngestBody } from "../../app/schemas";
import { sendBatch } from "../../app/sqs";

export async function ingest(req: Request, res: Response) {
  const parsed = EventIngestBody.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: "validation_failed", issues: parsed.error.issues });
  }

  const list = Array.isArray(parsed.data) ? parsed.data : [parsed.data];
  if (list.length === 0) {
    return res.status(400).json({ error: "empty_event_list" });
  }

  let accepted = 0;
  for (let i = 0; i < list.length; i += 10) {
    const chunk = list.slice(i, i + 10);
    const { failed } = await sendBatch(chunk);
    if (failed.length > 0) {
      return res.status(502).json({
        error: "sqs_partial_failure",
        failed,
        accepted_so_far: accepted + chunk.length - failed.length,
      });
    }
    accepted += chunk.length;
  }

  return res.status(202).json({ accepted, message: "queued" });
}
