CREATE TABLE IF NOT EXISTS performance_points (
  manager_id TEXT NOT NULL REFERENCES managers (id),
  timestamp BIGINT NOT NULL,
  tvl NUMERIC(20, 6) NOT NULL DEFAULT 0,
  nav NUMERIC(20, 12) NOT NULL DEFAULT 1,
  fees_generated NUMERIC(20, 6) NOT NULL DEFAULT 0,
  daily_pnl NUMERIC(20, 6) NOT NULL DEFAULT 0,
  max_drawdown NUMERIC(10, 6) NOT NULL DEFAULT 0,
  volatility NUMERIC(10, 6) NOT NULL DEFAULT 0,
  protocols_used INTEGER NOT NULL DEFAULT 0,
  pools_traded INTEGER NOT NULL DEFAULT 0,
  governance_actions INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (manager_id, timestamp)
);

CREATE INDEX IF NOT EXISTS idx_performance_points_manager ON performance_points (manager_id, timestamp);

CREATE TABLE IF NOT EXISTS oracle_submissions (
  id BIGSERIAL PRIMARY KEY,
  manager_id TEXT NOT NULL REFERENCES managers (id),
  score_total SMALLINT NOT NULL,
  breakdown JSONB NOT NULL,
  risk_tier SMALLINT NOT NULL,
  action TEXT NOT NULL,
  period TEXT NOT NULL,
  submitted_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_oracle_submissions_manager ON oracle_submissions (manager_id, submitted_at DESC);

CREATE TABLE IF NOT EXISTS ingested_events (
  signature TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  timestamp BIGINT NOT NULL,
  slot BIGINT NOT NULL,
  vault_address TEXT,
  manager_id TEXT,
  payload JSONB NOT NULL DEFAULT '{}',
  ingested_at BIGINT NOT NULL
);
