-- Strategy uploads (SDK): manager-submitted strategies with parameterized
-- definitions, risk-tier gating and review status.

ALTER TABLE strategies
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS params JSONB,
  ADD COLUMN IF NOT EXISTS created_at BIGINT;

UPDATE strategies SET created_at = EXTRACT(EPOCH FROM NOW()) * 1000 WHERE created_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_strategies_tier ON strategies (risk_tier);
