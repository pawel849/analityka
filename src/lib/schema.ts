// Schemat tworzony automatycznie przy pierwszym połączeniu (idempotentny).
export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS clients (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  domain TEXT NOT NULL DEFAULT '',
  tracking_key TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS funnels (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  graph JSONB NOT NULL DEFAULT '{"nodes":[],"edges":[]}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS events (
  id BIGSERIAL PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  type TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  visitor_id TEXT NOT NULL,
  session_id TEXT NOT NULL DEFAULT '',
  url TEXT NOT NULL DEFAULT '',
  path TEXT NOT NULL DEFAULT '',
  referrer TEXT NOT NULL DEFAULT '',
  utm_source TEXT NOT NULL DEFAULT '',
  utm_medium TEXT NOT NULL DEFAULT '',
  utm_campaign TEXT NOT NULL DEFAULT '',
  utm_content TEXT NOT NULL DEFAULT '',
  utm_term TEXT NOT NULL DEFAULT '',
  element TEXT NOT NULL DEFAULT '',
  value DOUBLE PRECISION,
  scroll INTEGER,
  is_test BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS events_project_ts ON events(project_id, ts);
ALTER TABLE events ADD COLUMN IF NOT EXISTS country TEXT NOT NULL DEFAULT '';
ALTER TABLE events ADD COLUMN IF NOT EXISTS email TEXT NOT NULL DEFAULT '';
ALTER TABLE events ADD COLUMN IF NOT EXISTS origin TEXT NOT NULL DEFAULT 'script';
ALTER TABLE funnels ADD COLUMN IF NOT EXISTS share_token TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS webhook_secret TEXT;
CREATE TABLE IF NOT EXISTS identities (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  visitor_id TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, email)
);
CREATE TABLE IF NOT EXISTS manual_data (
  id TEXT PRIMARY KEY,
  funnel_id TEXT NOT NULL REFERENCES funnels(id) ON DELETE CASCADE,
  node_id TEXT NOT NULL,
  day DATE NOT NULL,
  metric TEXT NOT NULL,
  value DOUBLE PRECISION NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS manual_funnel_day ON manual_data(funnel_id, day);
CREATE TABLE IF NOT EXISTS custom_metrics (
  id TEXT PRIMARY KEY,
  funnel_id TEXT NOT NULL REFERENCES funnels(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  formula TEXT NOT NULL,
  format TEXT NOT NULL DEFAULT 'number',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
)
`;
