# Event Ingester

A small service for ingesting payment lifecycle events, retrieving transactions, and reporting reconciliation discrepancies.

Built with **Bun + TypeScript**, **Express**, **Postgres**, and **AWS SQS (FIFO)**.

## Live deployment

Hosted on AWS EC2.

- Base URL: **http://3.109.80.118:8000**
- Dashboard: http://3.109.80.118:8000
- Health:    http://3.109.80.118:8000/health

## Flow

```
                  ┌──────────────┐
  POST /api/events│              │
  ───────────────▶│   Server     │──▶ (event_id + transaction_id)
                  │  (Express)   │      and enqueues to SQS
                  └──────┬───────┘
                         │
                         ▼
                  ┌──────────────┐
                  │   SQS FIFO   │   MessageGroupId = transaction_id
                  │    Queue     │   MessageDeduplicationId = event_id
                  └──────┬───────┘
                         │
                         ▼
                  ┌──────────────┐
                  │    Worker    │
                  │              │    
                  │              │    
                  └──────┬───────┘
                         │
                         ▼
                  ┌──────────────┐
                  │   Postgres   │
                  └──────────────┘

  Dashboard (/) ──▶ GET /api/transactions, /api/reconciliation/*
```

Idempotency comes from two layers: SQS's 5-minute dedup window on `event_id`, and the `events` table primary key with `ON CONFLICT DO NOTHING` for durability.

## Setup

1. Copy `.env.example` to `.env` and fill in DB + AWS values.
2. Create the schema:
   ```
   psql -d event-ingester -f sql/schema.sql
   ```
3. Install deps:
   ```
   bun install
   ```
4. Seed merchants from the sample file:
   ```
   bun run seed
   ```

## Running

Open three terminals:

```
bun run server     # API + dashboard on :8000
bun run worker     # SQS consumer
bun run push       # pushes sample_events.json into /api/events
```

Dashboard: http://localhost:8000
Health:    http://localhost:8000/health

## API

| Method | Path                                | Notes                                        |
|--------|-------------------------------------|----------------------------------------------|
| POST   | `/api/events`                       | .     |
| GET    | `/api/transactions`                 | .                |
| GET    | `/api/transactions/:id`             | 
 timeline.                  |
| GET    | `/api/reconciliation/summary`       | .    |
| GET    | `/api/reconciliation/discrepancies` | Mismatched/conflicting transactions.         |

## Layout

```
app/         config, db, sqs, schemas, processor
server/      express app, routes/, controllers/
worker/      SQS long-poll loop
sql/         schema.sql
scripts/     seed merchants, push sample events
public/      dashboard (html/css/js)
```

## Postman

A Postman collection with test assertions is included at the repo root:

```
event-ingester.postman_collection.json
```

Import it into Postman, set the `baseUrl` collection variable to `http://3.109.80.118:8000` (or `http://localhost:8000` for local), and run via the Collection Runner. Tests cover ingest (single, batch, idempotent duplicate, invalid), transactions list/detail/filters, reconciliation summary across all `group_by` modes, and discrepancies.

## AI Tools Usage:
- Claude Code - used for md file generation, web dashboard (built entirely with AI), optimization suggestions, and refactoring.

