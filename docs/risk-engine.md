# Risk Engine

The risk engine is the most important system. It converts raw LP activity into risk metrics and
enforces hard limits with automatic actions.

## Metrics

- **VaR** — historical VaR at 95%/99% confidence (`computeHistoricalVaR`)
- **Expected shortfall** — mean of the worst `1-confidence` tail (`computeExpectedShortfall`)
- **Volatility** — sample standard deviation of daily returns (`computeVolatility`)
- **Max drawdown** — peak-to-trough decline (`computeMaxDrawdown`)
- **IL** — impermanent loss vs holding
- **Concentration** — pool / token / protocol concentration
- **Counterparty risk, liquidity depth, oracle health, slippage, fee decay, pool migration**
- **Meteora DLMM** — bin distribution, active bin %, price drift, bin crossing frequency,
  rebalance frequency, fee per active bin, inventory skew

## Default limits (mirrors spec)

| Rule                    | Limit  | Severity  | Action      |
| ----------------------- | ------ | --------- | ----------- |
| Max drawdown            | 15%    | critical  | pause       |
| Daily loss              | 5%     | critical  | pause       |
| Weekly loss             | 10%    | critical  | pause       |
| Per manager             | 30%    | critical  | pause       |
| Per protocol            | 40%    | warning   | reduce      |
| Per token               | 20%    | warning   | reduce      |
| Memecoin exposure       | 10%    | warning   | reduce      |
| Stable pool exposure    | 25%    | warning   | reduce      |

A violation at >150% of its limit escalates from warning to critical. Any critical violation
produces `pause`; warning violations produce `reduce`; otherwise `ok`. The engine also emits a
risk score (100 minus penalty points).

## Auto pause

On `pause`, the risk engine signals the automation layer to halt deployments, block new
deposits, and (in emergency) trigger the on-chain emergency exit. The vault program already
supports the `VaultStatus` states: `active | paused | emergency`.

## Reallocation

The allocation engine runs continuously (hour/day/week cadence). It detects underperformance,
high IL, low utilization, or excess volatility via drift between the current allocation and a
fresh computation (`reallocationNeeded`, default 5% drift threshold) and reallocates capital
between managers subject to the limits above.
