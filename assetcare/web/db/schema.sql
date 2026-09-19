CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  department TEXT NOT NULL,
  location TEXT NOT NULL,
  custodian TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Operational',
  value NUMERIC(14, 2) NOT NULL DEFAULT 0,
  service_due TEXT NOT NULL DEFAULT 'Not scheduled',
  risk TEXT NOT NULL DEFAULT 'Watch',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS assets_risk_idx ON assets (risk);
CREATE INDEX IF NOT EXISTS assets_department_idx ON assets (department);
