# On-Chain Invest/Withdraw Wiring — Design

Status: **design, not implemented.** This is the non-breaking migration plan for
making deposits, withdrawals, and rebalances transact through the deployed Solana
vault program, while keeping the current message-signing demo flow fully intact.

## 1. Current state (verified 2026-08-04 against devnet RPC)

### What is real

| Item | Value | State |
|---|---|---|
| `atlas_vault` program | `BeEtwSTYjPs47ZWa4joMppCNdJs4f4GRumCRtKXfSfSR` | deployed, **0 accounts** |
| `atlas_manager_registry` | `CgLpJydFMSrkAHLjhmEZX3pFF4M5BC8CY36ajBe2bvTs` | deployed, **0 accounts** |
| `atlas_staking` | `4PxMwLR7KimbQct4NYXyjVk42aMK4vrKcBobBGepjJ4H` | deployed |
| `atlas_treasury` | `86pSPBBGKzMXteNGjxPT8XSt3fjuZGRMVMnEhQpWiefS` | deployed |
| `atlas_governance` | `5fcfpz4DK8G4HbPMyX259fgotXJaE4v7yNhXidRAtWnD` | deployed |
| Bond mint / ATLAS mint / revenue mint | devnet-config.json | exist (mint authority `4uQeXE…`, **not** the recorded deployer `AqsVGUd…`) |
| `deploy/deployer.json` owner | `AqsVGUdZKd7cKr3KJSW7mTM1BwTyyS4pKqDAT5qDQBnu` | ~6.5 SOL funded |
| vault/registry/staking/treasury/governance config PDAs | — | **all missing** |

Program code is complete and green: `deposit`, `request_withdraw`/`settle_withdraw`
(T+1 queue, NAVPS-locked, pro-rata), `update_value` (M-of-N median, max-move bound,
HWM perf fees), `settle_fees`/`release_fee_escrow`, `rebalance` (6h keeper cooldown),
`set_status`, `update_config`/`update_params`, `set_manager`. 33 Rust unit tests pass;
`programs/vault/tests/vault.ts` is a full Anchor E2E spec that has never run locally.

### What is fake / broken

- **Invest flow is a DB simulation.** `invest-dialog.tsx` message-signs a payload
  (`atlas.request v1`), POSTs to `routes/investors.ts`, and `repositories-pg.ts`
  inserts a ledger row. No Solana transaction touches the vault program. Seed vault
  addresses are not real PDAs.
- **`ORACLE_LOOP` + circuit-breaker on-chain paths are dead.** `services/oracle/solana.ts`
  and `services/circuit-breaker/index.ts` build real transactions but point at
  `9h29CPwo…`, which **does not exist on devnet**. The real registry is `CgLpJydF…`.
  `env.ts` default `ATLAS_REGISTRY_PROGRAM_ID` is also the dead ID.
- **No on-chain config or vault exists**, so nothing could transact even if the app
  tried.

### Why the demo must not break

113 backend tests, 8 frontend tests, and CI all depend on the message-sign + DB
ledger flow against seeded (fake) vaults. The migration must therefore be
**additive**: real on-chain vaults coexist with demo vaults, selected per-vault via
metadata. No existing path changes behavior.

## 2. Target architecture: dual-mode vaults

`Vault` (atlas-types) gains optional on-chain metadata:

```ts
interface OnchainVaultMeta {
  programId: string;       // atlas_vault program id
  vaultPda: string;        // ["atlas_vault", authority, base_mint]
  authority: string;
  managerProfile: string;  // registry PDA ["manager", manager_owner]
  baseMint: string;
  escrowPda: string;       // ["escrow", vault, base_mint]
  sharesMint: string;      // ["shares", vault]
  decimals: number;        // base mint decimals (6)
  minDeposit: number;      // mirrored from chain
}
interface Vault { …existing…; onchain?: OnchainVaultMeta }
```

- `onchain === undefined` → today's flow, byte-for-byte unchanged.
- `onchain` present → the invest UI and backend route take the wallet-signing path.

### Core principle: backend builds, wallet signs, chain is truth

1. **Backend builds.** A new `services/vault/solana.ts` derives PDAs and assembles
   a legacy `Transaction` containing ATA-creation instructions (when needed) plus the
   Anchor instruction (`deposit` / `request_withdraw` / `settle_withdraw`), using raw
   discriminators + borsh — the exact pattern already proven in
   `services/oracle/solana.ts`. Returns the serialized tx to the client.
