# Security Policy

## Reporting a Vulnerability

Atlas Protocol handles real capital on-chain. Security is the top priority.

Please report vulnerabilities privately to the maintainers. Do **not** open a public
issue for security findings.

- Email: security@atlasprotocol.dev (placeholder — replace with real address)
- On-chain bug bounty: see program docs (placeholder)

Include:
- Program/package affected
- Severity estimate (critical / high / medium / low)
- Reproduction steps or PoC
- Any funds at risk

## Response expectations

- Acknowledgement within 48 hours
- Assessment and mitigation plan within 7 days
- Coordinated disclosure once a fix is deployed

## In-scope

- All programs under `programs/` (vault, manager-registry, staking)
- Backend services under `apps/backend`
- Frontend under `apps/frontend`

## Hardening notes

- Programs are escrow-heavy: vault escrow, bond escrow, insurance escrow. All token
  authorities are PDAs with canonical seeds; review signer seeds carefully.
- `set_score` on manager-registry requires the configured oracle signer on-chain
  (`SetScore.submitter` must equal `RegistryConfig.oracle`), and the backend REST API
  exposes oracle submissions as read-only. No permissionless score writes exist.
- Share pricing is 1:1 until the performance oracle is wired in; do not deploy the
  vault with real assets in this state.
- Solana keypairs (`deploy/deployer.json`, `deploy/oracle1-3.json`, and backend
  `ORACLE_KEYPAIR`/`GOVERNANCE_KEYPAIR` values) are secrets. They are gitignored;
  inject them via environment/secret managers. If any keypair was ever committed,
  rotate it immediately.
- A Helius API key was previously committed inside `deploy/devnet-config.json`; the
  file is now sanitized, but treat any previously published key as compromised and
  regenerate it in the Helius dashboard.
