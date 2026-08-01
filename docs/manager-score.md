# Manager Score

A weighted reputation score computed on-chain, designed to resist manipulation.

## Formula

```
score = 30% · fee_generation
      + 20% · risk                  (inverted: 100 - riskScore)
      + 15% · drawdown             (inverted: 100 - drawdownScore)
      + 10% · capital_retention
      + 10% · consistency
      + 10% · tvl_growth
      +  5% · governance_participation
```

Each component is normalized 0-100. Reference implementation:

- TypeScript (backend + tests): `apps/backend/src/services/scoring/index.ts`
- Rust (on-chain): `programs/manager-registry/src/state.rs` — `ManagerScore::from(ScoreInput)`

## Interpretation

- Risk and drawdown inputs are inverted so that *higher* component scores are always better.
- The composite drives risk tier mapping (>=85 → tier 1 ... <40 → tier 5).
- Scores are stored on-chain per manager (`set_score`) with validation of 0-100 bounds.

## Manipulation resistance

- Everything is computed from on-chain data (fee generation, retention, consistency, TVL growth
  are all observable on-chain metrics).
- Scaffold note: `set_score` is currently permissionless; production must gate it with
  governance or an oracle signature, and cross-validate against the performance oracle before
  accepting.

## Allocation impact

The score feeds the allocation engine raw weight:

```
raw = score² · (1 - risk) · fee_efficiency · consistency · volatility_decay
      · track_record(age, tvl)
```

then shares are normalized and capped per risk limits (30% per manager, 10% cash reserve).