2. **Wallet signs + sends.** `invest-dialog.tsx` (wallet-adapter already has
   `signTransaction`) deserializes, signs, broadcasts, and awaits `confirmed`.
3. **Chain is truth.** No confirm endpoint, no DB ledger write for on-chain vaults.
   The dashboard reads live chain state (vault PDA for TVL/NAVPS; the user's shares
   ATA + withdrawal-request PDA for their position).

This keeps user custody, matches the program's design (user signs token transfer +
mint), avoids an anchor-client dependency, and makes the backend the single,
testable instruction assembler.

## 3. On-chain interface reference (verified from program source)

All PDAs are `PublicKey.findProgramAddressSync`. All instructions carry the Anchor
8-byte discriminator `sha256("global:<name>")[..8]`.

| Instruction | Discriminator (hex) | Borsh args |
|---|---|---|
| `deposit` | `f223c68952e1f2b6` | `amount: u64` |
| `request_withdraw` | `895fbb60fa8a1fb6` | `shares: u64` |
| `settle_withdraw` | `36d39bac85610cbf` | — |
| `update_value` | `b46a61c134aa2e97` | `values: Vec<u64>` (u32 LE len + u64s) |
| `rebalance` | `6c9e4d09d234583e` | — |
| `set_status` | `b5b8e0cbc11db1e0` | `status: u8` |

### PDAs

```
config          ["vault_config"]                        (vault program)
vault           ["atlas_vault", authority, base_mint]   (vault program)
shares_mint     ["shares", vault]                       (vault program)
escrow          ["escrow", vault, base_mint]            (vault program, token account, authority=vault)
withdraw_req    ["withdraw", vault, user]               (vault program)
manager_profile ["manager", owner]                      (registry program)
registry_config ["atlas_registry_config"]               (registry program)
```

### deposit (amount: u64)

Account order (isWritable, isSigner):

1. `config`          — ro
2. `vault`           — rw
3. `manager_profile` — ro (owner must be registry program, status Active)
4. `user`            — rw, signer
5. `user_token`      — rw (ATA of base_mint, authority=user)
6. `vault_escrow`    — rw (escrow PDA)
7. `shares_mint`     — rw (authority=vault)
8. `user_shares`     — rw (ATA of shares_mint, authority=user)
9. `token_program`   — ro (`TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA`)

Requires vault Active, amount ≥ min_deposit; shares minted at current NAVPS (first
deposit at par); vault signer PDA authorizes the mint.

### request_withdraw (shares: u64)

1. `config`          — ro
2. `vault`           — rw (not Emergency)
3. `request`         — rw, init (payer=user, seeds `["withdraw", vault, user]`)
4. `user`            — rw, signer
5. `user_shares`     — rw (authority=user, amount ≥ shares)
6. `shares_mint`     — ro
7. `system_program`  — ro

Creates the WithdrawalRequest; value locked at current net NAVPS;
`settlement_slot = slot + config.settlement_slots` (default 86,400 ≈ 6h @400ms).

### settle_withdraw ()

1. `config`          — ro
2. `vault`           — rw (must be Active)
3. `request`         — rw
4. `user`            — rw, signer
5. `vault_escrow`    — rw (escrow PDA)
6. `user_token`      — rw (ATA of base_mint)
7. `user_shares`     — rw
8. `shares_mint`     — rw
9. `token_program`   — ro

Runs only after `settlement_slot`; fills pro-rata against `pending_value`, hard-capped
by escrow; burns shares; transfers payout from escrow via vault PDA signer.

### update_value (values: Vec<u64>) — oracle marks

1. `config` — ro
2. `vault`  — rw

`remaining_accounts` = each oracle signer (must be in config.oracles, distinct,
signing). `values[i]` pairs with signer `i`. Median becomes `total_value`; bounded to
±`max_value_move_bps` after the first mark; HWM/perf fee ratchet on gains.

### Deployment bootstrap sequence

1. `initialize_config` (vault) — governance signs; sets oracle set, risk engine,
   treasury, insurance, veatlas, reserve target.
2. `initialize_config` (registry) + `register` manager (needs bond mint ATA + bond).
3. `initialize` (vault) — authority signs; params = manager (≠ authority), fees ≤
   caps, min_deposit; requires an Active linked manager profile.
4. Mint base tokens to the test investor's ATA.

## 4. Backend changes (all additive)

