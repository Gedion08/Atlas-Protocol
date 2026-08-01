use crate::state::*;
use anchor_lang::prelude::*;

/// Set a manager profile status. Governance or the configured slash authority may
/// set any status (including Banned); the profile owner may only self-deactivate.
#[derive(Accounts)]
pub struct SetStatus<'info> {
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
    pub signer: Signer<'info>,
}

pub fn set_status_handler(ctx: Context<SetStatus>, status: ManagerStatus) -> Result<()> {
    let config = &ctx.accounts.config;
    let signer = ctx.accounts.signer.key();
    let is_owner = signer == ctx.accounts.profile.owner;
    let is_privileged = signer == config.governance || signer == config.slash_authority;

    require!(is_owner || is_privileged, RegistryError::Unauthorized);

    if is_owner && !is_privileged {
        // Owners may only resign (deactivate); they cannot ban or suspend themselves
        // in ways that bypass protocol enforcement.
        require!(status == ManagerStatus::Inactive, RegistryError::Unauthorized);
        require!(
            ctx.accounts.profile.status != ManagerStatus::Banned,
            RegistryError::InvalidTransition
        );
    }

    let profile = &mut ctx.accounts.profile;
    profile.status = status;
    profile.updated_at = Clock::get()?.unix_timestamp;
    Ok(())
}
