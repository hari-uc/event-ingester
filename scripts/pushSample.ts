/**
 * Push sample_events.json through the system.
 */
import { readFileSync } from "node:fs";

import { sendBatch } from "../app/sqs";

type RawEvent = { event_id: string; transaction_id: string; [k: string]: unknown };

function getArg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const file = getArg("--file") ?? "sample_events.json";
const url = getArg("--url") ?? "http://localhost:8000/api/events";
const batch = Number(getArg("--batch") ?? "10");
const limitArg = getArg("--limit");
const direct = process.argv.includes("--direct");

const all = JSON.parse(readFileSync(file, "utf-8")) as RawEvent[];
const events = limitArg ? all.slice(0, Number(limitArg)) : all;

console.log(`pushing ${events.length} events via ${direct ? "SQS" : url}`);
const t0 = Date.now();

for (let i = 0; i < events.length; i += batch) {
  const chunk = events.slice(i, i + batch);
  if (direct) {
    const { failed } = await sendBatch(chunk);
    if (failed.length > 0) {
      console.error("partial SQS failure:", failed);
      process.exit(1);
    }
  } else {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(chunk),
    });
    if (!resp.ok) {
      console.error(`HTTP ${resp.status}:`, (await resp.text()).slice(0, 400));
      process.exit(1);
    }
  }
  if ((i / batch) % 50 === 0) console.log(`  ${i + chunk.length}/${events.length}`);
}

console.log(`done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
