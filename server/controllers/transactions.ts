import type { Request, Response } from "express";

import { sql } from "../../app/db";

const SORTABLE = new Set(["updated_at", "initiated_at", "amount"]);
const PAYMENT_STATUSES = new Set(["initiated", "processed", "failed"]);
const SETTLEMENT_STATUSES = new Set(["pending", "settled", "failed"]);

function pickStr(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

function pickDate(v: unknown): Date | undefined {
  if (typeof v !== "string" || v.length === 0) return undefined;
  const d = new Date(v);
  return isNaN(d.getTime()) ? undefined : d;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(Math.max(n, lo), hi);
}

export async function list(req: Request, res: Response) {
  const q = req.query;
  const merchantId = pickStr(q.merchant_id);
  const paymentStatus = pickStr(q.payment_status);
  const settlementStatus = pickStr(q.settlement_status);
  const legacyStatus = pickStr(q.status);
  const start = pickDate(q.start);
  const end = pickDate(q.end);

  if (paymentStatus && !PAYMENT_STATUSES.has(paymentStatus)) {
    return res.status(400).json({ error: "invalid_payment_status" });
  }
  if (settlementStatus && !SETTLEMENT_STATUSES.has(settlementStatus)) {
    return res.status(400).json({ error: "invalid_settlement_status" });
  }

  const sortByRaw = pickStr(q.sort_by) ?? "updated_at";
  if (!SORTABLE.has(sortByRaw)) {
    return res.status(400).json({ error: "invalid_sort_by" });
  }
  const sortBy = sortByRaw;
  const order = pickStr(q.order) === "asc" ? "ASC" : "DESC";

  const limit = clamp(Number(q.limit ?? 50), 1, 500);
  const offset = Math.max(Number(q.offset ?? 0), 0);

  const conds: ReturnType<typeof sql>[] = [];
  if (merchantId) conds.push(sql`merchant_id = ${merchantId}`);
  if (paymentStatus) conds.push(sql`payment_status = ${paymentStatus}`);
  if (settlementStatus) conds.push(sql`settlement_status = ${settlementStatus}`);
  if (legacyStatus) {
    conds.push(
      sql`(payment_status::text = ${legacyStatus} OR settlement_status::text = ${legacyStatus})`,
    );
  }
  if (start) conds.push(sql`updated_at >= ${start}`);
  if (end) conds.push(sql`updated_at < ${end}`);

  const whereFrag =
    conds.length === 0
      ? sql``
      : sql`WHERE ${conds.reduce((a, b) => sql`${a} AND ${b}`)}`;

  const countRow = await sql<{ count: string }[]>`
    SELECT COUNT(*)::text AS count FROM transactions ${whereFrag}
  `;
  const total = Number(countRow[0]?.count ?? 0);

  const rows = await sql`
    SELECT id, merchant_id, amount, currency,
           payment_status::text AS payment_status,
           settlement_status::text AS settlement_status,
           initiated_at, processed_at, failed_at, settled_at, updated_at
    FROM transactions
    ${whereFrag}
    ORDER BY ${sql(sortBy)} ${sql.unsafe(order)} NULLS LAST, id
    LIMIT ${limit} OFFSET ${offset}
  `;

  return res.json({ items: rows, total, limit, offset });
}

export async function getById(req: Request, res: Response) {
  const id = req.params.id;
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    return res.status(400).json({ error: "invalid_transaction_id" });
  }

  const [txn] = await sql`
    SELECT t.id, t.merchant_id, t.amount, t.currency,
           t.payment_status::text    AS payment_status,
           t.settlement_status::text AS settlement_status,
           t.initiated_at, t.processed_at, t.failed_at, t.settled_at, t.updated_at,
           m.id   AS merchant_pk,
           m.name AS merchant_name
    FROM transactions t
    LEFT JOIN merchants m ON m.id = t.merchant_id
    WHERE t.id = ${id}
  `;

  if (!txn) return res.status(404).json({ error: "transaction_not_found" });

  const events = await sql`
    SELECT event_id, event_type, transaction_id, merchant_id,
           amount, currency, event_timestamp
    FROM events
    WHERE transaction_id = ${id}
    ORDER BY event_timestamp ASC, created_at ASC
  `;

  return res.json({
    id: txn.id,
    merchant_id: txn.merchant_id,
    amount: txn.amount,
    currency: txn.currency,
    payment_status: txn.payment_status,
    settlement_status: txn.settlement_status,
    initiated_at: txn.initiated_at,
    processed_at: txn.processed_at,
    failed_at: txn.failed_at,
    settled_at: txn.settled_at,
    updated_at: txn.updated_at,
    merchant: txn.merchant_pk
      ? { id: txn.merchant_pk, name: txn.merchant_name }
      : null,
    events,
  });
}
