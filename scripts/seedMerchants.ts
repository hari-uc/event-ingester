/**
 * Seed the merchants table by scanning sample_events.json.
 */
import { readFileSync } from "node:fs";

import { sql } from "../app/db";

const path = process.argv[2] ?? "sample_events.json";
const events = JSON.parse(readFileSync(path, "utf-8")) as {
  merchant_id: string;
  merchant_name?: string;
}[];

const merchants = new Map<string, string>();
for (const e of events) {
  if (!merchants.has(e.merchant_id)) {
    merchants.set(e.merchant_id, e.merchant_name ?? e.merchant_id);
  }
}

for (const [id, name] of merchants) {
  await sql`
    INSERT INTO merchants (id, name)
    VALUES (${id}, ${name})
    ON CONFLICT (id) DO NOTHING
  `;
}

console.log(`seeded ${merchants.size} merchants: ${[...merchants.keys()].sort().join(", ")}`);
await sql.end({ timeout: 5 });
