use crate::state::*;
use anchor_lang::prelude::*;

/// Emergency exit: governance or risk engine transitions the vault into
/// `Emergency` shutdown. After this instruction:
/// - no new deposits or withdrawal requests are accepted,
/// - existing requests may be settled immediately (slot gate bypassed),
/// - the vault is wound down and will be closed once shares_outstanding == 0.
#[derive(Accounts)]
pub struct EmergencyExit<'info> {
    #[account(
        seeds = [b"vault_config"],
        bump = config.bump
    )]
    pub config: Box<Account<'info, Config>>,
    #[account(
        mut,
        seeds = [b"atlas_vault", vault.authority.as_ref(), vault.base_mint.as_ref()],
        bump = vault.bump,
        constraint = vault.status != VaultStatus::Emergency @ VaultError::EmergencyShutdown
    )]
    pub vault: Box<Account<'info, Vault>>,
    pub authority: Signer<'info>,
}

pub fn emergency_exit_handler(ctx: Context<EmergencyExit>) -> Result<()> {
    let config = &ctx.accounts.config;
    let signer = ctx.accounts.authority.key();

    let is_risk_engine = signer == config.risk_engine;
    let is_governance = signer == config.governance;
    require!(is_risk_engine || is_governance, VaultError::Unauthorized);

    let vault = &mut ctx.accounts.vault;
    let now = Clock::get()?.unix_timestamp;
    accrue_time_fees(vault, config, now)?;

    vault.status = VaultStatus::Emergency;
    vault.last_rebalance_at = now;
    Ok(())
}
