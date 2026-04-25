import type { Request, Response } from "express";

import { sql } from "../../app/db";

const GROUPS = new Set(["merchant", "date", "status"] as const);

function pickStr(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

function pickDate(v: unknown): Date | undefined {
  if (typeof v !== "string" || v.length === 0) return undefined;
  const d = new Date(v);
  return isNaN(d.getTime()) ? undefined : d;
}

export async function summary(req: Request, res: Response) {
  const groupByRaw = pickStr(req.query.group_by) ?? "merchant";
  if (!GROUPS.has(groupByRaw as never)) {
    return res.status(400).json({ error: "invalid_group_by" });
  }
  const groupBy = groupByRaw as "merchant" | "date" | "status";
  const start = pickDate(req.query.start);
  const end = pickDate(req.query.end);

  const conds: ReturnType<typeof sql>[] = [];
  if (start) conds.push(sql`updated_at >= ${start}`);
  if (end) conds.push(sql`updated_at < ${end}`);
  const whereFrag =
    conds.length === 0
      ? sql``
      : sql`WHERE ${conds.reduce((a, b) => sql`${a} AND ${b}`)}`;

  let rows;
  if (groupBy === "merchant") {
    rows = await sql`
      SELECT merchant_id AS key,
             COUNT(*)::int AS txn_count,
             COALESCE(SUM(amount), 0) AS total_amount,
             SUM(CASE WHEN payment_status    = 'processed' THEN 1 ELSE 0 END)::int AS processed,
             SUM(CASE WHEN payment_status    = 'failed'    THEN 1 ELSE 0 END)::int AS failed,
             SUM(CASE WHEN payment_status    = 'initiated' THEN 1 ELSE 0 END)::int AS initiated,
             SUM(CASE WHEN settlement_status = 'settled'   THEN 1 ELSE 0 END)::int AS settled,
             SUM(CASE WHEN settlement_status = 'pending'   THEN 1 ELSE 0 END)::int AS pending_settlement
      FROM transactions
      ${whereFrag}
      GROUP BY merchant_id
      ORDER BY key
    `;
  } else if (groupBy === "date") {
    rows = await sql`
      SELECT DATE(updated_at)::text AS key,
             COUNT(*)::int AS txn_count,
             COALESCE(SUM(amount), 0) AS total_amount,
             SUM(CASE WHEN payment_status    = 'processed' THEN 1 ELSE 0 END)::int AS processed,
             SUM(CASE WHEN payment_status    = 'failed'    THEN 1 ELSE 0 END)::int AS failed,
             SUM(CASE WHEN payment_status    = 'initiated' THEN 1 ELSE 0 END)::int AS initiated,
             SUM(CASE WHEN settlement_status = 'settled'   THEN 1 ELSE 0 END)::int AS settled,
             SUM(CASE WHEN settlement_status = 'pending'   THEN 1 ELSE 0 END)::int AS pending_settlement
      FROM transactions
      ${whereFrag}
      GROUP BY DATE(updated_at)
      ORDER BY key
    `;
  } else {
    rows = await sql`
      SELECT payment_status::text || '/' || settlement_status::text AS key,
             COUNT(*)::int AS txn_count,
             COALESCE(SUM(amount), 0) AS total_amount
      FROM transactions
      ${whereFrag}
      GROUP BY payment_status, settlement_status
      ORDER BY key
    `;
  }

  return res.json({
    group_by: groupBy,
    filters: { start: start ?? null, end: end ?? null },
    rows,
  });
}

/**
 * Discrepancy classification
 */
export async function discrepancies(req: Request, res: Response) {
  const merchantId = pickStr(req.query.merchant_id);
  const limit = Math.min(Math.max(Number(req.query.limit ?? 100), 1), 1000);
  const offset = Math.max(Number(req.query.offset ?? 0), 0);

  const merchantFilter = merchantId
    ? sql`AND t.merchant_id = ${merchantId}`
    : sql``;

  const rows = await sql`
    WITH event_flags AS (
      SELECT
        transaction_id,
        BOOL_OR(event_type = 'payment_processed') AS has_processed_evt,
        BOOL_OR(event_type = 'payment_failed')    AS has_failed_evt,
        BOOL_OR(event_type = 'settled')           AS has_settled_evt,
        COUNT(*) FILTER (WHERE event_type = 'settled')::int AS settled_count
      FROM events
      GROUP BY transaction_id
    )
    SELECT
      t.id, t.merchant_id, t.amount, t.currency,
      t.payment_status::text    AS payment_status,
      t.settlement_status::text AS settlement_status,
      t.initiated_at, t.processed_at, t.failed_at, t.settled_at,
      ARRAY_REMOVE(ARRAY[
        CASE WHEN t.settlement_status = 'settled' AND t.payment_status = 'failed'
             THEN 'settled_on_failed' END,
        CASE WHEN t.settlement_status = 'settled' AND t.processed_at IS NULL
                  AND t.payment_status <> 'failed'
             THEN 'settled_without_success' END,
        CASE WHEN f.has_processed_evt AND f.has_failed_evt
             THEN 'conflicting_payment_events' END
      ], NULL) AS reasons
    FROM transactions t
    LEFT JOIN event_flags f ON f.transaction_id = t.id
    WHERE (
      (t.settlement_status = 'settled' AND t.payment_status = 'failed')
      OR (t.settlement_status = 'settled' AND t.processed_at IS NULL
          AND t.payment_status <> 'failed')
      OR (f.has_processed_evt AND f.has_failed_evt)
    )
    ${merchantFilter}
    ORDER BY t.updated_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `;

  return res.json({ count: rows.length, limit, offset, items: rows });
}
