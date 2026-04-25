import type { Sql } from "./db";
import { EventIn } from "./schemas";

export async function processEvent(
  sql: Sql,
  raw: unknown,
): Promise<boolean> {
  const evt = EventIn.parse(raw);

  return await sql.begin(async (tx) => {
    const inserted = await tx`
      INSERT INTO events (
        event_id, event_type, transaction_id, merchant_id,
        amount, currency, event_timestamp, payload
      ) VALUES (
        ${evt.event_id}, ${evt.event_type}, ${evt.transaction_id}, ${evt.merchant_id},
        ${evt.amount}, ${evt.currency}, ${evt.timestamp}, ${tx.json(raw as never)}
      )
      ON CONFLICT (event_id) DO NOTHING
      RETURNING event_id
    `;
    if (inserted.length === 0) return false;

    const merchantName = evt.merchant_name ?? evt.merchant_id;
    await tx`
      INSERT INTO merchants (id, name)
      VALUES (${evt.merchant_id}, ${merchantName})
      ON CONFLICT (id) DO NOTHING
    `;

    switch (evt.event_type) {
      case "payment_initiated":
        await tx`
          INSERT INTO transactions (
            id, merchant_id, amount, currency,
            payment_status, initiated_at, updated_at
          ) VALUES (
            ${evt.transaction_id}, ${evt.merchant_id}, ${evt.amount}, ${evt.currency},
            'initiated', ${evt.timestamp}, now()
          )
          ON CONFLICT (id) DO UPDATE SET
            initiated_at = COALESCE(transactions.initiated_at, EXCLUDED.initiated_at),
            updated_at   = now()
        `;
        break;

      case "payment_processed":
        await tx`
          INSERT INTO transactions (
            id, merchant_id, amount, currency,
            payment_status, processed_at, updated_at
          ) VALUES (
            ${evt.transaction_id}, ${evt.merchant_id}, ${evt.amount}, ${evt.currency},
            'processed', ${evt.timestamp}, now()
          )
          ON CONFLICT (id) DO UPDATE SET
            payment_status = CASE
              WHEN transactions.payment_status = 'initiated' THEN 'processed'::payment_status_enum
              ELSE transactions.payment_status
            END,
            processed_at = COALESCE(transactions.processed_at, EXCLUDED.processed_at),
            updated_at   = now()
        `;
        break;

      case "payment_failed":
        await tx`
          INSERT INTO transactions (
            id, merchant_id, amount, currency,
            payment_status, failed_at, updated_at
          ) VALUES (
            ${evt.transaction_id}, ${evt.merchant_id}, ${evt.amount}, ${evt.currency},
            'failed', ${evt.timestamp}, now()
          )
          ON CONFLICT (id) DO UPDATE SET
            payment_status = CASE
              WHEN transactions.payment_status = 'initiated' THEN 'failed'::payment_status_enum
              ELSE transactions.payment_status
            END,
            failed_at  = COALESCE(transactions.failed_at, EXCLUDED.failed_at),
            updated_at = now()
        `;
        break;

      case "settled":
        await tx`
          INSERT INTO transactions (
            id, merchant_id, amount, currency,
            payment_status, settlement_status, settled_at, updated_at
          ) VALUES (
            ${evt.transaction_id}, ${evt.merchant_id}, ${evt.amount}, ${evt.currency},
            'initiated', 'settled', ${evt.timestamp}, now()
          )
          ON CONFLICT (id) DO UPDATE SET
            settlement_status = 'settled',
            settled_at = COALESCE(transactions.settled_at, EXCLUDED.settled_at),
            updated_at = now()
        `;
        break;
    }

    return true;
  });
}
