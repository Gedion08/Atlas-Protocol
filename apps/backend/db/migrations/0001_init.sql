CREATE TABLE IF NOT EXISTS managers (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  score_fee_generation SMALLINT NOT NULL DEFAULT 0,
  score_risk SMALLINT NOT NULL DEFAULT 0,
  score_drawdown SMALLINT NOT NULL DEFAULT 0,
  score_capital_retention SMALLINT NOT NULL DEFAULT 0,
  score_consistency SMALLINT NOT NULL DEFAULT 0,
  score_tvl_growth SMALLINT NOT NULL DEFAULT 0,
  score_governance SMALLINT NOT NULL DEFAULT 0,
  score_total SMALLINT NOT NULL DEFAULT 0,
  bond_amount NUMERIC(20, 6) NOT NULL DEFAULT 0,
  tvl NUMERIC(20, 6) NOT NULL DEFAULT 0,
  assets_under_management NUMERIC(20, 6) NOT NULL DEFAULT 0,
  pnl NUMERIC(20, 6) NOT NULL DEFAULT 0,
  max_drawdown NUMERIC(10, 6) NOT NULL DEFAULT 0,
  fees_generated NUMERIC(20, 6) NOT NULL DEFAULT 0,
  pools_traded INTEGER NOT NULL DEFAULT 0,
  protocols_used TEXT[] NOT NULL DEFAULT '{}',
  years_active INTEGER NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_managers_score ON managers (score_total DESC);

CREATE TABLE IF NOT EXISTS strategies (
  id TEXT PRIMARY KEY,
  manager_id TEXT NOT NULL REFERENCES managers (id),
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  protocol TEXT NOT NULL,
  pool TEXT NOT NULL,
  pair TEXT NOT NULL,
  tvl NUMERIC(20, 6) NOT NULL DEFAULT 0,
  apy NUMERIC(10, 4) NOT NULL DEFAULT 0,
  apr NUMERIC(10, 4) NOT NULL DEFAULT 0,
  max_drawdown NUMERIC(10, 6) NOT NULL DEFAULT 0,
  sharpe_ratio NUMERIC(10, 4) NOT NULL DEFAULT 0,
  sortino_ratio NUMERIC(10, 4) NOT NULL DEFAULT 0,
  management_fee_bps INTEGER NOT NULL DEFAULT 0,
  performance_fee_bps INTEGER NOT NULL DEFAULT 0,
  impermanent_loss NUMERIC(10, 6) NOT NULL DEFAULT 0,
  utilization NUMERIC(10, 6) NOT NULL DEFAULT 0,
  age_days INTEGER NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 1,
  risk_tier SMALLINT NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_strategies_manager ON strategies (manager_id);
CREATE INDEX IF NOT EXISTS idx_strategies_protocol ON strategies (protocol);

CREATE TABLE IF NOT EXISTS vaults (
  address TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  base_asset TEXT NOT NULL,
  manager_id TEXT NOT NULL REFERENCES managers (id),
  authority TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  tvl NUMERIC(20, 6) NOT NULL DEFAULT 0,
  apy NUMERIC(10, 4) NOT NULL DEFAULT 0,
  shares_outstanding NUMERIC(30, 6) NOT NULL DEFAULT 0,
  management_fee_bps INTEGER NOT NULL DEFAULT 0,
  performance_fee_bps INTEGER NOT NULL DEFAULT 0,
  min_deposit NUMERIC(20, 6) NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL,
  last_rebalance_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS allocations (
  vault_address TEXT NOT NULL REFERENCES vaults (address),
  manager_id TEXT NOT NULL REFERENCES managers (id),
  share NUMERIC(10, 6) NOT NULL,
  amount NUMERIC(20, 6) NOT NULL,
  generated_at BIGINT NOT NULL,
  PRIMARY KEY (vault_address, manager_id, generated_at)
);

CREATE TABLE IF NOT EXISTS risk_decisions (
  id BIGSERIAL PRIMARY KEY,
  manager_id TEXT NOT NULL REFERENCES managers (id),
  action TEXT NOT NULL,
  score NUMERIC(10, 4) NOT NULL,
  violations JSONB NOT NULL DEFAULT '[]',
  evaluated_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_risk_decisions_manager ON risk_decisions (manager_id, evaluated_at DESC);

CREATE TABLE IF NOT EXISTS risk_rules (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  limit_value NUMERIC(10, 6) NOT NULL,
  severity TEXT NOT NULL DEFAULT 'critical',
  active BOOLEAN NOT NULL DEFAULT TRUE
);

INSERT INTO risk_rules (id, name, limit_value, severity) VALUES
  ('max_drawdown', 'Maximum drawdown', 0.15, 'critical'),
  ('daily_loss', 'Daily loss', 0.05, 'critical'),
  ('weekly_loss', 'Weekly loss', 0.10, 'critical'),
  ('max_per_manager', 'Maximum per manager', 0.30, 'critical'),
  ('max_per_protocol', 'Maximum per protocol', 0.40, 'warning'),
  ('max_per_token', 'Maximum per token', 0.20, 'warning'),
  ('max_memecoins', 'Maximum memecoin exposure', 0.10, 'warning'),
  ('max_stable_pools', 'Maximum stable pool exposure', 0.25, 'warning')
ON CONFLICT (id) DO NOTHING;
