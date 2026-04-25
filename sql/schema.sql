CREATE TABLE IF NOT EXISTS merchants (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

DO $$ BEGIN
    CREATE TYPE payment_status_enum AS ENUM ('initiated', 'processed', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE settlement_status_enum AS ENUM ('pending', 'settled', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS transactions (
    id UUID PRIMARY KEY,
    merchant_id TEXT NOT NULL REFERENCES merchants(id),
    amount NUMERIC(12,2) NOT NULL,
    currency TEXT NOT NULL,
    payment_status payment_status_enum NOT NULL,
    settlement_status settlement_status_enum NOT NULL DEFAULT 'pending',
    initiated_at TIMESTAMPTZ,
    processed_at TIMESTAMPTZ,
    failed_at TIMESTAMPTZ,
    settled_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS events (
    event_id UUID PRIMARY KEY,
    event_type TEXT NOT NULL CHECK (event_type IN (
        'payment_initiated',
        'payment_processed',
        'payment_failed',
        'settled'
    )),
    transaction_id UUID NOT NULL,
    merchant_id TEXT NOT NULL,
    amount NUMERIC(12,2),
    currency TEXT,
    event_timestamp TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    payload JSONB
);

CREATE INDEX IF NOT EXISTS idx_txn_merchant ON transactions(merchant_id);
CREATE INDEX IF NOT EXISTS idx_txn_updated ON transactions(updated_at);
CREATE INDEX IF NOT EXISTS idx_txn_payment_settlement ON transactions(payment_status, settlement_status);
CREATE INDEX IF NOT EXISTS idx_txn_merchant_updated ON transactions(merchant_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_events_txn ON events(transaction_id);
CREATE INDEX IF NOT EXISTS idx_events_merchant ON events(merchant_id);
CREATE INDEX IF NOT EXISTS idx_events_time ON events(event_timestamp);
CREATE INDEX IF NOT EXISTS idx_events_txn_time ON events(transaction_id, event_timestamp);