### 4.1 `env.ts`

```ts
ATLAS_REGISTRY_PROGRAM_ID: default → "CgLpJydFMSrkAHLjhmEZX3pFF4M5BC8CY36ajBe2bvTs"   // FIX dead default
ATLAS_VAULT_PROGRAM_ID:    "BeEtwSTYjPs47ZWa4joMppCNdJs4f4GRumCRtKXfSfSR"
SOLANA_RPC_URL:            existing (devnet for on-chain vaults)
```

No global enable flag required — on-chain behavior is **per-vault metadata**, so the
demo path is untouched even with these env vars set.

### 4.2 `services/vault/solana.ts` (new)

Pure functions, unit-testable with a mock `Connection`:

- `vaultPda(programId, authority, baseMint)`, `sharesMintPda`, `escrowPda`,
  `withdrawRequestPda`, `managerProfilePda` — re-exports/extends the registry PDAs
  already in `services/oracle/solana.ts`.
- `depositDiscriminator` / `requestWithdrawDiscriminator` / `settleWithdrawDiscriminator`
  (`sha256("global:…")[..8]`).
- `buildDepositTransaction({ connection, programId, vaultMeta, user, amount })` →
  `Transaction` with ATA-creation instructions for `user_token`/`user_shares` when the
  accounts don't exist, then the `deposit` instruction. feePayer = user.
- `buildRequestWithdrawTransaction` — same shape, `request_withdraw` instruction.
- `buildSettleWithdrawTransaction` — `settle_withdraw` instruction.
- `fetchVaultState(connection, …)` → decoded vault account
  (`total_value`, `shares_outstanding`, accrued fees, `status`, `share_price`).
- `fetchUserPosition(connection, …)` → shares ATA balance + withdrawal-request PDA
  (pending/queued, settlement_slot).

New backend dependency: `@solana/spl-token` (pure TS; already used by `deploy/`).

### 4.3 Routes (`routes/vaults.ts` or `routes/investors.ts`)

- `GET /api/v1/vaults/:address` — when `vault.onchain` present, enrich the vault DTO
  with live `tvl`, `sharesOutstanding`, `sharePrice` from `fetchVaultState` (mirrors
  `services/pricing/computeSharePricing` semantics, now NAVPS-based instead of 1:1).
- `POST /api/v1/vaults/:address/invest/build` — body
  `{ action: "deposit"|"request_withdraw"|"settle_withdraw", amount?, shares? }`,
  wallet header (owner only, no message signature required on this path). Returns
  `{ transaction: base64, vaultPda, blockhash }`. 404 for demo vaults.
- `GET /api/v1/positions?owner=` — for on-chain vaults the user holds, derive shares
  balance + pending request from chain (no DB write).
- Positions/list endpoints that currently read the DB ledger continue to serve demo
  vaults; chain-derived positions are merged by vault address.

### 4.4 Oracle + circuit breaker (registry ID fix)

Replace the dead `9h29CPwo…` constant (`services/oracle/solana.ts:14`) and the env
default (`env.ts:34`) with `CgLpJydF…`. Behavior otherwise unchanged; their
`update_value`/`set_status` counterparts are later-phase (see §7).

## 5. Frontend changes (`invest-dialog.tsx`)

- If `vault.onchain` is set: use `signTransaction` (not `signMessage`).
  1. `POST …/invest/build` → `Transaction.from(Buffer.from(base64,"base64"))`.
  2. `const signed = await wallet.signTransaction(tx)`.
  3. `connection.sendRawTransaction(signed.serialize())` + await confirmation.
  4. Refetch vault + positions; no message-signing, no DB dependence.
- Withdraw becomes two steps in the UI: "Request withdrawal" (build/sign
  `request_withdraw`), then, once `settlement_slot` has passed (position shows
  `settled`/due), "Claim" (build/sign `settle_withdraw`).
- Demo path (no `vault.onchain`): identical to today.

## 6. SDK changes (`packages/sdk`)

New methods on the existing REST client: `buildInvestTransaction(vault, action, …)`
and, for display, typed `OnchainVaultMeta` passthrough. No new wallet/tx code in the
SDK — it stays a REST client (matches its role).

## 7. Phased rollout + verification gates

Each phase must leave `corepack pnpm typecheck`, backend 113+ tests, frontend tests,
and `cargo test`/`cargo clippy` green.

