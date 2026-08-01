use crate::state::*;
use anchor_lang::prelude::*;

/// Minimum interval between keeper-triggered rebalances (spec §12.2 automation).
/// Prevents spam triggering; the actual position moves are executed off-chain by
/// the LP manager, but the cadence and audit trail are enforced on-chain.
pub const MIN_REBALANCE_INTERVAL_SECS: i64 = 6 * 3600;

#[derive(Accounts)]
pub struct Rebalance<'info> {
    #[account(
        seeds = [b"vault_config"],
        bump = config.bump,
        constraint = vault.status == VaultStatus::Active @ VaultError::VaultNotActive
    )]
    pub config: Box<Account<'info, Config>>,
    #[account(
        mut,
        seeds = [b"atlas_vault", vault.authority.as_ref(), vault.base_mint.as_ref()],
        bump = vault.bump
    )]
    pub vault: Box<Account<'info, Vault>>,
    /// Any account may trigger a rebalance heartbeat; the caller pays the fee
    /// (spec §12.2: permissionless keepers).
    pub keeper: Signer<'info>,
}

pub fn rebalance_handler(ctx: Context<Rebalance>) -> Result<()> {
    let vault = &mut ctx.accounts.vault;
    let now = Clock::get()?.unix_timestamp;

    require!(
        cooldown_elapsed(vault.last_rebalance_at, now, MIN_REBALANCE_INTERVAL_SECS),
        VaultError::RebalanceCooldown
    );

    vault.last_rebalance_at = now;
    vault.rebalance_count = vault.rebalance_count.saturating_add(1);
    Ok(())
}

/// True once `now` is at least `cooldown_secs` after `last`.
pub fn cooldown_elapsed(last: i64, now: i64, cooldown_secs: i64) -> bool {
    now.saturating_sub(last) >= cooldown_secs
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cooldown_gates_rebalances() {
        assert!(cooldown_elapsed(0, MIN_REBALANCE_INTERVAL_SECS, MIN_REBALANCE_INTERVAL_SECS));
        assert!(!cooldown_elapsed(0, MIN_REBALANCE_INTERVAL_SECS - 1, MIN_REBALANCE_INTERVAL_SECS));
        assert!(cooldown_elapsed(1_000, 1_000 + 6 * 3600, MIN_REBALANCE_INTERVAL_SECS));
        assert!(!cooldown_elapsed(1_000, 1_000, MIN_REBALANCE_INTERVAL_SECS));
    }
}
