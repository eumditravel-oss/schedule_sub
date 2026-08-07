-- Migration: 0021_project_worker_allocations.sql
-- Description: Create project_worker_allocations table for Worker Capacity Model V2

CREATE TABLE IF NOT EXISTS project_worker_allocations (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  worker_id TEXT NOT NULL,
  allocation_percent INTEGER NOT NULL CHECK (allocation_percent >= 0 AND allocation_percent <= 100),
  note TEXT,
  source TEXT NOT NULL DEFAULT 'MANUAL',
  created_by_id TEXT,
  created_by_name TEXT,
  updated_by_id TEXT,
  updated_by_name TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(project_id, worker_id),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (worker_id) REFERENCES workers(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_pwa_project ON project_worker_allocations(project_id);
CREATE INDEX IF NOT EXISTS idx_pwa_worker ON project_worker_allocations(worker_id);