1. **Phase 1 — state + fix.** `env.ts` vault vars, registry-ID fix (§4.4), atlas-types
   `OnchainVaultMeta`, `services/vault/solana.ts` pure builders with unit tests (mock
   connection). *Gate: new unit tests pass; demo suites untouched.*
2. **Phase 2 — API.** invest/build + chain-backed positions + vault enrichment.
   *Gate: HTTP tests with mocked connection.* ✅ Done — `POST /api/v1/vaults/:address/invest/build`
   (deposit/request_withdraw/settle_withdraw, `x-atlas-owner` fee payer), `VaultClient` injection
   via `buildApp({ vaultClient })`, chain enrichment in `GET /vaults*`, on-chain positions merged
   into `GET /investors/:wallet{,/positions}`. 139 backend tests pass (incl. new `onchain-vault.test.ts`
   with a mocked connection); fixed a `readU64` signed-int32 bug in `services/vault/solana.ts` that
   skewed any u64 whose low word set the sign bit (off-by-2^32).
3. **Phase 3 — frontend.** On-chain branch in `invest-dialog.tsx` + withdraw
   two-step. *Gate: frontend tests + manual wallet flow against a local/forks RPC or
   devnet.* ✅ Done — `invest-dialog.tsx` branches on `vault.onchain`: `POST invest/build`
   → `decodeTransaction` → wallet-adapter `sendTransaction(tx, connection)` (sign+send).
   Deposit sends base-units `deposit`; withdraw sends `request_withdraw` with an
   on-chain lockup notice; when a request's `claimable > 0` (slot reached) the dialog
   offers "Settle & claim" (`settle_withdraw`). `InvestorPosition` gained optional
   `claimable`/`pendingShares`/`settlementSlot`; `fetchUserPosition` now gates
   `claimable` on the current slot; `enrichVault` converts on-chain `minDeposit` to
   display units. `lib/solana.ts` helpers (`decodeTransaction`, `toBaseUnits`) with
   unit tests; invest page shows a Settle action for claimable positions.
4. **Phase 4 — bootstrap devnet.** Resolve the mint-authority mismatch (§8, risk R1),
   run `initialize_config` (registry + vault) and `initialize` (vault) against a
   fresh base mint owned by `deployer.json`; mint test base tokens. Register the
   vault as an on-chain seed entry. *Gate: `GET /vaults/:addr` shows chain TVL; an
   E2E deposit→request→settle lands on devnet.*
5. **Phase 5 — oracle + keeper.** Point `services/oracle` `update_value` at the real
   vault config (backend builds remaining-accounts oracle tx, signers = oracle
   keypairs in `deploy/`); rebalance keeper loop. *Gate: NAVPS moves on a signed mark.*
6. **Phase 6 — docs + CI.** Update `docs/architecture.md` (remove "1:1 until oracle
   wired"), `SECURITY.md` stale `set_score` note, README env table; add
   `docs/DEPLOYMENT-GUIDE.md` steps for the on-chain flow; optional integration test
   behind a devnet flag.

## 8. Risks & mitigations

- **R1 — mint authority mismatch.** Bond/ATLAS/revenue mints are owned by
  `4uQeXE…`, not the recorded deployer. → Do not reuse them for base deposits; create
  a fresh base mint owned by the keypair that signs bootstrap. Investigate whether
  `deployer.json` holds `4uQeXE…` (do not print the secret).
- **R2 — settlement timing.** `settle_withdraw` is slot-gated and pro-rata; a short
  escrow means partial fills (the user keeps unfilled shares). → UI must surface
  queued/settled states from the withdrawal-request PDA, not assume full payout.
- **R3 — devnet reset.** Devnet state is not durable. → Bootstrap is idempotent
  ("already in use" tolerated) and re-runnable; treat chain state as ephemeral.
- **R4 — fee semantics.** Backend preview math must mirror the program (accrue fees
  before share issuance; share_price = net_nav/shares × 1e9). Reuse `computeSharePricing`
  shape, but source `tvl`/shares from chain for on-chain vaults.
- **R5 — wallet `signTransaction` availability.** Some adapters expose only
  `signMessage`. → Fall back to message-sign demo flow for on-chain vaults when
  `signTransaction` is absent, or block with a clear message.
- **R6 — raw instruction correctness.** Account order / writability / discriminator
  drift silently produces invalid txs. → Program E2E test (`vault.ts`) is the
  reference; add a backend integration test that asserts built transactions against
  a local validator or devnet (Phase 4/6).
