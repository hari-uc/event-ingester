import { config } from "../app/config";
import { sql } from "../app/db";
import { receive, deleteBatch } from "../app/sqs";
import { processEvent } from "../app/processor";
import type { Message } from "@aws-sdk/client-sqs";

let shutdown = false;
for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    console.log(`received ${sig}, draining`);
    shutdown = true;
  });
}

async function handle(msg: Message): Promise<boolean> {
  if (!msg.Body) return true;

  let body: unknown;
  try {
    body = JSON.parse(msg.Body);
  } catch {
    console.error(`malformed body, dropping: ${msg.MessageId}`);
    return true;
  }

  try {
    const applied = await processEvent(sql, body);
    const b = body as Record<string, unknown>;
    console.log(
      `${applied ? "applied" : "duplicate"} event_id=${b.event_id} type=${b.event_type} txn=${b.transaction_id}`,
    );
    return true;
  } catch (err) {
    console.error(`processing failed for ${msg.MessageId}:`, err);
    return false;
  }
}

async function run() {
  if (!config.queueUrl) {
    console.error("INGESTER_FIFO_QUEUE_URL is not set");
    process.exit(1);
  }
  console.log(`worker starting queue=${config.queueUrl}`);

  while (!shutdown) {
    let messages: Message[];
    try {
      messages = await receive(
        config.worker.batchSize,
        config.worker.waitSeconds,
        config.worker.visibilityTimeout,
      );
    } catch (err) {
      console.error("receive failed, backing off:", err);
      await new Promise((r) => setTimeout(r, 5000));
      continue;
    }

    if (messages.length === 0) continue;

    const toDelete: { Id: string; ReceiptHandle: string }[] = [];
    for (const m of messages) {
      const ok = await handle(m);
      if (ok && m.MessageId && m.ReceiptHandle) {
        toDelete.push({ Id: m.MessageId, ReceiptHandle: m.ReceiptHandle });
      }
    }

    if (toDelete.length > 0) {
      try {
        await deleteBatch(toDelete);
      } catch (err) {
        console.error("deleteBatch failed, messages will be redelivered:", err);
      }
    }
  }

  await sql.end({ timeout: 5 });
  console.log("worker stopped");
}

run();
