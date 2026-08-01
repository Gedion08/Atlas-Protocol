use crate::state::*;
use anchor_lang::prelude::*;

/// Oracle-signed score submission (spec §3.3). Composite scores at or below the
/// configured threshold auto-suspend the manager.
#[derive(Accounts)]
pub struct SetScore<'info> {
    #[account(
        seeds = [b"atlas_registry_config"],
        bump = config.bump
    )]
    pub config: Box<Account<'info, RegistryConfig>>,
    #[account(
        mut,
        seeds = [b"manager", profile.owner.as_ref()],
        bump = profile.bump
    )]
    pub profile: Box<Account<'info, ManagerProfile>>,
    /// Must be the configured oracle.
    pub submitter: Signer<'info>,
}

pub fn set_score_handler(ctx: Context<SetScore>, score: ScoreInput) -> Result<()> {
    require!(
        ctx.accounts.submitter.key() == ctx.accounts.config.oracle,
        RegistryError::InvalidOracle
    );
    require!(
        score.fee_generation <= 100
            && score.risk <= 100
            && score.drawdown <= 100
            && score.capital_retention <= 100
            && score.consistency <= 100
            && score.tvl_growth <= 100
            && score.governance_participation <= 100,
        RegistryError::InvalidScore
    );

    let profile = &mut ctx.accounts.profile;
    profile.score = score.into();
    profile.updated_at = Clock::get()?.unix_timestamp;

    // Auto-suspend managers whose composite score collapses below the threshold.
    if profile.status == ManagerStatus::Active
        && profile.score.total <= ctx.accounts.config.score_threshold
    {
        profile.status = ManagerStatus::Suspended;
    }
    Ok(())
}
