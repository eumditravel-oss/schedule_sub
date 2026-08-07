-- migrations/0020_integration_tables_and_worker_permission.sql

ALTER TABLE workers ADD COLUMN can_manage_integrations INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS integration_api_keys (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  scopes_json TEXT NOT NULL,
  allowed_project_ids_json TEXT,
  allowed_ips_json TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  expires_at DATETIME,
  last_used_at DATETIME,
  created_by_id TEXT NOT NULL,
  created_by_name TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at DATETIME
);

CREATE TABLE IF NOT EXISTS integration_entity_links (
  id TEXT PRIMARY KEY,
  api_key_id TEXT NOT NULL,
  source TEXT NOT NULL,
  entity_type TEXT NOT NULL, -- 'PROJECT' | 'TASK_GROUP' | 'TASK'
  external_id TEXT NOT NULL,
  internal_id TEXT NOT NULL,
  external_updated_at DATETIME,
  last_payload_hash TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(source, entity_type, external_id)
);

CREATE TABLE IF NOT EXISTS integration_api_logs (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL,
  api_key_id TEXT NOT NULL,
  method TEXT NOT NULL,
  route TEXT NOT NULL,
  source TEXT,
  external_id TEXT,
  entity_type TEXT,
  internal_id TEXT,
  http_status INTEGER NOT NULL,
  error_code TEXT,
  client_ip TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS integration_rate_limits (
  api_key_id TEXT NOT NULL,
  window_start INTEGER NOT NULL, -- Unix timestamp minute
  request_count INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY(api_key_id, window_start)
);

CREATE INDEX IF NOT EXISTS idx_entity_links_lookup ON integration_entity_links(source, entity_type, external_id);
CREATE INDEX IF NOT EXISTS idx_entity_links_internal ON integration_entity_links(internal_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_prefix ON integration_api_keys(key_prefix);
CREATE INDEX IF NOT EXISTS idx_api_logs_key ON integration_api_logs(api_key_id, created_at);
