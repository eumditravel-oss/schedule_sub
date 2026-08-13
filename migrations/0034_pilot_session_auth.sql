-- Developer Scheduler V3 - Checkpoint 4.1
-- Pilot PIN credentials and server-side sessions.  Additive only: no
-- baseline, forecast, actual, task, project, or worklog data is changed.

CREATE TABLE IF NOT EXISTS pilot_auth_credentials (
  employee_id TEXT PRIMARY KEY,
  pin_hash TEXT NOT NULL,
  pin_salt TEXT NOT NULL,
  pin_algorithm TEXT NOT NULL,
  pin_iterations INTEGER NOT NULL,
  is_enabled INTEGER NOT NULL DEFAULT 1 CHECK (is_enabled IN (0, 1)),
  failed_attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (failed_attempt_count >= 0),
  locked_until TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by TEXT,
  FOREIGN KEY (employee_id) REFERENCES workers(id)
);

CREATE TABLE IF NOT EXISTS pilot_auth_sessions (
  session_id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  session_token_hash TEXT NOT NULL UNIQUE,
  csrf_token_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  last_seen_at TEXT NOT NULL,
  created_user_agent_hash TEXT,
  created_ip_hash TEXT,
  FOREIGN KEY (employee_id) REFERENCES workers(id)
);

CREATE INDEX IF NOT EXISTS idx_pilot_auth_sessions_employee_active
  ON pilot_auth_sessions(employee_id, revoked_at, expires_at);

CREATE TABLE IF NOT EXISTS pilot_auth_audit_events (
  id TEXT PRIMARY KEY,
  employee_id TEXT,
  session_id TEXT,
  event_type TEXT NOT NULL,
  event_time_utc TEXT NOT NULL,
  metadata_json TEXT,
  FOREIGN KEY (employee_id) REFERENCES workers(id),
  FOREIGN KEY (session_id) REFERENCES pilot_auth_sessions(session_id)
);

CREATE INDEX IF NOT EXISTS idx_pilot_auth_audit_employee_time
  ON pilot_auth_audit_events(employee_id, event_time_utc DESC);

-- Manager-to-employee visibility is explicit.  Capability flags alone do not
-- grant access to another employee's Worklog or Capacity facts.
CREATE TABLE IF NOT EXISTS pilot_employee_supervision (
  manager_employee_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by TEXT,
  PRIMARY KEY(manager_employee_id, employee_id),
  FOREIGN KEY (manager_employee_id) REFERENCES workers(id),
  FOREIGN KEY (employee_id) REFERENCES workers(id),
  CHECK (manager_employee_id <> employee_id)
);

CREATE INDEX IF NOT EXISTS idx_pilot_supervision_employee_active
  ON pilot_employee_supervision(employee_id, is_active);
