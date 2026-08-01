# Atlas Protocol — Protocol Economics Specification

**Version 1.0 · Status: Draft for governance review**
**Scope:** Economic design, value flows, incentives, capital allocation, risk and sustainability.
Companion documents: [`architecture.md`](./architecture.md) (system design), [`risk-engine.md`](./risk-engine.md)
(hard limits and circuit breakers), [`manager-score.md`](./manager-score.md) (score formula), [`roadmap.md`](./roadmap.md)
(milestones). This document governs *why* the system behaves as it does; those documents govern *how*.

---

## Table of Contents

1. [Economic Philosophy and the Atlas Moat](#1-economic-philosophy-and-the-atlas-moat)
2. [Value Creation and Value Capture](#2-value-creation-and-value-capture)
3. [Investor Economics](#3-investor-economics)
4. [Liquidity Manager Economics](#4-liquidity-manager-economics)
5. [Protocol Treasury Economics](#5-protocol-treasury-economics)
6. [Insurance Economy](#6-insurance-economy)
7. [Token Economics](#7-token-economics)
8. [Incentive Architecture and Mechanism Design](#8-incentive-architecture-and-mechanism-design)
9. [Quantitative Capital Allocation](#9-quantitative-capital-allocation)
10. [Fee Economy](#10-fee-economy)
11. [Liquidity Economy](#11-liquidity-economy)
12. [Governance Economy](#12-governance-economy)
13. [Economic Sustainability Framework](#13-economic-sustainability-framework)
14. [Protocol Stress-Testing Framework](#14-protocol-stress-testing-framework)
15. [Economic Roadmap](#15-economic-roadmap)
16. [Appendix A — Parameters, Notation, Formulas](#16-appendix-a--parameters-notation-formulas)

---

## Executive Summary

Atlas Protocol is a decentralized capital allocation marketplace. It does not create yield; it
solves the more valuable problem of **directing yield**. Investors deposit into professionally
managed vaults; verified LP managers compete for that capital; an automated risk engine scores
their performance against objective on-chain evidence; and capital flows continuously toward the
best risk-adjusted outcomes.

The economic design rests on a single principle: **the protocol is paid only when it makes
someone better off, and every participant is made better off only when the system is healthy.**

- **Investors** pay fees in exchange for allocation intelligence, professional management,
  systematic diversification, automated risk control, and insurance — the institutional machinery
  a fund-of-funds charges ~1% + 10% for, at roughly half the cost, with full on-chain verifiability.
- **Managers** pay performance obligations and post bonds in exchange for access to delegated
  capital they could not otherwise attract, priced by a transparent reputation system that makes
  good behavior a compounding asset.
- **The protocol** captures a thin slice of the fee layer and monetizes its infrastructure
  (analytics, APIs, reporting, white-label, underwriting), converting scale into self-funding
  operations without perpetual token inflation.
- **ATLAS holders** govern the system and earn a share of real protocol revenue, not inflated
  emissions — the token is a claim on a growing cash-flow business.

Section 13 demonstrates formally that with a blended management fee of ~75 bps (25% protocol
take) and a 15% performance fee (20% protocol take), the protocol reaches operational
self-sufficiency at roughly **$300–400M AUM** and generates **positive net revenue to the
treasury and token holders at every scale above breakeven**, across all but the most hostile
market regimes. No perpetual emissions are required at any stage.

---

# 1. Economic Philosophy and the Atlas Moat

## 1.1 The problem Atlas exists to solve

Automated Market Makers (AMMs) and concentrated-liquidity venues — Meteora, Orca, Raydium, and
their successors — converted one of DeFi's hardest operational problems (order books, market
making) into a permissionless capital commitment. But they did not remove the problems that
surround that commitment:

1. **Information asymmetry.** The average LP cannot evaluate whether a concentrated-liquidity
   position is correctly placed, correctly sized, correctly hedged, or correctly timed. The
   strategy is a black box; the risk is real; the counterparty (the manager of their own
   position) is them.
2. **Fragmented risk.** Capital spread across a dozen pools has no portfolio view, no aggregate
   exposure limits, no correlation control, and no single point of accountability.
3. **No professional discipline.** Positions drift, rebalancing is missed, fees decay, bins walk
   out of range, and impermanent loss compounds — because there is no manager accountable for
   operating them.
4. **No accountability.** A pool can be rug-pulled, exploited, or migrated; the LP has no bond,
   no insurance, no recourse, and no systematic way to recover.
5. **High search and diligence costs.** Finding, vetting, monitoring, and rebalancing across
   strategies is a full-time quant desk. Institutions cannot staff this per-pool.
6. **No governance of capital itself.** There is no mechanism for allocators to direct capital
   toward the strategies that demonstrably manage risk best and starve the ones that do not.

Atlas is the **operating system** that sits above these venues: it converts unmanaged LP risk into
a governed, measured, insured, and continuously reallocated professional capital portfolio.

## 1.2 Why participants choose Atlas over direct interaction

Atlas competes against (a) direct LP participation, (b) incumbent aggregator/vault protocols, and
(c) professional fund-of-funds. Its value proposition is expressed as explicit economic surplus:

| Cost / capability | Direct LP (DIY) | Conventional vault/aggregator | Fund-of-funds | Atlas Protocol |
| --- | --- | --- | --- | --- |
| Diligence & sourcing | Per-pool, unpaid | Opaque | 0.5–1% mgmt | Included, transparent |
| Active management | Self | Static or black-box | 10–20% perf | 15% perf, HWM, clawback |
| Risk monitoring | Self | Basic or none | 5–20 bp extra | Real-time circuit breakers |
| Diversification | Manual | Minimal | Portfolio | Systematic, capped |
| Accountability | None | None | Reputational | Bond + slashing + insurance |
| Withdrawal liquidity | Immediate | Immediate | Gated | Queue with notice, gates |
| Auditability | Native | Partial | Monthly reports | On-chain, real-time |

An institution holding $100M in LP positions directly spends on the order of $1–2M/yr on an
in-house team, risk tooling, and rebalancing execution, plus forgone alpha from slow reaction to
deteriorating pools. Atlas replaces that cost structure with a $50–500k/yr analytics/reporting
relationship and takes on the operational burden under a transparent, governed, insured framework.
This is the **fund-of-funds margin**: allocators rationally pay for the *allocation*, not the
*assets*.

## 1.3 The economic moat

Atlas' moat is a layered combination that no single underlying protocol can reproduce, because
it exists **above** the protocol layer and **below** the allocator:

1. **The data moat.** Full-fidelity LP transaction ingestion (Geyser/Helius → ClickHouse), NAV
   construction, fee attribution, bin-level Meteora analytics, and drawdown/VaR histories create a
   proprietary performance dataset. Every new strategy, manager, and vault adds resolution to that
   dataset; competitors cannot retroactively reconstruct it.
2. **The reputation ledger.** Manager scores are a *positional good*: only the top managers can
   be ranked top. Managers migrate *to* the marketplace where their reputation is priced and
   compounded; investors migrate *to* the marketplace where manager quality is legible. This is a
   two-sided network effect with direct switching costs (score history, bonding, veATLAS locks,
   insurance continuity).
3. **The risk layer.** A real-time risk engine with on-chain circuit breakers, portfolio-level
   concentration limits, and cross-manager correlation analytics cannot be built by a single
   manager (it requires the aggregate position) and is not offered by any venue (which sees only
   its own pools).
4. **Institutional plumbing.** Audited reporting, API/analytics licensing, white-label deployment,
   KYC-gated vaults, and compliance output convert a crypto product into an allocable asset class.
   This distribution moat compounds: institutions standardize on the infrastructure they already
   paid to integrate.
5. **Governance and capital direction.** Governance control over risk parameters, manager
   onboarding, fee schedules, and insurance policies is itself a moat: it makes the system
   *responsive* to allocator concerns in a way no pool or vault is.

The moat is therefore not a single secret — it is the **sum of data, reputation, risk, and
governance infrastructure**, each of which strengthens the others and each of which requires
scale, time, and trust to replicate.

## 1.4 Design principles

Every mechanism in this document is constrained by the following principles:

- **P1 — No yield creation, only yield direction.** Atlas never invents returns; it prices and
  allocates them. Claims on fees must be earned by measurable contribution.
- **P2 — Paid on outcomes, not promises.** Fees accrue to NAV and manager compensation is
  gated by high-water marks, deferral, and clawback.
- **P3 — Observable and verifiable.** Every score input, every fee, and every reallocation is
  computed from on-chain evidence, not self-reporting.
- **P4 — Misconduct ≠ poor performance.** Capital allocation punishes poor performance
  (deallocation, score decay); only *misconduct* triggers slashing. (Section 4.7.)
- **P5 — Sustainability without inflation.** Revenue, not emissions, funds operations. Token
  emissions are a bootstrap tool with a hard expiry (Section 7, 13).
- **P6 — Insurable ≠ guaranteed.** Insurance covers operational, structural, and security
  failures. Market risk and impermanent loss are allocated and reported, not guaranteed.
- **P7 — Skin in the game at every layer.** Investors post notice, managers post bonds, token
  holders post lock-up, governance posts quorum, insurers post reserve. No layer gets a free
  option.
- **P8 — Reserve before reward.** The treasury, insurance reserve, and emergency liquidity sit
  ahead of token distribution and manager bonuses in the cash-flow waterfall (Section 2.4).

---

# 2. Value Creation and Value Capture

## 2.1 How value is created

Atlas creates value in four distinct layers, each with an identifiable producer and beneficiary:

| Layer | What it creates | Producer | Beneficiary |
| --- | --- | --- | --- |
| Allocation intelligence | Higher risk-adjusted yield by continuously routing capital to the best managers and starving underperformers | Scoring + allocation engine | Investors |
| Risk infrastructure | Lower tail risk: circuit breakers, diversification caps, correlation control, insurance | Risk engine, insurance reserve | Investors |
| Manager marketplace | Liquidity access and reputation pricing for professional LP operators | Registry, leaderboard, bonding | Managers |
| Institutional access | Legible, auditable, compliant exposure to Solana LP markets | Reporting, API, white-label | Institutions, DAOs, treasuries |

The protocol does not invent yield; it raises the *distribution of risk-adjusted returns* the
allocator actually receives, and lowers its dispersion. That surplus is the total value pool the
protocol shares with its participants.

## 2.2 Revenue sources (current)

Each stream below is detailed in Section 10 (fee economy). This section fixes **what** the stream
is, **why** it is sustainable, and **where** it flows.

| # | Revenue stream | Mechanism | Sustainability rationale | Primary flow |
| --- | --- | --- | --- | --- |
| R1 | Management fees | 50–150 bps/yr on vault NAV, default 75 bps | Recurring, contract-based, scales with AUM | 25% protocol / 75% manager |
| R2 | Performance fees | 10–20% of gains above high-water mark, default 15% | Earned only on realized investor profit | 20% protocol / 80% manager |
| R3 | Exit / withdrawal fees | 0% standard; 25–50 bps for expedited exits | Priced liquidity; deters redemption runs | 100% protocol |
| R4 | Strategy listing fees | One-time $5k–$100k by risk tier | Converts manager demand into revenue | 100% protocol |
| R5 | Marketplace placement | 1% of gross deposits into a newly listed strategy in year 1 | Performs as sourcing commission | 100% protocol |
| R6 | Analytics subscriptions | $500/mo professional, $5k/mo institutional | Data moat monetized as SaaS | 100% protocol |
| R7 | Enterprise API licensing | $250/mo dev, $2.5k/mo pro, custom enterprise | Infrastructure as a product | 100% protocol |
| R8 | Institutional reporting | $2k/mo per engagement | Compliance output for allocators | 100% protocol |
| R9 | White-label deployments | $500k/yr license + 10% of gross | Distribution of the OS itself | 100% protocol |
| R10 | Insurance premiums | 10–30 bps/yr on insured TVL | Actuarial underwriting (Section 6) | 100% to insurance reserve |
| R11 | Governance participation incentives | Treasury-funded, capped, for voter turnout | Pays for informed attention, not votes | Treasury → participants |
| R12 | Penalties, forfeitures, slashed bonds | Recoveries from misconduct | Deters misconduct; recycles risk capital | Insurance reserve / treasury |

**Total protocol revenue** (Sections 10, 13) = R1 protocol share + R2 protocol share + R3 + R4 +
R5 + R6 + R7 + R8 + R9 + insurance margin + R12, less insurance payouts.

## 2.3 Revenue sources (future)

- **Enterprise onboarding & integration fees** — one-time services for institutional onboarding.
- **Data partnerships** — licensed anonymized flow/analytics datasets.
- **Priority execution / routing** — optional smart-order-routing for managers (fee-per-execution).
- **Structured products / hedged exposures** — volatility and IL-hedge wrappers with a spread.
- **RWA & compliance rails** — KYC-gated vaults with document services.
- **Reinsurance participation** — selling excess-layer coverage to other protocols.

These are additive and not required by the sustainability model (Section 13).

## 2.4 Distribution waterfall

Protocol-side revenue (protocol share of R1/R2, plus R3–R9, R11, R12) is distributed per a fixed,
governance-amendable waterfall executed in order:

```
Gross protocol revenue
├─ ① Reserve (target ≥ 2% of TVL, floor $2M)            → insurance reserve        (target)
├─ ② Operating reserve (24-month runway)                → treasury operating fund
├─ ③ Treasury net revenue (60% of remainder)            → treasury long-term pool
├─ ④ Insurance net revenue (25% of remainder)           → insurance reserve (above target)
└─ ⑤ veATLAS revenue share (15% of remainder)           → time-locked token holders
```

Justification:

- **① precedes all else**: solvency is a prerequisite for the insurance value proposition
  (P6/P8). Reserve funding is satisfied before any distribution; once at target, the insurance
  increment shifts to treasury.
- **② protects continuity**: operating runway must not depend on token markets.
- **③ grows the treasury** as the protocol's war chest and policy instrument (Section 5).
- **④** keeps underwriting honest: net insurance margin accrues to the reserve that backs it.
- **⑤** gives ATLAS holders a genuine claim on protocol cash flows, tying token value to real
  revenue (P5) without selling treasury assets. Shares are paid in revenue assets (USDC/SOL), not
  new ATLAS.

Manager-side fees (75% of R1, 80% of R2) are paid to the manager account, net of deferral,
co-pay obligations, and insurance contributions described in Section 4.5.

**Auditability:** every flow above is recorded in the vault/staking programs or the revenue
ledger service and reconciled monthly by independent accounting; distribution splits are
governance parameters, not per-transaction discretion.

---

# 3. Investor Economics

## 3.1 Deposit and share issuance

Investors deposit a supported base asset (USDC, USDT, SOL, LSTs) into a vault. The `vault`
program mints vault shares at the current net asset value per share (NAVPS):

```
NAVPS = NAV / shares_outstanding
shares_minted = deposit_amount / NAVPS
```

- **Anti-dilution.** Shares are always priced at current NAV, never at a stale or historical
  price, so an incoming deposit cannot dilute existing holders (fee accrual and P&L are
  continuously incorporated into NAV by the performance oracle).
- **Minimum deposits.** `min_deposit` is enforced per vault (default $1,000 retail, $250,000 for
  institutional vaults) to bound operational overhead per holder.
- **Deposit fees.** Zero by default. A deposit fee (max 50 bps) is a governance-permitted
  instrument for capped-capacity vaults to price congestion; none is charged in the base
  configuration.
- **Oracle pricing.** NAV is computed by the performance oracle from ClickHouse transaction
  ingestion (architecture.md: data flow). Scaffold 1:1 pricing is replaced at Phase 2 (roadmap.md)
  with oracle-signed NAVPS; until then, share math is exercised only with flat deposits.

## 3.2 Performance measurement

Performance is measured per vault as **time-weighted return** (TWR) on NAVPS, and per manager as
a portfolio of vaults:

- **NAV**: sum of marked positions (LP tokens at oracle prices, deposits, receivables) net of
  accrued fees.
- **APY**: annualized compound return over the trailing window with daily marking.
- **Risk-adjusted**: Sharpe (daily, 0% floor), Sortino, Calmar, max drawdown, volatility,
  expected shortfall — per `risk-engine.md`.
- **High-water mark (HWM)**: the peak NAVPS ever achieved by a manager-vault pair, **continuous
  across manager re-registration and vault clones** (Section 8, countermeasure HWM-restart). A
  performance fee accrues only against gains above HWM.
- **Attribution**: returns are attributed to manager decisions vs. market beta using the
  strategy's stated benchmark (e.g., buy-and-hold of the underlying asset), exposing managers
  whose "performance" is unhedged beta rather than skill.

## 3.3 Fees charged to investors

Investors pay only what is earned and only when value is received:

| Fee | Charge | When |
| --- | --- | --- |
| Management | 75 bps/yr of NAV (blended; 50–150 by risk tier) | Accrued daily on NAV |
| Performance | 15% of gains above HWM | Accrued at HWM breach; crystallized at withdrawal or vault closure |
| Standard exit | 0 bps | Redemption via standard queue (T+1..T+7) |
| Expedited exit | 25 bps (24–72h), 50 bps (instant) | Priority queue |
| Deposit | 0 bps | Base configuration |
| Insurance premium | 10–30 bps/yr | Deducted from vault NAV, to insurance reserve |

Investors holding **veATLAS** (Section 7.2) receive fee discounts (management fee credit up to
40 bps and exit-fee waivers) tied to lock duration — a utility benefit funded by revenue
redundancy, not a yield subsidy.

## 3.4 Withdrawals, redemption queues, and gates

Withdrawal liquidity is engineered to be **orderly under all but impossible stress**, using a
two-tier redemption system:

1. **Standard queue (default).** A redemption request enters a queue keyed to the next
   settlement epoch (daily, T+1). Requests are filled pro-rata from vault liquidity, in
   queue order, at the settlement NAVPS. Cost: 0 bps.
2. **Priority queue.** Expedited exits settle within 24–72h (25 bps) or, if vault liquidity
   permits, instantly (50 bps). Priority fill is bounded to a fraction of daily liquidity so that
   expedited demand cannot dry out the standard queue (Section 11.4).
3. **Gates.** The risk engine can suspend redemptions in defined stress conditions (a `pause`
   state per `risk-engine.md`); suspension is automatic for critical violations and time-limited
   (max 30 days, extendable only by governance with a supermajority and public justification).
   Suspension does not suspend *management* of remaining assets; it prevents runs at stale prices.
4. **Pro-rata settlement.** If a vault's liquid assets are insufficient for aggregate demand,
   all claimants settle pro-rata, preserving fairness (no queue-priority arbitrage against
   liquidation proceeds).
5. **Lookback pricing (anti-front-running).** For large vaults (AUM > $50M) governance may enable
   a 24h TWAP NAVPS for redemption pricing, removing the incentive to front-run settlement
   epochs with market moves.

**Withdrawal liquidity provisioning** is covered in Section 11.4: managers maintain a liquidity
buffer (default 10% of vault NAV in cash or 7-day-settling stable positions), the allocation
engine enforces a **10% protocol cash reserve**, and settlement is staged so that marketable
positions are unwound on-chain in slippage-aware chunks rather than atomically dumped.

## 3.5 Capital protection stack

Investor capital is protected by eight stacked, complementary mechanisms — deliberately
redundant because protection is only as strong as the weakest layer:

| Layer | Mechanism | Protects against | Enforced by |
| --- | --- | --- | --- |
| L1 | Manager bonding (Section 4.3) | Manager misconduct | staking program, slashing |
| L2 | Deferred compensation + clawback (4.5) | Risk-shifting near fee crystallization | Fee escrow, clawback |
| L3 | Real-time risk engine + circuit breakers (risk-engine.md) | Drawdowns, concentration, toxic exposure | Automation → on-chain `set_status` |
| L4 | Systematic diversification (9.5) | Single-manager/protocol/token failure | Allocation engine caps |
| L5 | Cash reserve + redemption queue (3.4, 11.4) | Liquidity crunches, runs | Vault + allocation engine |
| L6 | Insurance reserve (Section 6) | Exploits, oracle/governance/custody failures | Insurance governance + claims |
| L7 | Treasury backstop (Section 5) | Insurance reserve depletion, systemic events | Treasury policy |
| L8 | Transparency (oracle-signed NAV, open data) | Hidden risk, misvaluation | Performance oracle, audits |

**Explicit non-protections** (stated in every vault risk disclosure): market losses, impermanent
loss in the ordinary course, slippage, depeg of collateral assets held by design, and manager
misconduct net of bond. These are **allocated and reported**, not insured (P6).

## 3.6 Economic incentives by investor archetype

The protocol does not subsidize any investor type. It aligns each archetype with the health of
the system through fee structure, liquidity design, and governance access:

| Archetype | Horizon | Rational incentive design | What they pay for |
| --- | --- | --- | --- |
| Short-term / retail | Days–weeks | No subsidies. Expedited exits priced (25–50 bps); HWM protects their entry price; insurance premium is their tail hedge. | Price of optionality + insurance |
| Long-term / retail | Quarters–years | Compounding via NAV; HWM prevents fee double-charge; no exit fee on standard queue; veATLAS discounts for locked intent. | Continuous professional management |
| DAO treasuries | Multi-year | High-conviction vaults, policy-grade reporting (R8), parameterized risk profiles, insurance coverage; fee discounts via veATLAS. | Governance-grade risk + reporting |
| Institutions | Multi-year | KYC-gated vaults, audited NAV reports, dedicated settlement terms, white-glove onboarding, capped exposure, insurance with defined coverage. | Fiduciary-grade operational risk management |
| Treasury managers (protocols) | Perpetual | Segregated vault templates, stop-loss/auto-rebalance parameters, fee share rebates for protocol partners deploying treasury capital. | Turnkey allocation + custody |

**Anti-subsidy rule:** the protocol never pays APY boosts, liquidity-mining rewards on deposits,
or deposit rebates. Any incentive program must clear the *Return-on-incentive* test (Section
13.2): expected incremental protocol revenue over the program must exceed its cost.

---

# 4. Liquidity Manager Economics

The manager is the protocol's core producer. The entire economic design around managers answers
one question: **how does the protocol make it strictly more profitable to be a disciplined,
skilled manager than to be a reckless one?**

## 4.1 Qualification

Managers are onboarded through a staged gate that mixes identity, evidence, and capital:

1. **Identity & legal standing (KYB).** Entity registration for institutional managers;
   individual registration with KYC for retail-tier managers. Ensures slashing, clawback, and
   claims can actually reach a legal person (bonds are on-chain; responsibility is off-chain).
2. **Track record evidence.** A verifiable history of LP operations (wallet-level, pool-level)
   submitted at registration and cross-checked against the indexer before any allocation.
3. **Strategy definition.** A parameterized strategy (Section 9.6) with declared benchmark,
   allowed venues/tokens/leverage envelope, and operational limits, validated by the Strategy SDK.
4. **Code and security review.** For SDK-based automated strategies, a standard audit checklist;
   flagged strategies require an independent audit before listing.
5. **Bond posting.** Per Section 4.3.
6. **Trial allocation.** New managers begin at a **sandbox size** (max 2% of vault NAV, capped at
   $250k) and graduate by demonstrated performance, not by promise.

Qualification is a *risk-tier* decision (tier 1–5 per `manager-score.md`), made by governance
for onboarding policy and by the allocation engine for sizing (Section 9.5).

## 4.2 Credibility

Credibility = identity + history + money + marks, each independently verifiable:

- **Identity** (KYB/KYC) anchors a single manager to a single legal person across wallets —
  the backbone of sybil resistance (Section 8.3, AV-10).
- **History** is the on-chain track record, ingested at full fidelity; only *verified* activity
  counts toward score inputs.
- **Money** is the bond (4.3) and deferred compensation (4.5) — cash the manager can lose.
- **Marks** are third-party attestations: audit reports, security reviews, and optional
  verifiable credentials from recognized DAOs or institutions.

Reputation is the *present value of future delegated capital*: managers with high scores get
more capital, at lower bonds, at better fee terms. The score is thus a productive asset that
rewards investment in it and punishes betrayal of it.

## 4.3 Bonding

The `staking` program implements a bonded escrow per manager. Bond policy:

| Risk tier | Score range | Bond (% of delegated capital) | Minimum | Maximum |
| --- | --- | --- | --- | --- |
| 1 | ≥ 85 | 0.25% | $25k | $250k |
| 2 | 70–84 | 0.50% | $25k | $500k |
| 3 | 55–69 | 1.00% | $25k | $750k |
| 4 | 40–54 | 1.50% | $50k | $1M |
| 5 | < 40 | 2.00% | $50k | $2M |

- **Composition:** 50% ATLAS, 50% stablecoin. The ATLAS leg aligns the manager with protocol
  health; the stable leg guarantees slashability against token-price volatility.
- **Top-up covenant:** the bond must be maintained within 5% of requirement; shortfall triggers
  a 7-day top-up window, after which the manager is suspended and capital is deallocated.
- **Unbonding:** withdrawal of a bond is a two-stage process: 30-day cooldown (matching the
  existing `UNBOND_COOLDOWN_SLOTS` mechanism), then claim; **if any claim or adjudicated
  misconduct is pending, unbonding is frozen until resolution.** Bond cannot be withdrawn while
  any delegated capital remains outstanding.
- **Bond economics:** the bond is *not* insurance against market loss — it is insurance against
  **misconduct**. Its size is set to make misconduct a strictly losing strategy (expected
  confiscation ≥ expected illicit gain), and capped so it does not price out honest managers.

## 4.4 Delegated capital assignment

Capital is assigned by the allocation engine (Section 9.5), not by manager application:

- The engine computes raw weights from score, risk, fee efficiency, consistency, volatility
  decay, and track record; then enforces hard caps (30% per manager, 40% per protocol, 20% per
  token, 10% memecoin, 25% stable-pool, 10% cash reserve).
- **Graduation ladder:** sandbox (≤2% NAV, ≤$250k) → trial (≤5% NAV, ≤$1M) → full tier
  allocation, gated by consecutive scoring epochs above threshold (Section 9.4).
- **Deallocation** is automatic on risk violations, score decay below floor, or governance
  action; proceeds return to the vault's cash reserve and are reallocated in the next epoch.
- **Managers cannot buy allocation.** ATLAS holdings and veATLAS boosts influence only fee
  discounts and governance, never the *score* that drives allocation (Section 9.1).

## 4.5 Compensation

Managers earn the manager-side split of vault fees:

- **Management fee:** 75% of the 50–150 bps management fee (i.e., ~37.5–112.5 bps), paid
  monthly from accrued NAV. This is *operation income* — available only while actively managing.
- **Performance fee:** 80% of the 15% performance fee above HWM. Crystallized at withdrawal,
  vault close, or manager-vault separation, **subject to the deferral rule** below.
- **Deferral & clawback (anti risk-shifting):** 50% of performance fees are deferred into a
  6-month rolling escrow. If within 6 months of crystallization the vault breaches a
  misconduct condition (Section 4.7) or the manager is found to have shifted risk before
  crystallization, the deferred amount is forfeited to the vault (re-credited to investors) up
  to the clawback limit. Deferral means a manager cannot "earn, then gamble."
- **Co-pay:** managers contribute 10 bps/yr of delegated capital to the insurance reserve as a
  co-insurance stake, aligning them with the system's tail risk (they pay for the insurance that
  protects their investors).
- **Fee laddering:** management fees step down by 10–25 bps as a manager's delegated capital
  crosses scale thresholds ($10M, $50M, $150M), returning scale economies to investors and
  discouraging "asset gathering for its own sake."

**Compensation evolution over time:** as a manager's score rises, they receive (i) larger
allocations, (ii) lower bond requirements, (iii) faster settlement priority, and (iv) access to
institutional vault products. As score decays, all four reverse. Compensation is thus a *state
variable* tied to reputation, not a fixed entitlement.

## 4.6 Poor performance vs. protocol misconduct — the dividing line

The single most important governance of manager economics is the distinction between two very
different events:

| | Poor market performance | Protocol misconduct |
| --- | --- | --- |
| Definition | Risk-adjusted returns below benchmark or score threshold | Violation of listed conduct rules, evidence-based |
| Cause | Market regime, IL, fee decay, strategy underperformance | Intent, negligence, deception |
| Consequence | Deallocation, score decay, tier downgrade, fee-ladder reversal | Slashing, suspension, ban, clawback, referral to authorities |
| Bond at risk | No | Yes |
| Appeal basis | Statistical — "is the process sound?" | Evidentiary — "did the manager do it?" |
| Time to resolve | Continuous (scoring epochs) | Formal process (Section 4.9) |

**Misconduct is an enumerated list**, not a vague standard. The list (subject to governance
amendment) comprises:

1. **Misrepresentation** — false statements in registration, strategy definition, or reporting.
2. **Front-running / self-dealing** — trading ahead of vault orders or trading against the vault.
3. **Wash trading / performance fabrication** — generating self-referential volume or fake fees
   (Section 8.3, AV-1).
4. **Unauthorized risk** — exceeding the declared strategy envelope, leverage cap, or venue list.
5. **Oracle manipulation** — attempting to move pricing inputs used by the scoring system.
6. **Key-compromise negligence** — failing to secure operator keys (loss, shared custody failure).
7. **Collusion** — coordinated behavior with other managers or venue insiders to distort
   allocation or pricing (Section 8.3, AV-9).
8. **Custody deviation** — moving vault assets outside declared custody or venues without
   authorization.
9. **Refusal to cooperate** — obstructing audits, claims, or the risk engine.

Anything not on the list is treated as performance, and only performance consequences apply.

## 4.7 Slashing

Slashing is the *misconduct-only* financial penalty, executed on-chain by the slash authority
into the insurance escrow (per `staking` program design):

| Misconduct class | Slash range (% of bond) | Trigger / evidence |
| --- | --- | --- |
| Minor (e.g., reporting negligence) | 5–25% | Audit finding, self-reported |
| Moderate (e.g., unauthorized risk within limits) | 25–50% | Risk engine evidence + review |
| Severe (e.g., wash trading, front-running) | 50–100% | Indexer evidence + independent panel |
| Critical (e.g., key compromise, custody deviation) | 100% + clawback | Incident response + panel + governance |

- **Evidence standard:** slashing ≥25% requires indexer evidence (on-chain trace) plus a review
  panel; ≥50% requires the full appeals process (4.9). Slashing is never automatic from a
  single metric breach — only misconduct triggers it.
- **Slashing consequences cascade:** bond confiscation → `Suspended` status → deallocation →
  on second offense, `Banned` status with registry revocation. Escalation is stored in the
  `slash_count` field.
- **Slashing and insurance interaction:** slashed bond proceeds go to the insurance escrow
  (protecting the victims of misconduct first); investor losses from misconduct beyond the bond
  are claimable against the reserve as a residual backstop (Sections 6.1, 6.6) — the bond and
  the reserve both respond, in that order, never double-paying the same loss.

## 4.8 Suspension and recovery

**Suspension** (`ManagerStatus::Suspended`) is imposed by: (i) automatic risk-engine critical
violation, (ii) bond shortfall, (iii) a slashing event, or (iv) governance order. Suspension
freezes new allocations, halts the manager's ability to rebalance beyond risk-reduction trades,
and moves the manager's delegated capital into the redeployment queue.

**Recovery pathways:**

1. **Process-based recovery (performance suspension):** the manager's score recovers through
   sustained verified performance (Section 9.4); suspension lifts automatically when the vault
   returns to `active` risk status and the manager's metrics clear thresholds.
2. **Remediation-based recovery (conduct suspension):** for moderate misconduct, a
   remediation plan (additional controls, refreshed keys, external audit) approved by the review
   panel; re-entry begins at the sandbox tier, not the prior tier.
3. **Progressive re-entry:** after any suspension, the manager re-enters at 50% of prior
   allocation size for a probation period of 90 days before full restoration, so that post-incident
   performance is re-verified rather than assumed.

**Appeals:** managers may appeal any slashing, suspension, or ban. Appeal mechanics are a
governance process (Section 4.9) with an independent panel, an evidence window, and a
supermajority governance ratification for penalties above 50% of bond. Unbounded appeals are
prevented by a 30-day window and a required bond for appeal.

**Reputation rebuilding:** the score is a memory function (Section 9.4); a manager who rebuilds
on honest evidence rebuilds score. The registry records incident history on the profile, so the
*market* (investors, institutions) sees recency and severity — reputation damage is persistent,
recovery is possible, and neither is fully at the manager's or the protocol's discretion alone.

## 4.9 Appeals, adjudication, and dispute resolution

Dispute resolution is a defined process with single path (no forum-shopping), published
evidence standards, and bounded duration. Its purpose is to make penalties *credible and
reviewable* without making them *endless*.

1. **Scope.** Appeals may be filed against: slashing of any size; suspension or ban decisions;
   bond top-up demands; claim denials under the insurance policy (6.4); and score-dispute
   determinations where a manager alleges input error.
2. **Bodies and roles.** (i) The **review panel** — independent domain experts (LP operators,
   security researchers, quant analysts) drawn from a governance-ratified roster, rotated per
   case, and conflict-screened against the parties; (ii) the **claims committee** (6.4) for
   insurance disputes; (iii) **governance** as the final ratifier for penalties ≥50% of bond,
   which require a supermajority vote on the evidence record alone — no new advocacy.
3. **Procedure.** A 30-day filing window; a 14-day evidence window (on-chain trace, logs, written
   submissions); a written decision within 30 days. Standard of review is **evidentiary** for
   misconduct findings ("did the manager do it?") and **statistical/process** for performance
   findings ("is the scoring process sound?"). The distinction preserves the misconduct-vs-
   performance boundary from 4.6.
4. **Appeal bond.** Filing requires a refundable bond (0.5–2% of the penalty at stake, tier-
   scaled) covering panel costs. It is refunded on success and forfeited on a frivolous or
   strategic appeal — which caps rent-seeking on the process.
5. **Stay versus enforcement.** Appeals do not stay enforcement: bond confiscation, suspension,
   and deallocation proceed while the appeal runs, because capital cannot wait on a calendar. A
   successful appeal triggers full restitution (confiscated assets or equivalent) and status
   reinstatement with the manager's scoring memory preserved as of the incident.
6. **Finality and bounds.** Panel decisions are final unless they exceed 50% of bond (governance
   ratifies) or alter a constitutional rule (12.2); the process never manufactures a new penalty
   category outside the enumerated misconduct list (4.6). All decisions and rationales are
   published, forming the precedent base that keeps the system predictable for managers and
   investors alike.

---

# 5. Protocol Treasury Economics

## 5.1 Role and sources of treasury assets

The treasury is the protocol's **balance-sheet** — its solvency buffer, policy instrument, and
growth capital. It is distinct from the insurance reserve (which is actuarially ring-fenced) and
from the operating fund (which is expensed runway).

Sources, in priority order:

1. Protocol fee share (Section 2.4, flow ③).
2. Listing, placement, analytics, API, reporting, and white-label revenue (flows R3–R9).
3. Insurance net margin once the reserve is at target (flow ④ overflow).
4. Slashing recoveries not otherwise applied to claims.
5. Bootstrap token allocation (Section 7.4) — a one-time, size-limited endowment.
6. Yield on treasury assets themselves.
7. Optional: strategic financing rounds in the institutional stage (Section 15.4).

## 5.2 Diversification policy

The treasury maintains a target allocation with governance-set bands and a rebalance rule:

| Asset class | Target | Band | Rationale |
| --- | --- | --- | --- |
| Stablecoins & stable yield | 50% | 40–65% | Solvency, claims readiness, zero-correlation with crypto drawdowns |
| SOL & blue-chip major assets | 25% | 15–35% | Upside participation, protocol alignment |
| Protocol-owned liquidity (POL) | 15% | 5–25% | Supports Atlas' own marketplace; earns fees; committed for governance not trading |
| Strategic ecosystem positions | 10% | 0–15% | Network effects, integrations, manager alignment |
| High-volatility / speculative | 0% | 0–5% | Explicitly excluded except via approved strategic programs |

Rebalancing is slow (quarterly bands, no churn), executed by the treasury sub-DAO within the
governance system, and audited. **No treasury asset may be lent, leveraged, or placed at risk by
any single counterparty beyond the diversification caps** — the treasury is the protocol's
lifeboat and is operated like one.

## 5.3 Deployment categories and policies

| Deployment | Policy | Guardrails |
| --- | --- | --- |
| Operating expenses | 24-month runway held in stablecoins | Quarterly budget by governance; expense committee |
| Audits & security | Recurring ≥ 10% of OpEx | Independent firm rotation, bug-bounty pool funded |
| Grants & ecosystem incentives | ≤ 15% of treasury inflows/yr | Milestone-based vesting; R.O.I. test (13.2) |
| Insurance backstop | Standing commitment to top up reserve (Section 6.5) | Called only when reserve < solvency floor |
| Emergency liquidity | Standby pool ≥ 1% of TVL in stables, never invested long | Released only on stress trigger (11.4) |
| Strategic investments | ≤ 10% band, deal-by-deal governance | Board/committee diligence, disclosure |
| Protocol-owned liquidity | Within 15% band | Governance-selected vaults, staggered entry |
| Buybacks | Discretionary, valuation-gated | Only when ATLAS trades below intrinsic estimate and treasury solvency is untouched (Section 5.4) |
| Token & veATLAS revenue share | Fixed 15% waterfall flow | Paid in revenue assets, not treasury principal |

## 5.4 Buybacks

Buybacks are a **discretionary, valuation-gated** instrument, not a price-support program:

- **Condition:** treasury net revenue is positive over the trailing 4 quarters; the insurance
  reserve is at target; the operating runway exceeds 18 months; and ATLAS trades at a
  material discount to the treasury's intrinsic estimate (net fee-stream DCF + net asset value).
- **Execution:** buyback-and-*redistribute* to veATLAS holders in the revenue-share bucket
  (preferred), or buyback-and-*burn* only on explicit governance authorization with supermajority.
- **Rationale:** distribution to locked holders rewards patient capital without creating a
  continuous repurchase obligation; burning permanently removes supply only when the protocol
  demonstrably has surplus it will never need.

## 5.5 Governance and controls over the treasury

- **Spending ladders:** minor ops (≤$50k) — executive; medium (≤$500k) — treasury sub-DAO with
  timelock (48h); large (≤$5M) — full governance with 10% quorum; strategic (>$5M) — governance +
  independent counsel + public rationale, 15% quorum and supermajority.
- **Separation of duties:** proposer, signer (multi-sig threshold 5-of-9 for on-chain ops),
  auditor (independent quarterly attestation), and custody (permissioned vaults, no single-holder
  control).
- **Transparency:** real-time treasury dashboard, quarterly public reports, annual independent
  audit.
- **Emergencies:** a documented emergency-liquidity trigger (Section 11.4) bypasses deliberation
  but not accountability: all emergency actions are reversible-lagged (2-day public window) unless
  the action is itself protecting solvency.

## 5.6 Treasury scaling from $10M to $10B+

Treasury sophistication must scale with TVL. The design sequences control maturity explicitly:

| TVL stage | Treasury size | Control model | Objectives |
| --- | --- | --- | --- |
| $1–50M | $0.5–5M | Multi-sig + executive | Runway, insurance seed, bootstrap |
| $50–500M | $5–100M | Treasury sub-DAO + committees | Diversify, fund insurance, POL, grants |
| $0.5–2B | $100–400M | Full DAO + professional investment committee | Strategic positions, reinsurance, institutional-grade ops |
| $2–10B | $400M–2B | Independent treasury foundation + DAO oversight | Long-duration investing, RWA allocation, global custody |
| $10B+ | $2B+ | Formalized allocator with sub-funds and fiduciary duties | Systemic role: liquidity of last resort for Atlas ecosystem |

At every stage the invariant is unchanged: **solvency floor first, diversification always,
speculative deployment only with explicit governance consent, and full auditability.**

---

# 6. Insurance Economy

Insurance converts the protocol's *structural* risks (the ones investors cannot price or manage)
into a priced, reserved, governed product, while **explicitly excluding** the risks investors
are paid to bear (market risk, impermanent loss). It is a two-sided good: it protects investors
and it makes the reserve a revenue business that pays for its own solvency.

## 6.1 Coverage and exclusions

**Covered events** (each with a precise, pre-published definition):

| Event class | Example | Notes |
| --- | --- | --- |
| Smart-contract exploits | Exploit of Atlas vault/registry/staking, or of an integrated venue (Meteora, Orca, Raydium, etc.) | Covers loss net of recoveries, capped per policy |
| Automation failures | Rebalancer/circuit-breaker failure causing preventable loss beyond manual baseline | Requires automation-log evidence |
| Governance failures | Malicious or erroneous governance action causing capital loss | Actions still in timelock reviewable; covers executed harm |
| Oracle failures | Stale/wrong NAV or score inputs causing loss to investors | Not covers a *decline* accurately reported |
| Custody failures | Loss of keys, bridge failure on a supported route | Self-custody with defined key-security standard |
| Operational errors | Settlement errors, mis-priced mint/redeem, fee mischarges | Net-credited loss |
| Slashing recoveries | Manager misconduct (bond confiscation) | Bond + insurance respond in order, no double payment |

**Exclusions** (never covered, in every policy):

- **Market risk** — any decline attributable to prices, IL, slippage, liquidity, or funding.
- **Impermanent loss** in the ordinary course of liquidity provision (it is a managed,
  allocated, reported parameter — Section 9.2 — not an insurable event).
- **Manager misconduct** — the manager's own bond responds first (4.7); the insurance reserve
  absorbs only the *residual* loss beyond bond capacity, subject to the evidence standard and
  claims process (layers B → A in 6.6). Misconduct is not an ordinary covered event under the
  investor policy, and no loss traceable to the manager's uninsured risk appetite is covered.
- **Depeg of held collateral by design** — unless an optional stablecoin-integrity rider is
  purchased (covers catastrophic, non-market depeg events with a standing definition).
- **Regulatory / legal / tax events**, force majeure, fork divergence, and war acts.
- **Loss of upside** (opportunity cost is never "loss").

**Co-insurance:** 5–10% of any covered loss is borne by the claimant, aligning loss-mitigation
incentives (insureds who act promptly and honestly recover more).

## 6.2 Capitalization

The insurance reserve is capitalized from five ordered sources:

1. **Premiums** — 10–30 bps/yr on insured TVL, charged per vault (Section 6.3 pricing).
2. **Slashing proceeds** — confiscated bonds (flow into the insurance escrow).
3. **Waterfall flow ①** — up to 1% of TVL target from protocol revenue before other distributions.
4. **Treasury backstop commitment** — standby (Section 5.3), released only when reserve breaches
   the solvency floor.
5. **Bootstrap endowment** — initial token allocation dedicated to insurance (Section 7.4).

**Target solvency:** reserve ≥ 2% of insured TVL, with an absolute floor of $2M. Target sizing is
derived from tail-loss modeling: the reserve must cover the *single worst modeled event* plus
one simultaneous stress event (Section 14) without falling below 50% of target.

## 6.3 Premium pricing (actuarial)

Premiums are priced from a parameterized actuarial model maintained by the risk engine and
governed by the risk committee:

```
Premium_v = E[L_v] × (1 + margin) + loading_v
```

where `E[L_v]` is expected loss for vault `v` = exposure × empirical event frequency (per venue,
per year, drawn from the incident database) × expected loss-given-event × (1 − recoveries), and
`margin` targets a 20–40% combined-ratio headroom so the reserve **accumulates in the long run**
and covers model error; `loading_v` prices idiosyncratic risk (venue, custody model, manager tier,
correlation with other insured vaults).

Premiums are flat per vault in base configuration (10 bps early-protocol, 20 bps standard, 30 bps
for high-risk tiers), with premium rebates for vaults whose manager holds co-pay stakes and passes
continuous audit attestation. This creates a market: low-risk vaults subsidize less; managers
compete on *insurability* as a product feature.

## 6.4 Claims: evaluation, authorization, payout

| Step | Detail |
| --- | --- |
| Filing | Investor or manager files within 30 days of the event, with on-chain evidence bundle |
| Assessment | Claims committee (independent of both manager and treasury) evaluates against the published event definitions and evidence requirements |
| Adjudication | Small claims (≤$100k) — committee; standard (≤$5M) — committee + 48h governance signal; large (>$5M) — governance supermajority + independent actuarial review |
| Payout | Stablecoins from the reserve escrow; subrogation rights assigned to the protocol for recoveries |
| Record | Every claim, decision, and rationale published; denial rationale published for policy refinement |

Claims are evaluated against **the event definition, not the outcome size** — the question is
"was this a covered structural failure?" not "is this investor sympathetic?" This is what keeps
the boundary between insurance and market protection (Section 6.1) enforceable.

## 6.5 Solvency under systemic events

The reserve is stress-tested quarterly against the Section 14 scenarios:

- **Worst single event:** a large-vault exploit — capped at **20% of reserve** in base design
  via per-event payout caps and coverage limits (max single claim 5% of that vault's TVL, max
  event aggregate 15% of reserve).
- **Correlated events:** two simultaneous exploit/contagion events — reserve must remain above
  the solvency floor by absorbing the treasury backstop (flow ③ → ①).
- **Reserve depletion:** if the reserve falls below 50% of target, premiums for high-risk tiers
  rise (actuarial reload), new coverage issuance for the affected class pauses, the treasury
  backstop activates, and claims above the floor are subject to pro-rata scaling until recovery.
- **Reinsurance:** in the institutional stage, an excess-of-loss reinsurance arrangement with
  external insurers covers events beyond the 15% aggregate cap, capping the reserve's maximum
  loss in any window.

**Insurability is capped, priced, and honest:** the protocol never claims to insure everything,
and its reserve is sized and governed so that it can pay the claims it has promised — which is
the entire value of an insurance product versus a marketing page.

## 6.6 Insurance layers summary

| Layer | Capital | Covers | Responds |
| --- | --- | --- | --- |
| A — Protocol insurance reserve | Premiums + slashing + ① flow + endowment | Structural/security events (6.1) | First |
| B — Manager bond | Manager capital | Manager misconduct | Second (only for misconduct losses) |
| C — Manager co-pay stake | 10 bps/yr of delegated capital | Top of investor deductibles | With A |
| D — Treasury backstop | Treasury solvency assets | Reserve shortfall | Third |
| E — Reinsurance (later) | External insurers | Tail beyond caps | Fourth |

Investor loss from a structural event therefore has A + C (+ D if exhausted); loss from manager
misconduct has B then A; market loss has *none by design* — it is allocated and reported instead.

---

# 7. Token Economics

## 7.1 Purpose and design stance

ATLAS is a **governance and utility token with a claim on protocol cash flows** — not a
liquidity-mining instrument. Its economics are built on the following commitments:

- **No perpetual inflation.** Bootstrap emissions exist, are scheduled, decay to zero, and end
  (Section 7.5). After bootstrap, token supply is fixed (subject only to governance-sanctioned
  buybacks/redistributions).
- **Value comes from cash flows and demand, not emissions.** Token holders' yield is a share of
  real protocol revenue (waterfall flow ⑤) — earned only when the protocol earns.
- **The token is a work token:** it is *used* (locked, bonded, staked) to secure, govern, and
  discount — creating structural demand that rises with protocol activity.

## 7.2 Token utility surface

| Utility | Mechanism | Demand driver |
| --- | --- | --- |
| Governance | 1 ATLAS = 1 vote (weighted by veATLAS lock, 7.3) | Control over fees, risk, treasury, onboarding |
| Revenue share | veATLAS holders share 15% of protocol net revenue | Income — scales with protocol revenue |
| Fee discounts | Management fee credit up to 40 bps; exit-fee waivers; API credits | Cost savings — scales with usage |
| Manager bonding | 50% of bonds denominated in ATLAS | Regulatory/eligibility requirement — scales with manager count and AUM |
| Insurance participation | Optional risk-bearing staking into the insurance pool (earns premium-linked yield, absorbs tail claims) | Yield — scales with insured TVL |
| Allocation gauges | veATLAS gauges steer *governance-level* capital (e.g., treasury POL, incentive programs), never the manager score | Influence — political, not quantitative |
| Ecosystem rewards | Milestone-vested grants to builders/strategists | Incentive — bounded, audited |

## 7.3 Vote-escrowed ATLAS (veATLAS)

veATLAS is the governance-and-income lock:

- **Locking:** ATLAS is locked for 1 week–4 years (non-transferable veATLAS; original ATLAS
  reclaimable at expiry).
- **Weight:** voting weight and revenue-share weight scale with lock *duration multiplier*
  (1.0 at 1 year … 2.5 at 4 years) × locked amount.
- **Rationale:** locks convert transient token holdings into long-horizon governance, aligning
  voters with the long-term health of a protocol that must survive multi-year cycles; they
  simultaneously create supply drawdown (removing ATLAS from float), which concentrates demand on
  a smaller circulating base — a demand effect that requires **no** emissions.
- **Delegation:** veATLAS holders may delegate voting power to experts (protocol-aligned
  delegates), preserving participation without requiring every holder to research every proposal.
- **Anti-bribery note:** locks are non-transferable and non-rentable in protocol design; any
  "rental" requires OTC arrangements that the public lock ledger exposes (Section 8.3, AV-16).

## 7.4 Initial distribution and vesting

Total supply: **1,000,000,000 ATLAS**, all minted at genesis, none after bootstrap expiry:

| Allocation | Share | Terms |
| --- | --- | --- |
| Treasury / DAO endowment | 25% | 4-year linear unlock; treasury policy (Section 5) |
| Ecosystem & grants | 20% | Milestone-vested, R.O.I.-gated (13.2) |
| Protocol insurance fund | 10% | Reserve endowment; released to reserve per solvency schedule |
| Team & core contributors | 20% | 1-year cliff, 4-year linear vest |
| Strategic & seed investors | 20% | 1-year cliff, 3-year linear vest; governance-disclosed |
| Community & launch | 5% | Distributed via verifiable on-chain activity, capped per address |

Bootstrap **emissions** (distinct from the static allocation above) are limited to a declining
program for liquidity incentives, expiring by end of year 4 and never exceeding 2% of supply per
year. After expiry, **no new ATLAS is mintable by any mechanism** without a governance amendment
requiring supermajority and a public 90-day notice.

## 7.5 The no-emissions sustainability argument

The protocol's operational economics (Section 13) are designed so that:

1. **Operations are fee-funded:** breakeven ~$300–400M AUM, with the treasury and insurance
   flows funded first (waterfall 2.4).
2. **Bootstrap emissions are bridge financing:** they buy the liquidity and network effects
   needed to reach breakeven, then expire. Section 13 shows the program remaining solvent even
   if AUM does not reach breakeven, via the endowment and fee revenue.
3. **Token value is cash-flow-backed:** the veATLAS revenue share is a direct dividend-like
   claim on the fee business; it strengthens as AUM grows without any token creation.
4. **Token demand is structural:** locks (governance), bonds (eligibility), and insurance
   staking all require holding, not selling.

The token is therefore **valuable because it is productive**, not because it is scarce. This is
the difference between a sustainable protocol economy and an emission treadmill.

## 7.6 Staking security and insurance participation

Beyond veATLAS governance locking, ATLAS offers two distinct staking modes, kept **strictly
separate** to prevent conflation of roles:

1. **Revenue-staking (veATLAS)** — no principal risk, income share, described above.
2. **Insurance-staking** — voluntary, risk-bearing capital pledged to the insurance reserve;
   earns premium-linked yield and, in the event the reserve is drawn, participates in claim
   absorption (in order after the non-staked reserve). Insurance staking is capped at 30% of
   reserve so the base reserve is never majority-staked, and claims reduce staked principal only
   after free reserve exhaustion. This is the mechanism by which the community can grow the
   insurance pool's capacity in exchange for yield — the same risk/return logic as mutual
   insurance, executed on-chain.

---

# 8. Incentive Architecture and Mechanism Design

This section treats the protocol as a mechanism and derives the incentive properties of every
role. It is organized as: (8.1) participants and their objective functions; (8.2) the
misalignment taxonomy; (8.3) the full attack-vector catalog with economic countermeasures; and
(8.4) the formal properties the design is engineered to satisfy.

## 8.1 Participants and objective functions

| Participant | Objective (rational) | Protocol's design target |
| --- | --- | --- |
| Retail investor | Maximize net risk-adjusted return | Fees only on value; insurance; transparency |
| Institutional allocator | Fiduciary-grade certainty of process | Audited NAV, defined coverage, compliance output |
| Liquidity manager | Maximize lifetime compensation | HWM, deferral, clawback, bond, fee ladder |
| DAO treasury | Long-duration, governed, liquid | Policy-grade reporting, parameterized risk profiles |
| Governance participant | Influence + yield on holdings | veATLAS, revenue share, delegation |
| Treasury sub-DAO | Preserve and grow protocol balance sheet | Diversification policy, spending ladders |
| Insurance provider/committee | Profitable, honest underwriting | Actuarial pricing, evidence-based claims |
| Analytics/API consumer | Cheap, reliable, accurate data | Subscription pricing, SLAs |
| Strategy/manager enablers | Earn from enabling managers | SDK licensing, ecosystem grants |
| Protocol developers | Compensated, continued relevance | Grants, treasury-funded security, career alignment |
| Integrated venue (Meteora, etc.) | Attract deep, stable liquidity | Fee rebates, POL, governance integration |
| Regulator | Systemic stability and fair markets | Transparency, audit trail, legal cooperation |

## 8.2 Misalignment taxonomy

Every role carries a structural conflict. The design treats each as a **first-class engineering
problem**, not a footnote:

| Type | Definition | Atlas manifestation | Primary countermeasure |
| --- | --- | --- | --- |
| Moral hazard | Agent takes risk whose cost falls on principal | Manager gambles post-HWM; insured behaves recklessly; stakers free-ride | Deferral+clawback (4.5); co-insurance (6.1); staking caps (7.6) |
| Adverse selection | Low-quality counterparties self-select | Bad managers apply, good ones don't | Trial allocations, bonding, verified history, market pricing of reputation |
| Principal-agent | Agent's payoff diverges from principal's | Fee-driven asset gathering | Fee laddering, HWM, performance attribution |
| Time-inconsistency | Promises today violate best action tomorrow | Redeem at panic; vault closes after drawdown; manager quits after HWM | Redemption gates, bond cooldown, deferred comp, HWM continuity |
| Collusion | Coordinated deviation beats individual honesty | Manager/venue collusion; staker cartels; governance voting rings | Correlation analytics, multi-oracle, disclosure, quorum |
| Rent extraction | Capturing surplus without producing it | SDK control, key custody, oracle power | Open SDK, permissionless audit, multi-oracle signing |
| Sybil | Fake multiplicity of identities | Fake managers, fake reputation, fake volume | KYB, bond, identity-anchored history, trial caps |
| Free-riding | Benefiting without paying | Non-stakers voting on staker-funded security | staking-capped governance weight; insurance participation for tail cover |
| Governance capture | Controlling the rules to extract value | Whale voting, bribes, vote rental | veATLAS locks, quorum, timelock, committees |

## 8.3 Attack-vector catalog and economic countermeasures

For each vector: **Threat** (how the attack works), **Impact** (what it would extract), and
**Countermeasure** (the economic defense). Where multiple defenses exist they are layered.

### AV-1 Wash-performance (fake fees / fake volume)
- **Threat:** A manager self-trades through own wallets or coordinated parties to fabricate
  `fee_generation` and inflate score.
- **Impact:** Unearned allocation and performance fees; capital mispriced.
- **Countermeasure:** (a) All score inputs are computed from indexer data with **wash filters**
  (self-address, known-relation, and circular-flow detection); (b) fee quality-weighting —
  fees from wash-suspect flows are discounted in `fee_generation`; (c) cross-validation across
  the venue's own on-chain history; (d) wash trading is enumerated misconduct (4.6) with 50–100%
  slash. Costs: attacker pays trading fees, gas, and the bond.

### AV-2 Capital cycling / churn gaming (`tvl_growth`)
- **Threat:** Managers cycle deposits to show TVL growth or fee generation without genuine
  retention.
- **Impact:** Score inflation; misleading leaderboard.
- **Countermeasure:** `tvl_growth` and `capital_retention` are computed on **holding-weighted,
  flow-adjusted** capital (net of circular deposits, filtered for withdrawal/re-deposit
  patterns); retention is measured relative to *organic* capital; churn (gross-in/gross-out
  ratio) directly deflates growth credit (Section 9.2).

### AV-3 Fee farming (harvesting protocol incentives)
- **Threat:** Extract treasury/ecosystem incentives by minimal-activity deposits designed only
  to qualify for rewards.
- **Impact:** Wasted treasury; diluted incentives.
- **Countermeasure:** The R.O.I. test (13.2) governs all incentive programs; rewards are
  activity-weighted (delegated capital × quality score), never flat deposits; milestone vesting.

### AV-4 Fee-dilution and deposit front-running
- **Threat:** A depositor inserts large capital just before a fee crystallization to be diluted
  into a fee the previous holders earned.
- **Impact:** Cross-investor wealth transfer.
- **Countermeasure:** Fees accrue continuously on NAV (not at discrete events); NAVPS is always
  current (3.1); no backward-dated pricing. Deposits at NAV, redemptions at NAV — no stale price
  to arbitrage.

### AV-5 NAV/share-price manipulation
- **Threat:** Manipulate inputs (oracle feed, mark) to misstate NAVPS and steal from mints/redemptions.
- **Impact:** Arbitrage against other holders; insurance payouts.
- **Countermeasure:** Oracle-signed NAV with multi-source aggregation (median of ≥3 independent
  feeds); TWAP fallback; large-move deviation flags that trigger manual verification; mark
  prices from venue-transaction data, not single pool spot.

### AV-6 Oracle manipulation of underlying pools
- **Threat:** Flash-swap or wash-trade pressure on an integrated pool to move the price used in
  scoring or NAV at an epoch boundary.
- **Impact:** Sniped scores, mispriced NAV, manufactured drawdowns/violations.
- **Countermeasure:** Metrics use **TWAP/volume-weighted** sampling, not point-in-time spots;
  epoch boundaries are randomized-by-slot and oracle-time-stamped; a 1% intra-epoch deviation
  threshold discards anomalous samples; manipulation attempt is slashable misconduct.

### AV-7 Risk-shifting after fee lock-in
- **Threat:** Once performance fees are crystallized (HWM reached), a manager increases risk to
  chase further upside while downside is borne by investors.
- **Impact:** Expropriation of investor downside at manager's option.
- **Countermeasure:** Deferral + clawback (4.5) — 50% of performance fees held 6 months;
  tail-risk monitors (risk-engine) that flag "post-crystallization risk drift"; risk-adjusted
  scoring that rewards Sharpe not raw return; co-pay (manager pays insurance premium).

### AV-8 High-water-mark reset gaming
- **Threat:** Close a vault, reopen under a fresh manager entity/vault clone, and reset the HWM,
  collecting performance fees on the recovery of prior losses.
- **Impact:** Double-charging investors for a round trip.
- **Countermeasure:** HWM is a **continuous ledger attached to the manager identity**, persisting
  across re-registration, vault clones, and renames; governance ratifies HWM continuity rules for
  material-affiliate entities. P5: fees on *new* gains only.

### AV-9 Manager collusion (allocation gaming)
- **Threat:** Multiple managers coordinate (segment markets, share positions) so each shows
  high fee generation in its niche, gaming the leaderboard and splitting the spoils.
- **Impact:** The leaderboard prices collusion, not skill.
- **Countermeasure:** Cross-manager **correlation analytics**: pairwise position/return
  correlation above threshold (0.6) triggers a joint-exposure flag; correlated managers are
  treated as one exposure for concentration caps; known-affiliate graph is part of wash filters;
  score credit is reduced for correlated-concentration.

### AV-10 Sybil manager identities
- **Threat:** One operator registers N identities to multiply sandbox allocations, bonds' value,
  and leaderboard presence.
- **Impact:** Concentration without the optics of concentration.
- **Countermeasure:** KYB anchors identity; sandbox allocations are per-identity and per-entity;
  aggregate (identity-graph) exposure counts toward the 30% manager cap; wash filters include the
  affiliate graph; repeated bans carry permanent registry marks.

### AV-11 Governance capture (whale voting / bribery)
- **Threat:** A concentrated holder (or coalition) votes through self-serving parameter changes
  (fee cuts, bond reductions, treasury transfers).
- **Impact:** Protocol value extraction by a minority.
- **Countermeasure:** veATLAS time-lock (long lockers dominate); escalating quorum by decision
  class (12.3); 48h–7d timelocks with public debate; supermajority for treasury/protocol-critical
  changes; independent committee roles for slashing/claims; public lock ledger exposing vote
  rental (7.3).

### AV-12 Treasury theft (rogue proposal)
- **Threat:** A malicious or compromised proposal moves treasury assets.
- **Impact:** Capital loss; trust collapse.
- **Countermeasure:** Spending ladders (5.5); multi-sig execution layer (5-of-9) that cannot be
  updated by governance alone within one epoch; 2-day public emergency window; independent audits.

### AV-13 Insurance fraud (self-inflicted exploit)
- **Threat:** A manager or insured orchestrates a "hack" (or colludes with an attacker) to claim
  insurance.
- **Impact:** Reserve depletion; premium inflation for honest users.
- **Countermeasure:** Evidence-standard claims (6.4); slashed-bond-first ordering (4.7);
  subrogation rights; affiliate/wash filters on the incident trace; claims committee independence;
  permanent ban + referral for fraudulent claims; co-insurance makes fraud unprofitable.

### AV-14 Withdrawal-queue front-running
- **Threat:** Large holders monitor the redemption queue and front-run settlement epochs.
- **Impact:** Adverse selection against smaller/patient holders.
- **Countermeasure:** Pro-rata settlement (3.4); lookback TWAP pricing for large vaults;
  expedited exit fees price queue priority; gates stop runs at stale prices.

### AV-15 Vault griefing (malicious pauses/rebalances)
- **Threat:** Repeatedly trigger pause/rebalance cycles to harvest exit fees or disrupt
  competitors.
- **Impact:** Economic churn, management paralysis.
- **Countermeasure:** Pause is evidence-gated (risk-engine criteria, not discretionary);
  rebalance cost is borne by the triggering condition (slippage tracked and attributed);
  governance can levy a churn fee on provable griefing; circuit breakers have cooldown/reset
  logic.

### AV-16 Vote-rental and lock-leasing
- **Threat:** Renting veATLAS locks OTC to buy governance outcomes without economic exposure.
- **Impact:** Governance power decoupled from long-horizon interest.
- **Countermeasure:** Locks are non-transferable; the lock ledger is public (rental is
  detectable as abnormal transfer patterns); quorum + committee checks for sensitive votes;
  long-lock requirements for protocol-critical proposal classes.

### AV-17 Credential / API abuse
- **Threat:** Sharing paid API/analytics credentials beyond license scope, or scraping to
  resell.
- **Impact:** Revenue loss; data competitive advantage erosion.
- **Countermeasure:** Per-key rate/seat limits, usage analytics, watermarking, legal terms;
  white-label deployments license narrowly (per deployment), with audit clauses.

### AV-18 Malicious rebalancing (manager harms LPs for personal gain)
- **Threat:** A manager executes rebalances that front-run their own benefit or damage vault
  holders (e.g., dumping a position to move a correlated position).
- **Impact:** LP loss; market impact costs.
- **Countermeasure:** Rebalance slippage and timing are tracked and attributed; order-flow
  analysis flags self-interested timing; misconduct list covers self-dealing (4.6); deferral
  escrow is the damage fund.

### AV-19 Score-threshold sniping
- **Threat:** Timing activity to cross score/tier thresholds at epoch boundaries (inflate fee
  generation at scoring close).
- **Impact:** Tier system gamed; bond under-sized relative to risk.
- **Countermeasure:** Metrics are rolling/decayed (9.4) — no single-epoch spikes; threshold
  crossing requires sustained condition (consecutive epochs); epoch sampling is randomized.

### AV-20 Insurance-reserve draining via correlated catastrophe
- **Threat:** A single systemic event (venue exploit + custody failure simultaneously) hits the
  reserve beyond caps.
- **Impact:** Reserve insolvency.
- **Countermeasure:** Per-event aggregate caps (15% of reserve); coverage caps per vault (5% of
  vault TVL); reinsurance at institutional stage; treasury backstop; solvency floor (6.5). This
  is explicitly a *solvency* design, not a guarantee design (P6).

### AV-21 Liquidity-miner coordination (venue-side)
- **Threat:** An integrated venue manipulates its own fee/reward schedule to attract Atlas
  capital it then extracts (feefarming by the venue).
- **Impact:** Misallocation into structurally extractive venues.
- **Countermeasure:** Venue fee analysis (fee decay, reward sustainability) in the risk engine;
  venue concentration caps (40%); governance venue listing as a gate; POL/rebate terms negotiated
  contractually.

## 8.4 Formal mechanism properties

The design targets the following game-theoretic properties. Each is a *design goal* validated by
scenario analysis (Section 14) and, post-launch, by the mechanism-audit program (Appendix A.6):

1. **Incentive compatibility (IC):** no participant can gain by deviating from honest behavior,
   accounting for bonds, deferrals, HWM, co-insurance, and evidence-based slashing. Enforced
   primarily by the *cost of deviation* (bond confiscation, clawback, reputation loss) exceeding
   its *expected benefit* (trial caps keep the upside small before trust is proven).
2. **Individual rationality (IR):** every participant's expected value of joining exceeds its
   outside option — investors beat DIY net of fees (2.2), managers obtain capital they could not
   otherwise raise (4.4), token holders earn without inflating supply (7.5).
3. **Budget balance:** protocol cash flow is non-negative in steady state (Section 13), so no
   perpetual subsidy is required; bootstrap costs are budgeted with a hard expiry.
4. **Sybil resistance:** identity (KYB) + bond + trial-cap make fake multiplicity unprofitable.
5. **Collusion resistance:** correlation analytics and joint-exposure accounting raise the
   coordination cost of cartels above their benefit.
6. **Robustness:** the dominant strategy in each role is *informative* — truth-telling,
   fee-earning, and risk-disciplined behavior all dominate their gaming counterparts, because the
   payoffs of gaming are capped (bonds, caps, evidence) while the payoffs of honesty compound
   (reputation, allocation, fee ladder).

---

# 9. Quantitative Capital Allocation

Capital allocation is the protocol's core intellectual product. This section specifies the full
metric stack, the score formula (matching `manager-score.md` and its on-chain implementation in
`programs/manager-registry`), its time dynamics, and its manipulation resistance.

## 9.1 Principles

- **All inputs are on-chain-observable** (venue transaction data, wallet flows, pool states).
  Nothing a manager self-reports enters the score.
- **Risk-adjusted returns dominate raw returns.** The protocol pays for *how returns were
  earned*, not how large they are (P2).
- **The score drives allocation; ATLAS holdings never touch it.** Governance and token weight
  influence policy and gauges only (7.2). This is a hard separation enforced in the allocation
  engine's inputs.
- **Scale is priced:** new managers are trialed, not trusted (4.1).

## 9.2 Metric definitions

| Metric | Definition | Window | Notes |
| --- | --- | --- | --- |
| Gross APY | Annualized gross return (TWR) | 90d | From oracle-signed NAV |
| Net APY | Gross minus all fees | 90d | What investors actually receive |
| Risk score | 100 − penalty points (risk-engine) | 60d | VaR/ES/volatility/concentration/tail |
| Max drawdown | Peak-to-trough NAV decline | 180d | Escalates severity per risk-engine |
| Sharpe | (μ − rf)/σ daily, annualized | 90d | Risk-adjusted return |
| Sortino | Downside-deviation variant | 90d | Penalizes only bad volatility |
| Calmar | CAGR / max drawdown | 365d | Reward-per-risk-of-ruin |
| IL control | IL vs. buy-and-hold benchmark | 180d | How well positions are placed/hedged |
| Capital efficiency | Fees generated per unit of capital | 90d | Fee/turnover-weighted |
| Liquidity utilization | Time-in-range / active-bin share (Meteora) | 30d | Concentration efficiency |
| Volatility exposure | σ of daily returns | 30d | Position-sizing sanity |
| Consistency | Share of positive epochs; return IR | 180d | Smoothness of earnings |
| Retention | Organic capital retention vs. peak | 365d | Flow-adjusted, churn-filtered |
| TVL growth | Organic growth rate vs. benchmark | 90d | Churn-filtered |
| Governance participation | Voter eligibility → participation | 180d | Capped, verified on-chain |
| Operational reliability | Uptime, rebalance success, error rate | 90d | From automation logs |

## 9.3 Score formula (fixed weights, as implemented on-chain)

```
score = 30% · fee_generation
      + 20% · risk                     (inverted: 100 − riskScore)
      + 15% · drawdown                 (inverted: 100 − drawdownScore)
      + 10% · capital_retention
      + 10% · consistency
      + 10% · tvl_growth
      +  5% · governance_participation
```

Each component is normalized 0–100. Inverted inputs (risk, drawdown) are flipped so *higher is
always better*. The reference implementations are `apps/backend/src/services/scoring/index.ts`
and `programs/manager-registry/src/state.rs` (`ManagerScore::from(ScoreInput)`); this document
is the governing specification of what each component means.

**Component definitions (normalization):**

- `fee_generation` — fees per $100 TVL vs. a quality-benchmark curve, winsorized at 3σ; wash
  and churn filters applied (AV-1, AV-2). Benchmark anchored to venue-typical fee rates so
  "fees" mean *real user-flow fees*, not activity for its own sake.
- `risk` — the risk-engine's risk score (100 − penalty points); penalties from VaR/ES breaches,
  concentration, oracle-health flags, venue-counterparty flags, and corridor violations.
- `drawdown` — piecewise: DD ≤ 5% → 100; ≤ 10% → 80; ≤ 15% → 50; ≤ 25% → 20; > 25% → 0.
  Continuous linear interpolation within ranges.
- `capital_retention` — 100 × min(1, organic_capital_now / peak_organic_capital), where organic
  excludes circular/churn flows; zeroed if retention < 20% of peak.
- `consistency` — share of positive months (180d) blended with monthly-return information ratio,
  scaled 0–100; streaks count more than spikes.
- `tvl_growth` — min(100, 100 × organic_growth_rate / benchmark_growth), capped; negative growth
  floors at 0; churn-ratio penalty applies.
- `governance_participation` — min(100, 100 × proposals_voted / proposals_eligible) with an
  eligibility minimum (tier-1 managers are expected to participate); capped at 100.

## 9.4 Time dynamics: smoothing, decay, recovery

- **Exponential smoothing.** Each component is updated per scoring epoch (daily): `C_t = (1−λ)·C_{t−1} + λ·S_t`, with λ per component (0.1–0.3). This makes the score a *memory function*: recent
  performance matters most; ancient performance decays exponentially.
- **Decay.** A manager who stops actively managing sees every activity-linked component decay
  toward 0 over the half-life window; the leaderboard is a *live* ordering, not a lifetime
  achievement award.
- **Recovery.** Score recovery is capped per epoch (max upward drift ±10 points/period) so a
  single lucky week cannot fake a recovery, and requires sustained good evidence (Section 4.8's
  probation re-entry). Downward moves are immediate (risk/drawdown violations recompute at
  event time); upward moves are slow. This asymmetry is deliberate: **trust is earned slowly and
  lost instantly.**
- **Event-driven recompute.** Critical violations, slashing, suspension, and venue incidents
  trigger an immediate recompute outside the epoch schedule.
- **Threshold integrity.** Tier/status changes require the *sustained* condition (N consecutive
  epochs, N by direction: 3 up, 1 down) to prevent threshold sniping (AV-19).

## 9.5 Allocation engine

The allocation engine converts scores into capital shares. Raw weight per manager `i`:

```
raw_i = score_i² · (1 − risk_i/100) · fee_efficiency_i · (consistency_i/100)
        · volatility_decay_i · track_record(age_i, tvl_i) · tier_multiplier_i
```

- `score²` compresses the field: small score differences produce meaningful allocation
  differences at the top, starving the bottom (a convex reward for skill).
- `(1 − risk/100)` and `volatility_decay` suppress high-risk managers.
- `track_record(age, tvl)` scales new managers (sandbox) and heavily-short-history profiles.
- Weights are then **normalized and constrained** per risk-engine limits:

| Constraint | Limit | Enforcement |
| --- | --- | --- |
| Per-manager allocation | ≤ 30% of vault NAV | Hard |
| Per-protocol (venue) | ≤ 40% | Hard |
| Per-token | ≤ 20% | Hard |
| Memecoin class | ≤ 10% | Hard |
| Stable-pool class | ≤ 25% | Hard |
| Cash reserve | ≥ 10% (up to 25% in stress) | Hard |
| Pairwise manager correlation | ≤ 0.6 (joint exposure counts once) | Hard |

The engine runs on a daily/hourly cadence, computes drift vs. the current allocation
(`reallocationNeeded`, default 5% drift threshold per `risk-engine.md`), and rebalances subject
to the constraints. Rebalance execution is slippage-aware (chunked), and rebalance cost is
attributed and reported (AV-15/18).

## 9.6 Risk tiers and strategy envelopes

Score thresholds map to risk tiers (`>=85 → tier 1 … <40 → tier 5`), which gate:

- Bond size (4.3), allocation caps (9.5), insurance premium band (6.3), listing eligibility, and
  product access (institutional vaults, white-label).
- **Strategy envelopes:** every listed strategy declares a parameterized envelope — allowed
  venues, tokens, ranges, leverage cap, rebalance frequency — enforced by the strategy SDK at
  execution time. Unauthorized-risk behavior is tracked (4.6, AV-7) even when profitable, because
  envelope discipline is itself a scored input (operational reliability).

---

# 10. Fee Economy

## 10.1 Fee schedule (base parameters, governance-amendable)

| # | Fee | Rate | Payer | Recipient | When |
| --- | --- | --- | --- | --- | --- |
| F1 | Management fee | 75 bps/yr (50–150 by tier) | Vault (investors) | 75% manager / 25% protocol | Daily accrual on NAV |
| F2 | Performance fee | 15% (10–20 by tier) above HWM | Vault | 80% manager / 20% protocol | Crystallized at exit/close |
| F3 | Standard exit | 0 bps | Redeemer | — | Settlement via queue |
| F4 | Expedited exit | 25 bps (24–72h), 50 bps (instant) | Redeemer | 100% protocol | Priority queue |
| F5 | Deposit | 0 bps (max 50 governance-permitted) | Depositor | 100% protocol | Congestion pricing |
| F6 | Insurance premium | 10–30 bps/yr | Vault | Insurance reserve | Monthly from NAV |
| F7 | Strategy listing | $5k–$100k by tier | Manager | 100% protocol | On listing |
| F8 | Marketplace placement | 1% of gross deposits (year 1) | Manager | 100% protocol | Flow-based |
| F9 | Analytics subscriptions | $500/mo pro, $5k/mo inst. | Subscriber | 100% protocol | Monthly |
| F10 | API licensing | $250/mo dev, $2.5k/mo pro, custom | Licensee | 100% protocol | Monthly/annual |
| F11 | Institutional reporting | $2k/mo | Client | 100% protocol | Monthly |
| F12 | White-label license | $500k/yr + 10% gross | Licensee | 100% protocol | Annual + flow |
| F13 | Governance participation incentive | Treasury-funded, capped | Treasury | Voters | Per proposal (small) |
| F14 | Insurance-staking fee | Premium-linked yield, net of claim share | Insurance stakers | Earn yield | Ongoing |

## 10.2 Calculation, collection, and distribution

- **Calculation:** F1/F2 accrue from oracle-signed NAV continuously; F3–F12 are transaction or
  subscription driven; all are computed by the fee ledger service and reconciled against the
  vault/staking programs' recorded state.
- **Collection:** F1–F5 are settled on-chain at withdrawal/close (fee is minted-equivalent:
  accrued in NAV, deducted at settlement); F6 deducted monthly; F7–F12 collected at event or
  subscription cycle with on-chain payment in base assets.
- **Distribution:** follows the waterfall (2.4) for protocol-side revenue; manager-side flows to
  the manager's fee account net of deferral/co-pay (4.5). No fee is paid in ATLAS; all fees are
  collected in the asset of the transaction (USDC/SOL), so protocol revenue is real cash flow.
- **Auditing:** the fee ledger is independently reconciled monthly; fee calculations are unit-
  tested invariants; any fee-code change requires risk-committee review (12.1).

## 10.3 Competitiveness and anti-rent considerations

- Atlas' blended investor cost (75 bps + 15% perf + 10–30 bps insurance) is positioned to beat
  the fund-of-funds standard (~100 bps + 10–20% perf, plus opacity premium) while offering
  strictly more transparency (1.2). The fee ladder (4.5) mechanically returns scale economies.
- **Fee cap principle:** total investor cost (management + performance at benchmark + insurance)
  is capped at 3%/yr in base configuration, and fee changes require the same governance class as
  risk parameters (12.3), so the protocol cannot tax liquidity it did not earn.
- **Revenue sufficiency:** Section 13 shows F1–F12 clears operating cost at ~$300–400M AUM,
  with F6 and F9–F12 contributing the growth margin as the protocol scales.

## 10.4 Fee governance

Fee parameters are governance parameters with a **deliberative bias**: downward changes (pro-
investor) pass at standard quorum; upward changes require a supermajority + 30-day advance
notice, protecting the social contract that fee levels are stable and predictable for allocators
planning multi-year commitments (12.3).

---

# 11. Liquidity Economy

## 11.1 Capital flow map

```
                   ┌───────────────┐
   Investors ──────►  Vault layer   │  deposits → shares; NAVPS; HWM
   (retail, DAO,    └──────┬────────┘
    institutions,          │ delegated capital
    treasuries)            ▼
              Allocation engine ──(scores, caps, drift)──┐
                          │                              │
         ┌────────────────┼────────────────┐             │
         ▼                ▼                ▼             │
   Manager A         Manager B         Manager C        │  cash reserve ≥10%
         │                │                │             │
         ▼                ▼                ▼             │
   Meteora ▸ Orca ▸ Raydium ▸ Kamino ▸ Drift ▸ (future)  │
                          │                              │
                          ▼                              │
                 Risk monitoring ◄───────────────────────┘
                          ▼
                 Performance oracle
                          ▼
                   Revenue ledger ──► waterfall (2.4)
        ┌───────────────┬───────────────┬──────────────┐
        ▼               ▼               ▼              ▼
  Treasury pool    Insurance reserve   veATLAS share   OpEx
```

The economy has **six reservoirs**: investor capital (vaults), manager-delegated capital
(strategies), the insurance reserve, the treasury, protocol-owned liquidity, and the cash reserve.
Flows between reservoirs are governed by the rules in Sections 3–7; this section analyzes their
dynamics.

## 11.2 Inflow dynamics (growth)

- **Organic inflows** (the dominant path) follow performance reputation: net APY and leaderboard
  position drive deposits, creating the virtuous cycle *better allocation → better returns →
  more capital → better manager economics → better manager quality*. This is a self-reinforcing
  but *merit-gated* loop: the allocation engine caps any manager at 30%, so no single position
  can capture the loop.
- **Institutional inflows** come via reporting/API/white-label distribution (R8/R9) and KYC
  vaults; they are sticky (notice periods, governance familiarity) and fee-rich (R9, R11).
- **Managed inflows:** governance may run *bounded* incentive programs (gauge-directed POL,
  partner rebates) subject to the R.O.I. test (13.2). Inflows are never purchased with yield
  subsidies (3.6).

## 11.3 Outflow dynamics (redemptions)

Outflows are absorbed by a designed sequence, in increasing severity:

1. **Daily liquidity** — vault cash buffer (default 10%) and maturing positions fund standard
   queue settlement without market impact.
2. **Orderly unwinding** — the manager/automation unwinds marketable positions in slippage-aware
   chunks over the settlement window (T+1..T+7), prioritizing liquid venues.
3. **Priority pricing** — expedited exits (25–50 bps) monetize urgency; the fee compensates the
   residual queue for the liquidity they left behind.
4. **Pro-rata** — under aggregate-demand stress, all claimants share liquidation proceeds
   proportionally (no queue-priority arbitrage, 3.4).
5. **Gates** — time-limited redemption suspension during critical stress (3.4) prevents
   runs-at-stale-prices; suspension is automatic on risk-engine `pause` and never indefinite.

**Orderliness theorem (conceptual):** because settlement NAV is oracle-signed, redemptions are
priced at the *settlement* price rather than a stale spot, so exiting at the same NAVPS the
staying investors also pay — eliminating the "last-out gets the market impact" externality that
makes runs rational in the first place.

## 11.4 Reserves and emergency liquidity

| Reserve | Target size | Trigger to draw | Replenishment |
| --- | --- | --- | --- |
| Vault cash buffer | ≥ 10% NAV | Redemption pressure / pause | Reallocation engine refills from maturing positions |
| Protocol cash reserve | ≥ 10% of protocol vault assets | Systemic redemption wave | Built from waterfall ③ until target |
| Emergency liquidity pool | ≥ 1% of TVL, stables, never invested | Stress trigger (see below) | Treasury policy |
| Insurance reserve | ≥ 2% insured TVL, floor $2M | Covered claims (6.1) | Premiums, slashing, waterfall ① |
| Treasury backstop | Solvency assets | Reserve below floor | Treasury policy (5.3) |

**Stress trigger definition:** a stress condition exists when (a) aggregate redemptions exceed
50% of vault cash buffers in 24h, or (b) a covered-event claim is pending > 2% of the reserve, or
(c) the risk engine pauses ≥ 3 vaults, or (d) a supported venue suffers a verified exploit. On
trigger, the emergency liquidity pool is placed on standby (not automatically spent) and the
reallocation engine moves to **defensive mode**: unwinds to cash-like instruments, prioritizes
settlement, and halts new allocations to non-stable venues until risk status clears.

## 11.5 Stress scenario modeling (economic response)

The following regimes are analyzed in depth in Section 14; the liquidity response rules are
summarized here:

| Regime | Liquidity response | Rationale |
| --- | --- | --- |
| Rapid inflows | Allocation caps + cash buffer absorb; no fee change | Scale must not degrade risk (9.5 caps) |
| Rapid outflows | Buffer → unwinding → priority pricing → pro-rata → gates | Preserve price integrity (11.3) |
| Prolonged bear | Defensive mode; cash up to 25%; stable exposure | Conservation, not exit — investors retain upside |
| Extreme volatility | Circuit breakers pause trading; settlement at oracle NAV | Avoid fire-sale value destruction |
| Protocol failure (venue/manager) | Deallocation → emergency unwind → claims (bond/insurance) | Order: manager bond → insurance → treasury |
| Liquidity shortage | Emergency pool standby; staggered settlement | Orderly > fast |

**Liquidity axiom:** the protocol treats liquidity as an *engineered resource*, priced (F4),
buffered (11.4), and gated (3.4) — never as a convenience it owes the market at any price. This
is the difference between a bank run and an orderly redemption.

---

# 12. Governance Economy

## 12.1 What governance decides (and what it cannot)

Governance controls the *rules of the economy*; it does not operate the economy day-to-day.
Scope is explicit:

**Governance-decided:** fee schedule and distribution splits; risk parameters and limits; manager
onboarding policy and risk-tier mapping; venue/integration listings; insurance policy definitions
and premium bands; treasury deployment and spending (within ladders); incentive program approval;
bond schedule; slashing/recovery ratifications above 50% of bond; governance-participation
eligibility rules.

**Explicitly NOT governance-decided (by design):** individual manager scores (oracle + engine);
per-epoch capital allocations (engine, constrained); NAV marking (oracle, multi-source); vault
status transitions (risk engine, evidence-gated); claim adjudication (claims committee +
published criteria). This separation is what makes the system *credible*: the rules of the game
are contestable, the game itself is not.

## 12.2 Decision classes and vote mechanics

| Class | Examples | Quorum | Passage | Timelock |
| --- | --- | --- | --- | --- |
| Parametric | Risk limits within bands, fee discounts, listing policy | 5% of circulating veATLAS | Simple majority | 48h |
| Fiscal | Treasury spend ≤ $5M, grants, POL programs | 10% | Simple majority | 72h |
| Protocol-critical | Fee increases, insurance definitions, slashing >50% bond, new venue class | 15% | Supermajority (≥60%) | 7 days |
| Constitutional | Token supply change, waterfall change, HWM-continuity rule | 15% | Supermajority (≥66%) + 90d notice | 30 days |

Voting power = veATLAS (7.3). Delegation is available and encouraged; delegate identity is
public and delegates must disclose conflicts. Proposals are **snapshot-signaled then
on-chain-executed**, with on-chain execution gated by the timelock.

## 12.3 Incentives for informed participation

- **Revenue share** (waterfall ⑤) gives locked holders a direct financial interest in
  protocol health — the strongest known antidote to apathy.
- **Delegation** reduces the per-voter cost of competence: retail holders delegate to experts,
  converting apathy into delegation rather than abstention.
- **Participation rewards (F13)** are deliberately small and budget-capped: they reimburse gas
  and attention, never *buy* votes (which would invert the incentive).
- **Governance-participation score input** (5% of manager score) ties manager eligibility to
  engagement, keeping the most economically powerful class of participants in the conversation.
- **Deliberative bias (10.4):** pro-investor fee changes are easier than fee increases, so the
  default direction of governance pressure is aligned with the protocol's investor constituency.

## 12.4 Anti-capture architecture

- **Time-locked voting** (veATLAS): only long-horizon holders dominate, and locks are
  non-transferable — rental is detectable (AV-16).
- **Escalating quorum** (12.2): a whale that ignores quorum for sensitive classes cannot
  unilaterally act.
- **Separation of powers:** proposers ≠ executors (multi-sig) ≠ adjudicators (claims/risk
  committees) ≠ auditors. No single governance actor can move assets, change rules, and
  adjudicate disputes in one motion.
- **Emergent check:** the treasury and insurance reserves are governed by explicit policies
  (5.5, 6.5) that survive governance transitions; changing them is constitutional-class.
- **Exit protection:** any rule change that increases investor cost or risk above defined bands
  triggers a mandatory public-risk assessment and a 7-day advance notice, giving allocators
  time to exit rather than be trapped by a hostile vote (protects IR, 8.4).

## 12.5 Governance maturity path

Governance sophistication scales with the protocol: bootstrap (multi-sig + advisory) → parameter
voting (Phase 4 roadmap) → committee governance (risk, claims, treasury sub-DAOs) → institutional
foundation + DAO oversight (Section 5.6). Each stage inherits the previous stage's checks; only
the depth of deliberation grows.

---

# 13. Economic Sustainability Framework

## 13.1 The no-emissions theorem (informal proof)

> **Claim:** Atlas can operate indefinitely without minting tokens, once cumulative fee and
> infrastructure revenue covers operating cost.

**Premises (established in earlier sections):**
1. Protocol revenue is a positive function of AUM and other-revenue streams (Section 2.2).
2. Operating cost is a fixed floor plus a small AUM-proportional term (13.3).
3. Under premises 1–2, there exists an AUM level `A*` at which revenue equals cost (13.4).
4. Bootstrap emissions are time-bounded (year 4 expiry, ≤2% supply/yr, §7.4), and their
   *purpose* (liquidity + network effects to reach `A*`) is finite.
5. Token demand after expiry is structural (locks, bonds, insurance staking — §7.2), i.e., the
   token remains functional without emissions.

**Proof sketch:** For all A ≥ A*, R(A) ≥ O(A), so protocol cash flow is non-negative and
treasury + reserve + veATLAS shares are funded from revenue. Emissions are zero by construction
post-expiry. Therefore the protocol's operating economy is self-sustaining without token
inflation. Before A* is reached, the gap is funded by the treasury endowment and declining
bootstrap emissions — both finite, scheduled, and audited (13.6). ∎

## 13.2 The R.O.I. test for all incentive spending

Every discretionary incentive (grants, POL programs, partner rebates, F13 participation rewards)
must pass: `E[incremental protocol revenue from program] ≥ program cost × (1 + capital charge)`.
The capital charge is the yield the treasury foregoes. Programs that cannot demonstrate expected
positive contribution are declined. This single rule prevents the classic DeFi failure mode of
buying TVL at negative margin.

## 13.3 Revenue and cost model

Let `A` = average AUM, `y` = blended net strategy yield, `p` = fraction of AUM above HWM
(earning performance fees), `Oth` = infrastructure revenue (F7–F12 net), `I` = insurance margin
(premiums − expected claims).

```
Revenue:   R(A) = mgmt(A) + perf(A,y,p) + Oth(A) + I(A)
           mgmt(A) = α·A,        α = 0.0075 × 0.25 = 0.001875        (75 bps fee, 25% protocol take)
           perf(A,y,p) = β·y·A·p,  β = 0.15 × 0.20 = 0.030           (15% perf fee, 20% protocol take)
           Oth(A) = Oth₀ + o·A     (Oth₀ ≈ $1–2M/yr; o ≈ 1 bp at scale)
           I(A)   = i·A_insured,   i ≈ 15 bps premium × margin        (net, after claims)

Operating cost:  O(A) = O_fixed + o_v·A
           O_fixed ≈ $3M/yr (engineering, security, audits, compliance, committees)
           o_v     ≈ 5 bps   (data/oracle/compute/support per dollar of AUM)

Net protocol cash flow:  N(A) = R(A) − O(A)
```

## 13.4 Scenario projections

**Base parameters:** α=0.001875, β=0.030, O_fixed=$3M, o_v=5 bps, insurance net margin ~10 bps on
80% of AUM (I = 8 bps × A), infrastructure-variable margin o = 1 bp × A. Infrastructure fixed
revenue `Oth₀` is stated per scenario and scales with adoption (analytics, API, reporting,
white-label, listing/placement fees); insurance net margin is included in "Oth + I".

| Scenario | AUM `A` | Yield `y` | `p` | `Oth₀` | mgmt | perf | Oth + I | **R** | **O** | **N(A)** |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Conservative | $300M | 5% | 0.60 | $0.2M | $0.56M | $0.27M | $0.47M | **$1.30M** | $3.15M | **−$1.85M** |
| Moderate | $1.5B | 8% | 0.70 | $2M | $2.81M | $2.52M | $3.35M | **$8.68M** | $3.75M | **+$4.93M** |
| Optimistic | $4B | 10% | 0.75 | $4M | $7.50M | $9.00M | $7.60M | **$24.10M** | $5.00M | **+$19.10M** |
| Institutional | $12B | 8% | 0.75 | $12M | $22.50M | $21.60M | $22.80M | **$66.90M** | $9.00M | **+$57.90M** |

**Breakeven AUM:** solve `α·A + β·y·p·A + Oth₀ + o·A + I(A) = O_fixed + o_v·A`.

- Fee streams alone (`Oth₀ = 0`, `o = 0`, `I = 0`): at y=8%, p=0.70 → marginal revenue =
  0.001875 + 0.00168 = 0.003555; `A* = O_fixed / (0.003555 − 0.0005) ≈ $3M / 0.003055 ≈ $980M`.
- With infrastructure revenue at `Oth₀ = $2M` (fixed revenue, no variable or insurance margin):
  `A* ≈ $1M / 0.003055 ≈ $330M`.
- With the full ancillary stack (`Oth₀ = $2M`, `o = 1 bp`, `I = 8 bps`): marginal revenue =
  0.003955; `A* ≈ $1M / 0.003955 ≈ $250M`.

**Conclusion (as in the Executive Summary):** operational self-sufficiency is reached between
**~$250M AUM** (full ancillary income) and **~$980M AUM** (fee streams alone), and at
**~$330M** with the planned infrastructure ramp — bracketing the Executive Summary's $300–400M
planning band. Both endpoints are reachable within the roadmap's early-growth stage (Section
15); neither requires emissions.

**Insurance margin is *also* reserved, not spent:** in each scenario, I(A) flows to the reserve
(waterfall ①/④); it appears above only as the funding of the solvency target, not as treasury
income. This is conservative by construction.

## 13.5 Sensitivity analysis

Sensitivity of `N(A)` to the four dominant unknowns — yield `y`, infrastructure revenue `Oth₀`,
AUM trajectory, and the performance-fee fraction `p` — computed **exactly** from the 13.3 model.
Base cell: A=$1.5B, y=8%, p=0.70, Oth₀=$2M → **N = +$4.9M**. Each row varies one variable at a
time; the final row is the joint worst case.

| Variable (all other parameters at base) | −2σ | Base | +2σ | Note |
| --- | --- | --- | --- | --- |
| Yield `y` | 4% → +$3.7M | 8% → +$4.9M | 12% → +$5.7M | Yield is the largest *relative* swing at breakeven-adjacent scale — and the factor Atlas does not control, hence the discipline of never promising yield (P1). At institutional scale the margin absorbs yield variation. |
| `Oth₀` | $0 → +$2.9M | $2M → +$4.9M | $5M → +$7.9M | Infrastructure revenue is the *counter-cyclical* buffer: it grows with customers, not markets. |
| AUM `A` | $500M → +$1.0M | $1.5B → +$4.9M | $4B → +$14.8M | Scale is monotonically revenue-positive above breakeven. |
| `p` (fraction earning perf) | 0.4 → +$3.9M | 0.7 → +$4.9M | 0.9 → +$5.7M | HWM continuity (AV-8) protects this line from gaming. |
| Joint worst cell: A=$400M, y=4%, p=0.4, Oth₀=$0.5M | — | **−$1.4M** | — | Low AUM + low yield + low infrastructure revenue simultaneously. |

**Stress on the model:** even the joint worst cell produces a deficit of only ≈ −$1.4M/yr — small
relative to the $25M treasury endowment and the insurance reserve floor; the protocol survives
the worst modeled market conditions *on balance sheet alone* (Section 14), and the deficit
disappears as AUM approaches breakeven.

## 13.6 Treasury growth projection (moderate scenario, illustrative)

Assumptions: moderate AUM path $150M → $375M → $900M → $1.8B → $3.0B (roughly doubling through
years 2–4, growth halving thereafter — consistent with 13.4's moderate parameters y=8%, p=0.70);
infrastructure fixed revenue ramp Oth₀ = $0.5M → $1.5M → $3M → $5M → $8M; treasury balance
reinvested at 6% yield; waterfall flows per 2.4 — deficits funded by the endowment, positive net
revenue split 60% treasury / 25% insurance / 15% veATLAS (insurance margin is already reserved
before the waterfall, per 13.4).

| Year | AUM | N(A) | Treasury net inflow | Treasury balance (cum.) |
| --- | --- | --- | --- | --- |
| 1 | $150M | −$1.9M | −$1.9M (funded by endowment) | $23.1M |
| 2 | $375M | −$0.0M | −$0.0M | $24.5M |
| 3 | $900M | +$3.6M | +$2.1M (60% waterfall flow) | $28.1M |
| 4 | $1.8B | +$9.1M | +$5.5M | $35.2M |
| 5 | $3.0B | +$16.9M | +$10.1M | $47.5M |

(Treasury shown from a $25M starting endowment for illustration; balances are *principal only,
net of operating and insurance obligations*, which are senior per the waterfall, and include the
6% reinvestment yield. By year 5 the treasury lands in the $50–500M stage band of Section 5.6.)

## 13.7 Sensitivity to market cycles

- **Bull:** high `y`, high inflows, premium compression (managers compete, fees negotiate down).
  The fee ladder (4.5) returns some upside to investors; treasury accumulates.
- **Bear:** `y` compresses, `p` falls, redemptions rise; mgmt-fee revenue (the AUM-proportional
  floor) contracts with AUM but never to zero; infrastructure revenue (Oth₀) is counter-cyclical;
  the reserve and treasury absorb stress (Section 14). The protocol is designed to be
  *profitable through the cycle*, not just at peak.

---

# 14. Protocol Stress-Testing Framework

The framework below is the standard by which the economic design is validated. Each scenario
states the trigger, the automatic response, the economic response, and the solvency verdict. All
scenarios assume the base parameterization (Sections 10, 4.3, 6.3) and a representative balance
sheet (AUM $1.5B, reserve 2% = $30M, treasury $50M, emergency liquidity 1% = $15M).

## 14.1 Liquidity crisis / mass investor withdrawal

- **Trigger:** A black-swan macro event causes redemptions of 40% of AUM within 10 days.
- **Response:** Standard queue fills from cash buffers (10%); priority exits pay 25–50 bps and
  are bounded; managers unwind in slippage-aware chunks; allocation engine moves to defensive
  mode (cash to 25%); if redemption demand exceeds daily liquidity, pro-rata settlement engages;
  if a `pause` condition is met, gates activate (max 30 days).
- **Economic response:** Fee revenue contracts proportionally (α·A), but N(A) stays above −$5M
  at the reduced AUM — covered by treasury. Insurance is untouched (market-driven).
- **Verdict:** Orderly settlement; no NAV arbitrage; no insolvency. Run is priced (F4) and
  buffered, not subsidized.

## 14.2 Stablecoin depeg

- **Trigger:** A collateral stablecoin in stable-vaults breaks peg >5%.
- **Response:** Risk engine flags; stable-pool exposure cap (25%) already bounds concentration;
  the risk engine's depeg monitor pauses affected vaults; positions migrate to reserve assets.
- **Economic response:** Investors holding affected vaults bear the depeg (excluded risk) —
  *unless* they hold the optional stablecoin-integrity rider (6.1), which responds to
  catastrophic non-market depeg events from the reserve; standard policies exclude it (P6).
- **Verdict:** Solvent by construction (concentration caps + explicit exclusion + rider).

## 14.3 Severe token volatility / flash crash

- **Trigger:** 30% single-day drawdown across major assets.
- **Response:** Daily-loss rule (5%) pauses affected vaults (risk-engine.md); redemptions at
  oracle NAV (TWAP-protected for large vaults); managers barred from panic rebalances
  (pause restricts to risk-reduction trades).
- **Economic response:** Investors absorb market loss by design; insurance excludes market risk;
  treasury unaffected; fee revenue dips with NAV but mgmt fee floor remains.
- **Verdict:** No system-level loss; the protocol's value (allocation, not prediction) is
  reinforced — a pause that prevented a fire-sale is exactly the service investors pay for.

## 14.4 Smart-contract exploit of an integrated venue (e.g., a Meteora pool)

- **Trigger:** Verified exploit of a venue holding 10% of AUM ($150M), 40% loss recovered
  partially ($90M at risk).
- **Response:** Venue incident trigger; emergency exit from the venue; claims filed under the
  covered-events definition (6.1); venue concentration cap (40%) bounds systemic exposure;
  emergency liquidity pool stands by.
- **Economic response:** Reserve pays covered claims up to per-event cap (15% of reserve =
  $4.5M in the base illustration); the remainder is a real loss to affected investors — the
  policy's limit, clearly published. Manager bonds of managers who breached venue selection rules
  are slashed. Reserve absorbs the cap; treasury backstop if needed; premiums re-price venue risk
  upward.
- **Verdict:** Solvent. Covered claims paid; uncovered remainder is priced risk (published
  coverage cap), not solvency risk. The event strengthens underwriting (reload premiums).

## 14.5 Exploit of Atlas core programs themselves

- **Trigger:** Attack on `vault`/`staking`/`registry` code (worst case: protocol-wide drain).
- **Response:** Circuit breakers; emergency stop; all positions repatriated where possible;
  governance emergency (7-day window); claims under the smart-contract-exploit class.
- **Economic response:** This is the **existential-test scenario**. Defense-in-depth (L1–L8,
  3.5) means a single exploit is likely partial; insurance covers the covered class; the
  treasury backstop and insurance-staking pool (7.6) respond after reserve exhaustion; the
  no-emissions model holds because even a full reserve draw leaves the fee business (R1/R2)
  and infrastructure revenue intact post-remediation.
- **Verdict:** Survivable with capped, defined losses; the insurance layer exists precisely for
  this class of event, and the treasury's 24-month runway funds the rebuild.

## 14.6 Prolonged bear market

- **Trigger:** 24 months of declining yields and AUM (AUM −50%).
- **Response:** Defensive mode; cash 25%; deallocation to stable-weighted managers; score decay
  pushes weak managers out; infrastructure revenue partially offsets fee contraction.
- **Economic response:** R falls (mgmt floor survives at reduced AUM); O falls (variable
  component shrinks); treasury endowment funds any deficit; no emissions required (13.1).
- **Verdict:** Profitable-or-breakeven through the cycle; survives on balance sheet.

## 14.7 Governance attack

- **Trigger:** Attempted treasury siphon or hostile fee increase via captured vote.
- **Response:** veATLAS locks + escalating quorum block simple capture; timelock exposes the
  proposal; committee check for treasury/slashing classes; emergency window (12.4); public debate
  window.
- **Economic response:** If executed despite defenses (worst case), treasury ladders cap
  per-action loss; insurance does not cover governance *siphons* by design (AV-12
  countermeasures are preventive, not insured), so the defense is structural.
- **Verdict:** Defenses make a successful attack prohibitively expensive and detectable; the
  constitutional class (12.2) protects the rules of the game.

## 14.8 Manager failure / misconduct at scale

- **Trigger:** A top-3 manager (20% of AUM) commits confirmed misconduct (wash trading) or fails
  catastrophically (key compromise).
- **Response:** Automatic deallocation; bond slashed (up to 100%); suspension; capital
  reallocated to the cash reserve and re-deployed next epoch; HWM continuity protects investors.
- **Economic response:** Investor loss from misconduct is met by bond + insurance (4.7);
  deallocation limits portfolio impact; correlated-manager flags prevent contagion via
  look-alike positions; reputation ledger publicly records the incident.
- **Verdict:** Contained. The 30% cap means no single manager can take the system down; the
  bond/insurance stack pays covered losses.

## 14.9 Correlated strategy losses

- **Trigger:** Multiple managers are simultaneously exposed to a correlated factor (e.g., all
  long a SOL-cluster or a liquidity-shock factor) that crashes.
- **Response:** Pairwise-correlation cap (≤0.6, joint exposure counted once) pre-bounds the
  cluster; protocol/token concentration caps (9.5) bound it further; the risk engine's
  correlation monitor flags the cluster in advance.
- **Economic response:** Investors absorb market loss; the *cluster* loss is bounded by caps to
  a fraction of AUM; no insurance (market); reallocation reweights to uncorrelated managers.
- **Verdict:** Design-inherent: the correlation layer is exactly what single-manager or
  single-venue exposure cannot provide.

## 14.10 Oracle failure

- **Trigger:** Performance oracle feed stale/corrupt (no data for 48h or deviant).
- **Response:** Multi-source median (≥3 feeds) discards the deviant feed; TWAP fallback;
  NAV marking freezes at last verified value (no trading at stale prices); governance review.
- **Economic response:** No mispriced mint/redeem possible (frozen NAV); insurance covers any
  residual mis-marking loss (6.1, oracle-failure class); fee accrual pauses during freeze.
- **Verdict:** Bounded. The design fails *safe*, not *loud*.

## 14.11 Bridge failure / cross-protocol contagion

- **Trigger:** A widely-used Solana bridge collapses, freezing or depegging wrapped assets held
  in vaults.
- **Response:** Counterparty and token concentration caps (20%) bound exposure; vaults holding
  affected assets are paused; migration to native assets; claims for the custody-failure class.
- **Economic response:** Affected investors bear depeg by design; the optional rider covers
  catastrophic custody/wrapped-asset failures; caps keep it partial.
- **Verdict:** Bounded by concentration; honest exclusions keep the reserve solvent for true
  custody failures.

## 14.12 Liquidity shortage within a venue

- **Trigger:** A venue's own liquidity collapses (bins empty, spreads blow out), stranding
  vault positions.
- **Response:** Liquidity-depth monitoring (risk-engine metric) pre-flags the venue; exit is
  staged and slippage-aware; venue concentration cap; emergency exit path if a full unwind is
  required.
- **Economic response:** Slow/chunked exits cost slippage (allocated, reported, not insured);
  the venue's fee stream feeds `fee_generation` only while real — wash/quality filters exclude
  phantom fees.
- **Verdict:** Loss is bounded by the venue cap; no solvency impact.

## 14.13 Aggregate verdict

Across all scenarios, the protocol's balance sheet absorbs the **insured** class (reserve +
treasury backstop + reinsurance), the **market** class is allocated to investors by design, and
the **systemic** class is bounded by concentration caps and honest exclusions. The no-emissions
model is never invoked for survival — only bootstrap bridge financing is (and that is scheduled
and finite). The framework is re-run quarterly by the risk committee and after every material
parameter change, with results published.

---

# 15. Economic Roadmap

This section sequences the protocol's economics from launch to global liquidity infrastructure.
It complements `docs/roadmap.md` (engineering milestones) by specifying the **economic
conditions** each stage must meet. TVL bands are planning bands, not promises: a stage is entered
when its *gate* (15.7) is met, not when its calendar arrives.

| Stage | Years | TVL band | Revenue mix | Treasury | Governance | Primary economic gate |
| --- | --- | --- | --- | --- | --- | --- |
| 15.1 Bootstrap | 0–1 | $0–50M | Emissions bridge; fees ≈ 0 | Preserve endowment; seed insurance | Multi-sig + advisory | Oracle-signed NAV; AUM ≥ $50M |
| 15.2 Early Growth | 1–2 | $50–500M | Management fees lead; infra ramps | Diversify; POL entry; grants (R.O.I.) | Parameter voting; committees form | N(A) ≥ 0 for two quarters; reserve at target |
| 15.3 Network Effects | 2–3 | $500M–2B | Mgmt + perf + infra + white-label | $100M+; strategic positions | Committee governance; constitutional class | AUM ≥ $2B; reinsurance signed |
| 15.4 Institutional Adoption | 3–5 | $2–10B | Institutional services lead | Treasury foundation; RWA | Foundation + DAO oversight | Institutional AUM ≥ 40%; margin ≥ 15% of R |
| 15.5 Mature Ecosystem | 5–7 | $10–25B | Fully diversified; counter-cyclical | Sub-funds; systemic role | Constitutional stability | ≥ 2 years no-emissions; cycle-survived |
| 15.6 Global Infrastructure | 7+ | $25–50B+ | Infrastructure licensing + insurance at margin | Global allocator; last-resort liquidity | System-of-record | Systemic liquidity role operational |

## 15.1 Stage 1 — Bootstrap (Years 0–1)

- **Objective:** prove the truthful core — oracle-signed NAV, the allocation loop, and the
  misconduct-vs-performance boundary — at small, survivable scale. Nothing in this stage is
  designed to be profitable; it is designed to be *true*.
- **Expected TVL:** $0–50M.
- **Participant composition:** early-adopter retail and DAOs; a first cohort of 5–15 managers
  operating exclusively in sandbox and trial tiers; core team as initial governance; venue
  partners (Meteora, Orca, Raydium) at the POL-discussion stage.
- **Treasury objectives:** preserve the endowment; fund the 24-month operating runway; seed the
  insurance reserve to its $2M floor; zero speculative deployment. Bootstrap token endowment and
  declining emissions are the only external financing (7.4).
- **Governance maturity:** multi-sig plus advisory council; base fee schedule fixed; no on-chain
  parameter voting until the Phase 4 roadmap machinery exists.
- **Revenue composition:** management/performance fees near zero at this AUM; first analytics and
  API subscriptions (Oth₀ ≈ $0.2M/yr); the economics of the stage are bridge-financed, per 13.4's
  conservative cell (N ≈ −$1.9M/yr, funded by the endowment).
- **Insurance capacity:** reserve at the solvency floor ($2M); premiums at the 10 bps entry band;
  coverage limited to vaults passing tier-1 risk screening; claims framework exercised in dry-run
  mode; no reinsurance.
- **Token utility evolution:** governance (advisory), fee discounts, the 50% ATLAS bond leg, and
  insurance-staking availability; veATLAS locks are shallow but establish the lock ledger that
  later stages depend on for anti-capture (12.4).
- **Capital allocation sophistication:** sandbox caps (≤2% of NAV, ≤$250k) and trial tiers only;
  conservative strategy envelopes; human review of automation outputs until the oracle is trusted.
- **Critical economic gate → Stage 2:** oracle-signed NAV live across all vault templates; ≥ 3
  vault templates; insurance floor funded; AUM ≥ $50M; zero unresolved manipulation incidents.

## 15.2 Stage 2 — Early Growth (Years 1–2)

- **Objective:** reach operational self-sufficiency (≈$330M planning band, 13.4) and prove that
  fee revenue, not emissions, pays for the protocol.
- **Expected TVL:** $50–500M.
- **Participant composition:** retail growth driven by net APY and the leaderboard; first DAO
  treasuries; 20–60 managers spanning all five tiers; institutions trialing reporting and API
  products rather than vault allocation.
- **Treasury objectives:** implement diversification bands (5.2); begin protocol-owned liquidity
  within the 15% band; first R.O.I.-gated grants (13.2); stand up the emergency liquidity pool at
  ≥1% of TVL.
- **Governance maturity:** on-chain parameter voting for fees-within-bands and risk limits (roadmap
  Phase 4); risk and claims committees formed; spending ladders operational; delegation introduced.
- **Revenue composition:** management fees dominate; performance fees become material as HWM
  continuity is proven; infrastructure revenue ramps to ~$2M/yr; insurance margin accrues to the
  reserve (13.4, moderate cell: N ≈ +$4.9M at $1.5B).
- **Insurance capacity:** first real claims exercised; premium bands 10–30 bps by risk tier;
  quarterly correlated-event stress tests (Section 14); manager co-pay and co-insurance live.
- **Token utility evolution:** bootstrap emissions peak and begin declining (never >2% of supply/yr);
  the veATLAS revenue share (waterfall ⑤) switches on; manager bond demand scales with manager
  count; delegation converts retail apathy into expert voting (12.3).
- **Capital allocation sophistication:** full tier ladder with fee laddering (4.5); cross-manager
  correlation analytics; scoring across ≥ 4 venues; per-token and per-class caps enforced by the
  allocation engine in production.
- **Critical economic gate → Stage 3:** `N(A) ≥ 0` for two consecutive quarters; reserve ≥ 2% of
  insured TVL; treasury runway ≥ 24 months; emissions below 1.5% of supply/yr.

## 15.3 Stage 3 — Network Effects (Years 2–3)

- **Objective:** convert the reputation ledger and data moat into a two-sided flywheel, and cross
  $1B+ AUM where the moat becomes self-funding.
- **Expected TVL:** $500M–2B.
- **Participant composition:** DAO treasuries at scale; professional LP firms migrating for
  reputation pricing and capital access; institutional allocators entering formal diligence;
  venue partners negotiating long-term fee/rebate terms in exchange for Atlas liquidity depth.
- **Treasury objectives:** grow to $100M+; treasury sub-DAO with committees; quarterly
  rebalancing within bands; strategic ecosystem positions up to the 10% band; fund reinsurance.
- **Governance maturity:** committee governance mature; the constitutional class (12.2) defined
  and exercised for the first time (HWM-continuity rule, waterfall rules); delegate ecosystem
  established.
- **Revenue composition:** management + performance + infrastructure + first white-label deals;
  data partnerships begin; gross protocol revenue reaches $8–25M/yr across the stage's AUM range
  (13.4, moderate to optimistic cells).
- **Insurance capacity:** excess-of-loss reinsurance signed; insurance-staking pool live (capped
  at 30% of reserve); per-event aggregate caps and coverage caps enforced; underwriting reload
  loops battle-tested.
- **Token utility evolution:** emissions approach expiry (end of year 4); supply becomes
  effectively fixed; structural demand (locks, bonds, insurance staking) sustains the token
  economy without incentives; buyback-redistribution eligibility is assessed against 5.4.
- **Capital allocation sophistication:** venue-neutral scoring across ≥ 6 protocols; institutional
  vault templates (KYC-gated); portfolio-level exposure controls spanning managers as a
  fund-of-funds; cross-chain readiness studies gated on custody discipline.
- **Critical economic gate → Stage 4:** AUM ≥ $2B; treasury ≥ $100M; reinsurance signed;
  institutional vault templates live; zero unresolved claims backlog.

## 15.4 Stage 4 — Institutional Adoption (Years 3–5)

- **Objective:** become the standardized institutional access layer for Solana LP markets — the
  stage at which Atlas' distribution moat (1.3) compounds.
- **Expected TVL:** $2–10B.
- **Participant composition:** pension-style allocators through KYC-gated vaults; protocol
  treasuries (including competing ecosystems) as white-label customers; multi-strategy manager
  houses; auditors and regulators as ongoing counterparties rather than gatekeepers.
- **Treasury objectives:** transition to an independent treasury foundation with DAO oversight
  (5.6); long-duration investing; first RWA allocation; optional strategic financing round as a
  permitted source (5.1, source 7); valuation-gated buyback-redistribution available.
- **Governance maturity:** foundation + professional investment committee; governance focus
  shifts to meta-parameters; constitutional stability becomes the primary governance product;
  emergency governance drill-tested (14.7).
- **Revenue composition:** institutional services lead — audited reporting, enterprise API,
  white-label licensing, data partnerships; management and performance fees scale mechanically;
  total protocol revenue reaches $20–67M/yr (13.4, optimistic to institutional cells), with
  counter-cyclical infrastructure revenue at ≥ 25% of the total.
- **Insurance capacity:** reinsurance plus capital-markets participation (selling excess-layer
  coverage); total insured capacity scales with TVL; stablecoin-integrity riders offered as an
  option; actuarial reload loops operate continuously.
- **Token utility evolution:** fully fixed supply; the veATLAS revenue share is the primary holder
  return; insurance staking at capacity; the fee-discount surface scales with institutional usage;
  the token governs institutional product parameters (never individual scores, 9.1).
- **Capital allocation sophistication:** venue-neutral across Solana plus adjacent ecosystems via
  custody-disciplined bridges; factor-exposure limits across managers (not just per-manager caps);
  fund-of-funds products (multi-vault allocations) offered to institutions.
- **Critical economic gate → Stage 5:** AUM ≥ $10B; institutional AUM ≥ 40% of total; reserve at
  target and reinsured; treasury foundation operational; net margin ≥ 15% of gross revenue.

## 15.5 Stage 5 — Mature Ecosystem (Years 5–7)

- **Objective:** operate as a self-funding financial utility that maximizes capital-allocation
  alpha per unit of risk across a full market cycle.
- **Expected TVL:** $10–25B.
- **Participant composition:** broad retail via regulated wrappers; institutional reallocation as
  standard practice; managers increasingly operating as registered entities; a stable, expert
  governance population with a functioning delegate market.
- **Treasury objectives:** formalized allocator with sub-funds and fiduciary duties; systemic
  liquidity role on standby; multi-jurisdiction custody; treasury ≥ $2B (5.6).
- **Governance maturity:** constitutional-level stability; only meta-parameters remain open to
  change; governance participation floors maintained through the cycle; transition of committee
  seats formalized.
- **Revenue composition:** fully diversified — no single stream exceeds 40% of revenue; management
  (fee-laddered at scale), performance, insurance margin, infrastructure, data, white-label,
  structured products, and reinsurance participation; the mix is deliberately counter-cyclical.
- **Insurance capacity:** internal + external + reinsurance + capital-markets layers; capacity
  scales with TVL; a full systemic-event drill is passed (Section 14 re-run at this stage's
  balance sheet).
- **Token utility evolution:** stable supply through a full cycle; revenue share + fee discounts
  dominate holder value; governance participation is institutional-grade; no emissions of any kind
  for ≥ 2 years.
- **Capital allocation sophistication:** fully automated allocation with human-in-the-loop reserved
  for novel asset classes; quantitative factor models matured; allocation output is itself an
  audited institutional product.
- **Critical economic gate → Stage 6:** AUM ≥ $25B; no-emissions operation for ≥ 2 years;
  reserve at target having survived a 20% AUM drawdown event; governance participation floors met.

## 15.6 Stage 6 — Global Liquidity Infrastructure (Years 7+)

- **Objective:** serve as liquidity infrastructure for the ecosystem at large — the
  capital-allocation utility layer beneath DeFi, not merely a product on top of it.
- **Expected TVL:** $25–50B+.
- **Participant composition:** the full ecosystem — retail, DAOs, sovereign-adjacent treasuries,
  asset managers, venues, and other protocols as white-label users of the allocation OS.
- **Treasury objectives:** liquidity of last resort for the Atlas ecosystem; market-maker of last
  resort in managed venues under defined policies; global multi-currency, multi-jurisdiction
  allocation; treasury ≥ $2B and operated by a formalized allocator.
- **Governance maturity:** system-of-record governance; standards-setting for LP-manager
  reputation across ecosystems; interoperability with ecosystem-wide risk bodies.
- **Revenue composition:** diversified and counter-cyclical; infrastructure licensing dominates at
  the margin; insurance operates as a scaled business, including reinsuring other protocols' tails
  (2.3).
- **Insurance capacity:** systemic capacity sourced through capital markets; the protocol is a net
  seller of tail coverage; the reserve's maximum-loss-in-any-window is capped by contract, not by
  hope.
- **Token utility evolution:** the token is a mature work-and-claim instrument; its value derives
  from cash flows and structural use, exactly as designed in 7.5; no emissions exist to be defended.
- **Capital allocation sophistication:** global, venue-neutral, cross-chain with custody
  discipline; the reputation ledger is an industry standard that other protocols reference when
  assessing LP managers.
- **Continuous gate:** the protocol must remain a liquidity-provision utility in normal times and
  a source of stability in stress times; failure of either role triggers a governance
  constitutional review.

## 15.7 Stage gates, contingencies, and kill-switches

Stage transitions are **gated, not dated**: a stage is entered only when its gate clears. If a
gate is not met on schedule, the stage is extended and *discretionary* economic programs (grants,
POL expansion, incentive spend, buybacks) pause until re-verification. Automatic economic
kill-switches guard the balance sheet independently of governance:

| Trigger | Automatic action | Authority |
| --- | --- | --- |
| Treasury runway < 18 months | Halt all discretionary programs; rebalance treasury to stable bands; governance review within 30 days | Treasury policy (5.5) |
| Insurance reserve < 50% of target | Premium reload for high-risk tiers; pause new coverage in the affected class; treasury backstop activates | Insurance policy (6.5) |
| Insurance combined-ratio > 100% for two consecutive quarters | Underwriting review; reload; coverage limits tightened | Risk committee |
| AUM declines > 50% from peak within 90 days | Defensive mode; cash to 25%; emergency-liquidity standby | Risk engine (11.4) |
| Emission-budget deviation > 10% | Halt disbursements pending independent audit | Bootstrap treasury policy |
| Any slashing ≥ 50% of bond | Mandatory governance ratification + published precedent review | 4.9 / 12.2 |

## 15.8 End-state economic synthesis

At maturity the protocol's economy is characterized by four properties that the design holds
constant from day one:

1. **Fee-funded, not emission-funded:** every stage after bootstrap pays for itself with revenue;
   emissions are a scheduled, expiring bridge (13.1).
2. **Counter-cyclical revenue:** infrastructure and insurance revenues grow with *customers*, not
   *markets*, damping the AUM cycle (13.5).
3. **Layered protection with honest exclusions:** insurance, bonds, treasury backstop, and
   reinsurance cover structural risk; market risk stays allocated and reported (6.6, 14.13).
4. **Reputation as the compounding asset:** the score, bond, and deferral stack make disciplined
   management the dominant strategy at every stage (8.4), so scale makes the system *better*, not
   more fragile.

---

# 16. Appendix A — Parameters, Notation, Formulas

This appendix is the machine-readable reference for the parameterization used throughout this
document. Every value is a *default* — governance-amendable through the classes in 12.2 unless
marked constitutional.

## 16.1 Notation

| Symbol | Meaning | First use |
| --- | --- | --- |
| `A` | Average AUM | 13.3 |
| `A*` | Breakeven AUM | 13.4 |
| `α` | Protocol take of management fee (0.25 × 0.0075 = 0.001875) | 13.3 |
| `β` | Protocol take of performance fee (0.20 × 0.15 = 0.030) | 13.3 |
| `y` | Blended net strategy yield | 13.3 |
| `p` | Fraction of AUM above high-water mark (earning performance fees) | 13.3 |
| `Oth₀` | Infrastructure fixed revenue (F7–F12) | 13.3 |
| `o` | Infrastructure-variable revenue margin (1 bp × A) | 13.3 |
| `I` | Insurance net margin (10 bps on 80% of AUM = 8 bps × A) | 13.3 |
| `O_fixed` | Fixed operating cost ($3M/yr) | 13.3 |
| `o_v` | Variable operating cost (5 bps × A) | 13.3 |
| `R(A)`, `O(A)`, `N(A)` | Revenue, operating cost, net cash flow | 13.3 |
| `NAVPS` | Net asset value per vault share | 3.1 |
| `HWM` | High-water mark (permanent per manager-vault identity) | 3.2 |
| `λ` | Exponential smoothing factor per score component (0.1–0.3) | 9.4 |
| `E[L_v]` | Expected loss for vault `v` (insurance pricing) | 6.3 |
| `C_t` | Smoothed score component at epoch `t` | 9.4 |
| `S_t` | Raw score component sample at epoch `t` | 9.4 |

## 16.2 Parameter register (defaults, governance-amendable)

**Fees (Section 10.1).** F1 management 75 bps/yr (50–150 by tier), split 75/25 manager/protocol;
F2 performance 15% (10–20 by tier) above HWM, split 80/20; F4 expedited exit 25 bps (24–72h) /
50 bps (instant); F5 deposit 0 (max 50 bps); F6 insurance premium 10–30 bps/yr; F7 listing
$5k–$100k by tier; F8 placement 1% of gross deposits (year 1); F9 analytics $500/$5k per month;
F10 API $250/$2.5k per month; F11 institutional reporting $2k/month; F12 white-label $500k/yr +
10% of gross; F13 governance participation incentive (capped); total investor cost cap 3%/yr
(base configuration).

**Bonds (4.3).** Tier 1 (score ≥85) 0.25%, min $25k, max $250k; Tier 2 (70–84) 0.50%, $25k/$500k;
Tier 3 (55–69) 1.00%, $25k/$750k; Tier 4 (40–54) 1.50%, $50k/$1M; Tier 5 (<40) 2.00%, $50k/$2M.
Composition 50% ATLAS / 50% stablecoin; top-up tolerance 5% within 7 days; unbond cooldown 30 days;
bond frozen while delegated capital or claims are outstanding.

**Allocation caps (9.5).** Per-manager 30%; per-venue 40%; per-token 20%; memecoin class 10%;
stable-pool class 25%; cash reserve ≥10% (up to 25% in stress); pairwise manager correlation ≤0.6;
reallocation drift threshold 5%.

**Score (9.2–9.4).** Weights 30/20/15/10/10/10/5 (fee/risk/drawdown/retention/consistency/TVL
growth/governance); smoothing λ ∈ {0.1…0.3} per component; max upward drift 10 points/epoch;
sustained thresholds for tier changes (3 up / 1 down epochs); tier boundaries ≥85/70/55/40;
trial caps sandbox ≤2% NAV and ≤$250k, trial ≤5% NAV and ≤$1M.

**Reserves (6.2, 11.4).** Insurance target 2% of insured TVL, floor $2M, solvency floor 50% of
target; per-event aggregate cap 15% of reserve; per-vault coverage cap 5% of vault TVL; co-insurance
5–10%; insurance-staking cap 30% of reserve; vault cash buffer ≥10% NAV; emergency liquidity pool
≥1% of TVL; treasury runway 24 months; grants ≤15% of treasury inflows/yr; audit spend ≥10% of
OpEx.

**Treasury bands (5.2).** Stables 50% (40–65); SOL/majors 25% (15–35); POL 15% (5–25); strategic
10% (0–15); speculative 0% (0–5). Spending ladders: ≤$50k executive; ≤$500k treasury sub-DAO
(48h timelock); ≤$5M governance (10% quorum); >$5M governance + counsel (15% quorum, supermajority).

**Waterfall (2.4).** ① Reserve to target (≥2% TVL, floor $2M); ② operating reserve 24-month
runway; ③ treasury 60%; ④ insurance 25%; ⑤ veATLAS 15% of remainder.

**veATLAS (7.3).** Lock 1 week–4 years; weight = lock × duration multiplier (1.0 at 1yr … 2.5 at
4yr); non-transferable; delegation permitted.

**Token (7.4).** Supply 1B; allocations 25/20/10/20/20/5 (treasury/ecosystem/insurance/team/
investors/community); bootstrap emissions ≤2% of supply/yr, expiring end of year 4; supply change
is constitutional (12.2) with 90-day notice.

**Governance (12.2).** Quorums 5/10/15/15% (parametric/fiscal/protocol-critical/constitutional);
passage simple majority / simple / supermajority 60% / supermajority 66%; timelocks 48h/72h/7d/30d.

**Redemptions (3.4).** Standard queue T+1..T+7 at settlement NAV; expedited 24–72h (25 bps) or
instant (50 bps) bounded by daily liquidity; gates max 30 days (supermajority to extend); lookback
TWAP pricing (24h) optional above $50M vault AUM.

**Manager compensation (4.5).** Management fee 75% of F1, paid monthly; performance fee 80% of F2;
deferral 50% of performance fees into a 6-month escrow with clawback; co-pay 10 bps/yr of delegated
capital; fee ladder −10–25 bps at $10M/$50M/$150M delegated thresholds.

## 16.3 Formula reference

```
NAVPS            = NAV / shares_outstanding
shares_minted    = deposit_amount / NAVPS                 (3.1)

TWR over [t0,t]  = Π (NAVPS_t / NAVPS_{t-1}) − 1          (3.2)
APY              = (1 + TWR)^(365/days) − 1               (3.2)
HWM              = max over history of manager-vault NAVPS (permanent identity)   (3.2)

perf_fee_vault   = 15% × (NAVPS − HWM) × shares_outstanding, crystallized at exit    (3.3)

score            = 0.30·fee_generation + 0.20·risk + 0.15·drawdown + 0.10·retention
                 + 0.10·consistency + 0.10·tvl_growth + 0.05·governance            (9.3)

component_t      = (1−λ)·component_{t−1} + λ·sample_t                               (9.4)

raw_i            = score_i² · (1 − risk_i/100) · fee_efficiency_i · consistency_i/100
                 · volatility_decay_i · track_record(age_i, tvl_i) · tier_multiplier_i  (9.5)

weight_i         = constrained(raw_i / Σ raw_j, caps in 9.5)                        (9.5)

Premium_v        = E[L_v] × (1 + margin) + loading_v;  margin targets 20–40%        (6.3)

Reserve_target   = max(2% × insured_TVL, $2M)                                       (6.2)

R(A)             = α·A + β·y·A·p + (Oth₀ + o·A) + I(A)                              (13.3)
O(A)             = O_fixed + o_v·A                                                  (13.3)
N(A)             = R(A) − O(A)                                                      (13.3)
A*               = (O_fixed − Oth₀) / (α + β·y·p + o + I(A)/A − o_v)                (13.4)

R.O.I. test      : E[incremental revenue] ≥ program cost × (1 + capital charge)    (13.2)

Lookback NAVPS   : 24h TWAP for redemption pricing (vaults > $50M)                  (3.4)

Waterfall        : ① reserve → ② operating → ③ 60% treasury → ④ 25% insurance → ⑤ 15% veATLAS  (2.4)
```

## 16.4 Assumption register

Every material assumption in this document, with its owner section:

| # | Assumption | Value / basis | Owner |
| --- | --- | --- | --- |
| AS-1 | Blended management fee 75 bps, protocol take 25% | Fee-market benchmark vs. fund-of-funds (1.2) | 10.1 |
| AS-2 | Performance fee 15% above permanent HWM | Industry standard, HWM continuity prevents double-charge (AV-8) | 10.1 |
| AS-3 | Fixed operating cost $3M/yr; variable 5 bps·A | 20–30 person engineering/security/compliance operation at Solana costs | 13.3 |
| AS-4 | Insurance net margin 10 bps on 80% of AUM | Actuarial premium band less expected claims (6.3); conservative (I reserved, not spent) | 13.3 |
| AS-5 | Infrastructure-variable margin 1 bp·A | Analytics/API/reporting pricing scales with usage | 13.3 |
| AS-6 | Insurance solvency target 2% of insured TVL | Covers worst single modeled event + one simultaneous stress event (6.2) | 6.2 |
| AS-7 | Manager bond 0.25–2% of delegated capital by tier | Set so expected confiscation ≥ expected illicit gain (4.3) | 4.3 |
| AS-8 | Reserve caps: 15% per-event, 5% per-vault | Bounds any single claim to a survivable fraction (6.5) | 6.5 |
| AS-9 | Correlation threshold 0.6 | Standard statistical threshold for joint-exposure flags (9.5) | 9.5 |
| AS-10 | Allocation caps 30/40/20/10/25% | Diversification floor: no single manager/venue/token can threaten the system (9.5, 14.8) | 9.5 |
| AS-11 | Score weights 30/20/15/10/10/10/5 | Risk-adjusted returns dominate raw returns (9.1) | 9.3 |
| AS-12 | λ ∈ 0.1–0.3; recovery ±10 pts/epoch | Trust earned slowly, lost instantly (9.4) | 9.4 |
| AS-13 | Bootstrap emissions ≤2% supply/yr, expiry year 4 | Bridge financing, hard expiry (7.4) | 7.4 |
| AS-14 | veATLAS lock multiplier 1.0@1yr … 2.5@4yr | Long-horizon governance alignment (7.3) | 7.3 |
| AS-15 | Treasury bands stables 50% / SOL 25% / POL 15% / strategic 10% | Solvency-first balance sheet (5.2) | 5.2 |
| AS-16 | Fee cap 3%/yr total investor cost | Anti-rent boundary (10.3) | 10.3 |
| AS-17 | Withdrawal liquidity buffer ≥10% NAV | Funds an orderly standard-queue day (11.4) | 11.4 |
| AS-18 | Yield scenarios y ∈ 4–12% | Range across Solana LP market cycles (13.4) | 13.4 |
| AS-19 | AUM growth path doubling years 2–4 | Solana-native protocol growth benchmark (13.6) | 13.6 |

## 16.5 Fee and waterfall summary

The complete fee schedule is in 10.1; the revenue stream map in 2.2; the distribution waterfall in
2.4; insurance pricing in 6.3. This appendix's parameter register (16.2) is the normative default
source that 10.1 and 2.4 reference.

## 16.6 Mechanism-audit program

Post-launch, the design goals in 8.4 are validated by a standing audit program (referenced at
8.4 and in the roadmap's Stage 2 gate):

- **Cadence:** quarterly for the first two years post-launch; semi-annually thereafter; always
  after any change to fee, bond, cap, score, or insurance parameters.
- **Scope:** re-verify the six mechanism properties (8.4) against live data — IC (deviation-cost
  vs. deviation-benefit with live parameters), IR (participant surplus vs. outside options), budget
  balance (N(A) by quarter), sybil resistance (identity-graph density), collusion resistance
  (pairwise correlation distribution), robustness (dominant-strategy violations logged).
- **Evidence sources:** indexer traces (wash/churn filters), allocation engine logs, score history,
  claims record, slashing record, governance votes and delegation, treasury and reserve flows.
- **Adversarial review:** an external red-team run at least annually, tasked with proposing the
  cheapest manipulation of each metric; findings feed the countermeasure list in 8.3.
- **Reporting:** results published; any failed property triggers an automatic governance review in
  the protocol-critical class (12.2).

## 16.7 Document governance and revision

This specification is a governed artifact:

- **Editorial changes** (formatting, cross-reference fixes) — maintainer, recorded in commit
  history.
- **Parameter changes** — governed per 12.2; the register in 16.2 is updated in the same proposal
  as the governing parameter.
- **Design changes** (adding/removing mechanisms, changing the waterfall, score formula, or
  coverage definitions) — protocol-critical or constitutional class, with the Section 14 stress
  framework re-run before enactment.
- **Review cadence:** this document is re-validated at each roadmap stage gate (15.7) and after
  every material market or regulatory event affecting the assumptions in 16.4.







