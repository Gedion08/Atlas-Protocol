CREATE TABLE IF NOT EXISTS performance_snapshots (
  date Date,
  manager_id String,
  strategy_id String,
  tvl Float64,
  nav Float64,
  apy Float64,
  pnl Float64,
  realized_fees Float64,
  unrealized_fees Float64,
  utilization Float64
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(date)
ORDER BY (manager_id, strategy_id, date);

CREATE TABLE IF NOT EXISTS transactions (
  signature String,
  timestamp DateTime,
  manager_id String,
  strategy_id String,
  tx_type String,
  token_in String,
  token_out String,
  amount_in Float64,
  amount_out Float64,
  fees_collected Float64,
  slot UInt64
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (manager_id, timestamp);

CREATE TABLE IF NOT EXISTS bin_activity (
  timestamp DateTime,
  strategy_id String,
  protocol String,
  active_bins UInt32,
  total_bins UInt32,
  bin_distribution String,
  bin_crossing_frequency Float64,
  rebalance_frequency Float64,
  fee_per_active_bin Float64,
  inventory_skew Float64,
  price_drift Float64
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (strategy_id, timestamp);
