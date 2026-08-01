use crate::state::*;
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct UpdateValue<'info> {
    #[account(
        seeds = [b"vault_config"],
        bump = config.bump
    )]
    pub config: Box<Account<'info, Config>>,
    #[account(
        mut,
        seeds = [b"atlas_vault", vault.authority.as_ref(), vault.base_mint.as_ref()],
        bump = vault.bump
    )]
    pub vault: Box<Account<'info, Vault>>,
}

pub fn update_value_handler(ctx: Context<UpdateValue>, values: Vec<u64>) -> Result<()> {
    let config = &ctx.accounts.config;

    // M-of-N oracle set (spec §3.1, AV-5): every oracle in `remaining_accounts`
    // must be an authorized, distinct signer and must have reported exactly one
    // value. The vault marks the median of the signed feeds so a single
    // compromised oracle cannot steer the NAV.
    let signers = ctx.remaining_accounts;
    require!(
        values.len() == signers.len()
            && (values.len() as u8) >= config.min_oracle_signatures
            && values.len() <= MAX_ORACLES,
        VaultError::OracleSignatureCount
    );
    let mut seen: Vec<Pubkey> = Vec::with_capacity(signers.len());
    for info in signers {
        let key = info.key();
        require!(info.is_signer, VaultError::OracleSignatureCount);
        require!(config.is_oracle(&key), VaultError::InvalidOracle);
        require!(!seen.contains(&key), VaultError::DuplicateOracleSigner);
        seen.push(key);
    }
    let new_total_value = median_of(&values);

    let now = Clock::get()?.unix_timestamp;
    let vault = &mut ctx.accounts.vault;
    accrue_time_fees(vault, config, now)?;

    // Oracle marks move in both directions (gains and losses must both be marked,
    // spec §3.1, AV-5). The first mark — initial position deployment — is unbounded;
    // subsequent marks are bounded to `max_value_move_bps` of the current value to
    // prevent a compromised oracle set from imposing arbitrary NAV spikes or
    // haircuts between the multi-source off-chain aggregation windows.
    if vault.oracle_marked {
        let max_move = (vault.total_value as u128)
            .checked_mul(config.max_value_move_bps as u128)
            .map(|v| v / 10_000)
            .ok_or(VaultError::MathOverflow)? as u64;
        let delta = new_total_value.abs_diff(vault.total_value);
        require!(delta <= max_move, VaultError::ValueMoveTooLarge);
    }
    vault.total_value = new_total_value;
    vault.oracle_marked = true;

    // Performance fee accrual against the high-water mark (spec §3.2, AV-8).
    if vault.shares_outstanding > 0 {
        let net = vault.net_nav();
        let navps = (net as u128)
            .checked_mul(SHARE_PRICE_SCALE as u128)
            .map(|v| v / vault.shares_outstanding as u128)
            .ok_or(VaultError::MathOverflow)?;
        let perf = accrued_perf_fee(
            navps,
            vault.hwm as u128,
            vault.shares_outstanding,
            vault.performance_fee_bps,
        );
        if perf > 0 {
            let protocol = perf
                .checked_mul(config.protocol_perf_share_bps as u64)
                .map(|v| v / 10_000)
                .ok_or(VaultError::MathOverflow)?;
            vault.accrued_perf_protocol = vault.accrued_perf_protocol.saturating_add(protocol);
            vault.accrued_perf_manager = vault
                .accrued_perf_manager
                .saturating_add(perf.saturating_sub(protocol));
        }
        if navps > vault.hwm as u128 {
            vault.hwm = navps.min(u64::MAX as u128) as u64;
        }
    }

    vault.last_accrual_ts = now;
    Ok(())
}
