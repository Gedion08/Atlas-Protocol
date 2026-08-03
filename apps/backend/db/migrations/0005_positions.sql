CREATE TABLE IF NOT EXISTS investor_positions (
  id TEXT PRIMARY KEY,
  investor TEXT NOT NULL,
  vault_address TEXT NOT NULL REFERENCES vaults (address),
  strategy_id TEXT REFERENCES strategies (id),
  amount NUMERIC(30, 6) NOT NULL,
  shares NUMERIC(30, 6) NOT NULL,
  share_price NUMERIC(30, 6) NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_investor_positions_investor ON investor_positions (investor, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_investor_positions_vault ON investor_positions (vault_address);
