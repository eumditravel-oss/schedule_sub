-- Developer Scheduler V3 - Checkpoint 3A
-- Additive idempotency ledger for manager Shadow-domain mutations.

CREATE TABLE IF NOT EXISTS shadow_engine_idempotency_keys (
  idempotency_key TEXT PRIMARY KEY,
  operation TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  response_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
