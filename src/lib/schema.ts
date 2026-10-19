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
ALTER TABLE projects ADD COLUMN IF NOT EXISTS setup JSONB NOT NULL DEFAULT '{}';
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
);
CREATE TABLE IF NOT EXISTS imports (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT '',
  filename TEXT NOT NULL DEFAULT '',
  rows INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ad_rows (
  id BIGSERIAL PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  import_id TEXT NOT NULL REFERENCES imports(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  campaign TEXT NOT NULL DEFAULT '',
  adset TEXT NOT NULL DEFAULT '',
  ad TEXT NOT NULL DEFAULT '',
  spend DOUBLE PRECISION NOT NULL DEFAULT 0,
  impressions DOUBLE PRECISION NOT NULL DEFAULT 0,
  reach DOUBLE PRECISION NOT NULL DEFAULT 0,
  clicks DOUBLE PRECISION NOT NULL DEFAULT 0,
  video_3s DOUBLE PRECISION NOT NULL DEFAULT 0,
  thruplay DOUBLE PRECISION NOT NULL DEFAULT 0,
  landing_views DOUBLE PRECISION NOT NULL DEFAULT 0,
  registrations DOUBLE PRECISION NOT NULL DEFAULT 0,
  add_to_cart DOUBLE PRECISION NOT NULL DEFAULT 0,
  checkouts DOUBLE PRECISION NOT NULL DEFAULT 0,
  purchases DOUBLE PRECISION NOT NULL DEFAULT 0,
  purchase_value DOUBLE PRECISION NOT NULL DEFAULT 0,
  title TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS ad_rows_project ON ad_rows(project_id, period_start);
CREATE UNIQUE INDEX IF NOT EXISTS ad_rows_uniq ON ad_rows(project_id, period_start, period_end, campaign, adset, ad);
CREATE TABLE IF NOT EXISTS orders (
  id BIGSERIAL PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  import_id TEXT NOT NULL REFERENCES imports(id) ON DELETE CASCADE,
  source TEXT NOT NULL DEFAULT '',
  order_ref TEXT NOT NULL,
  ts TIMESTAMPTZ NOT NULL,
  customer TEXT NOT NULL DEFAULT '',
  gross DOUBLE PRECISION NOT NULL DEFAULT 0,
  products JSONB NOT NULL DEFAULT '[]',
  coupon TEXT NOT NULL DEFAULT '',
  UNIQUE (project_id, source, order_ref)
);
CREATE INDEX IF NOT EXISTS orders_project_ts ON orders(project_id, ts);
CREATE TABLE IF NOT EXISTS project_settings (
  project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  settings JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS timeline_events (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  day DATE NOT NULL,
  type TEXT NOT NULL DEFAULT 'decyzja',
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT '',
  link TEXT NOT NULL DEFAULT '',
  confidence TEXT NOT NULL DEFAULT 'data',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS integrations (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  config JSONB NOT NULL DEFAULT '{}',
  secret TEXT NOT NULL DEFAULT '',
  state JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'new',
  last_sync_at TIMESTAMPTZ,
  last_error TEXT NOT NULL DEFAULT '',
  last_result JSONB NOT NULL DEFAULT '{}',
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ai_keys (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  token_hash TEXT NOT NULL UNIQUE,
  hint TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS ad_tests (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  angle TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'planowany',
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ad_test_rounds (
  id TEXT PRIMARY KEY,
  test_id TEXT NOT NULL REFERENCES ad_tests(id) ON DELETE CASCADE,
  number INTEGER NOT NULL,
  element TEXT NOT NULL,
  base_variant_id TEXT,
  start_date DATE NOT NULL,
  verdict_date DATE,
  status TEXT NOT NULL DEFAULT 'w toku',
  winner_variant_id TEXT,
  page_url TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ad_test_variants (
  id TEXT PRIMARY KEY,
  round_id TEXT NOT NULL REFERENCES ad_test_rounds(id) ON DELETE CASCADE,
  letter TEXT NOT NULL,
  change_to TEXT NOT NULL DEFAULT '',
  idea_source TEXT NOT NULL DEFAULT '',
  hypothesis TEXT NOT NULL DEFAULT '',
  meta_ad_name TEXT NOT NULL,
  daily_budget DOUBLE PRECISION NOT NULL DEFAULT 0,
  decision TEXT NOT NULL DEFAULT 'w toku',
  decision_note TEXT NOT NULL DEFAULT '',
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ad_test_manual (
  id TEXT PRIMARY KEY,
  variant_id TEXT NOT NULL REFERENCES ad_test_variants(id) ON DELETE CASCADE,
  day DATE NOT NULL,
  spend DOUBLE PRECISION NOT NULL DEFAULT 0,
  impressions DOUBLE PRECISION NOT NULL DEFAULT 0,
  link_clicks DOUBLE PRECISION NOT NULL DEFAULT 0,
  video_3s DOUBLE PRECISION NOT NULL DEFAULT 0,
  thruplay DOUBLE PRECISION NOT NULL DEFAULT 0,
  orders DOUBLE PRECISION NOT NULL DEFAULT 0,
  revenue DOUBLE PRECISION NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS winning_elements (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  angle TEXT NOT NULL DEFAULT '',
  element TEXT NOT NULL DEFAULT '',
  change_to TEXT NOT NULL DEFAULT '',
  idea_source TEXT NOT NULL DEFAULT '',
  variant_id TEXT,
  round_id TEXT,
  test_id TEXT,
  cac DOUBLE PRECISION,
  ctr DOUBLE PRECISION,
  diff_vs_base DOUBLE PRECISION,
  won_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  due DATE NOT NULL,
  done BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tasks_project_due ON tasks (project_id, due);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS calendar_token TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS start DATE;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS time TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS review_id TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS level TEXT;
CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  step INTEGER NOT NULL DEFAULT 0,
  notes JSONB NOT NULL DEFAULT '{}',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS goals (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  period TEXT NOT NULL,
  date_from DATE NOT NULL,
  date_to DATE NOT NULL,
  profit_target DOUBLE PRECISION NOT NULL,
  diag JSONB NOT NULL DEFAULT '{}',
  approved_by TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS loops (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  step INTEGER NOT NULL DEFAULT 0,
  data JSONB NOT NULL DEFAULT '{}',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS sop_tests (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  loop_id TEXT,
  status TEXT NOT NULL DEFAULT 'zaplanowany',
  hypothesis TEXT NOT NULL,
  element TEXT NOT NULL DEFAULT 'reklama',
  stage TEXT NOT NULL DEFAULT '',
  metric TEXT NOT NULL DEFAULT '',
  gain_estimate DOUBLE PRECISION,
  cost_budget DOUBLE PRECISION,
  cost_hours DOUBLE PRECISION,
  override_reason TEXT NOT NULL DEFAULT '',
  variants JSONB NOT NULL DEFAULT '[]',
  start_date DATE,
  end_date DATE,
  budget DOUBLE PRECISION,
  end_condition TEXT NOT NULL DEFAULT '',
  ad_test_id TEXT,
  result JSONB NOT NULL DEFAULT '{}',
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS learnings (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  loop_id TEXT,
  test_id TEXT,
  stage TEXT NOT NULL DEFAULT '',
  element TEXT NOT NULL DEFAULT '',
  text TEXT NOT NULL,
  profit_delta DOUBLE PRECISION,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS test_id TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS who TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS required BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE IF NOT EXISTS predictions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  loop_id TEXT NOT NULL,
  profit_guess DOUBLE PRECISION NOT NULL,
  stage_guess TEXT NOT NULL,
  lever_guess TEXT,
  window_from DATE,
  window_to DATE,
  profit_actual DOUBLE PRECISION,
  stage_actual TEXT,
  lever_actual TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS decisions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  loop_id TEXT,
  kind TEXT NOT NULL DEFAULT 'zmiana',
  what TEXT NOT NULL,
  who TEXT NOT NULL DEFAULT '',
  why TEXT NOT NULL DEFAULT '',
  element TEXT NOT NULL DEFAULT '',
  metric TEXT,
  from_value DOUBLE PRECISION,
  to_value DOUBLE PRECISION,
  hypothesis TEXT NOT NULL DEFAULT '',
  expected_month DOUBLE PRECISION,
  baseline JSONB NOT NULL DEFAULT '{}',
  start_date DATE NOT NULL,
  check_date DATE NOT NULL,
  ad_test_id TEXT,
  verdict TEXT,
  actual_value DOUBLE PRECISION,
  impact_month DOUBLE PRECISION,
  impact_low DOUBLE PRECISION,
  impact_high DOUBLE PRECISION,
  low_confidence BOOLEAN,
  learning TEXT NOT NULL DEFAULT '',
  verdict_loop_id TEXT,
  verdict_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS decision_id TEXT;
ALTER TABLE winning_elements ADD COLUMN IF NOT EXISTS stage TEXT NOT NULL DEFAULT 'reklama';
ALTER TABLE winning_elements ADD COLUMN IF NOT EXISTS decision_id TEXT;
ALTER TABLE winning_elements ADD COLUMN IF NOT EXISTS profit_month DOUBLE PRECISION;
ALTER TABLE loops ADD COLUMN IF NOT EXISTS share_token TEXT
`;
