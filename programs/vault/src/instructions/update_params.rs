use crate::state::*;
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct UpdateParams<'info> {
    #[account(
        seeds = [b"vault_config"],
        bump = config.bump,
        constraint = governance.key() == config.governance @ VaultError::InvalidGovernance
    )]
    pub config: Box<Account<'info, Config>>,
    #[account(
        mut,
        seeds = [b"atlas_vault", vault.authority.as_ref(), vault.base_mint.as_ref()],
        bump = vault.bump
    )]
    pub vault: Box<Account<'info, Vault>>,
    /// Protocol governance (spec §12.1) — vault parameters are protocol-level.
    pub governance: Signer<'info>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct UpdateParamsInput {
    pub management_fee_bps: Option<u16>,
    pub performance_fee_bps: Option<u16>,
    pub insurance_premium_bps: Option<u16>,
    pub min_deposit: Option<u64>,
}

pub fn update_params_handler(ctx: Context<UpdateParams>, params: UpdateParamsInput) -> Result<()> {
    let config = &ctx.accounts.config;
    let vault = &mut ctx.accounts.vault;

    if let Some(fee) = params.management_fee_bps {
        require!(fee <= config.mgmt_fee_cap_bps, VaultError::FeeBpsTooHigh);
        vault.management_fee_bps = fee;
    }
    if let Some(fee) = params.performance_fee_bps {
        require!(fee <= config.perf_fee_cap_bps, VaultError::FeeBpsTooHigh);
        vault.performance_fee_bps = fee;
    }
    if let Some(premium) = params.insurance_premium_bps {
        require!(premium <= config.premium_cap_bps, VaultError::FeeBpsTooHigh);
        vault.insurance_premium_bps = premium;
    }
    if let Some(min) = params.min_deposit {
        vault.min_deposit = min;
    }
    Ok(())
}

#[derive(Accounts)]
pub struct SetManager<'info> {
    #[account(
        mut,
        has_one = authority @ VaultError::Unauthorized,
        seeds = [b"atlas_vault", vault.authority.as_ref(), vault.base_mint.as_ref()],
        bump = vault.bump
    )]
    pub vault: Box<Account<'info, Vault>>,
    /// New manager profile, must reference the new `manager` fee recipient and be active.
    #[account(
        constraint = manager_profile.key() == vault.manager_profile @ VaultError::InvalidManagerProfile
    )]
    pub manager_profile: Box<Account<'info, atlas_manager_registry::state::ManagerProfile>>,
    /// Vault deployer/owner (not the LP manager).
    pub authority: Signer<'info>,
}

pub fn set_manager_handler(ctx: Context<SetManager>, manager: Pubkey) -> Result<()> {
    require!(
        ctx.accounts
            .manager_profile
            .to_account_info()
            .owner
            == &atlas_manager_registry::ID,
        VaultError::InvalidManagerProfile
    );
    require!(
        ctx.accounts.manager_profile.owner == manager,
        VaultError::InvalidManagerProfile
    );
    require!(
        ctx.accounts.manager_profile.status
            == atlas_manager_registry::state::ManagerStatus::Active,
        VaultError::ManagerNotActive
    );

    let vault = &mut ctx.accounts.vault;
    vault.manager = manager;
    vault.manager_profile = ctx.accounts.manager_profile.key();
    vault.last_rebalance_at = Clock::get()?.unix_timestamp;
    Ok(())
}

/// Vault status transitions. Emergency and Paused are set by the risk engine /
/// governance; resuming to Active requires the vault authority or governance.
/// Signers: authority (vault owner), risk_engine, or governance.
#[derive(Accounts)]
pub struct SetStatus<'info> {
    #[account(
        seeds = [b"vault_config"],
        bump = config.bump
    )]
    pub config: Box<Account<'info, Config>>,
    #[account(
        mut,
        has_one = authority @ VaultError::Unauthorized,
        seeds = [b"atlas_vault", vault.authority.as_ref(), vault.base_mint.as_ref()],
        bump = vault.bump
    )]
    pub vault: Box<Account<'info, Vault>>,
    pub authority: Signer<'info>,
}

pub fn set_status_handler(ctx: Context<SetStatus>, status: VaultStatus) -> Result<()> {
    let config = &ctx.accounts.config;
    let signer = ctx.accounts.authority.key();
    let vault = &ctx.accounts.vault;

    let is_authority = signer == vault.authority;
    let is_risk_engine = signer == config.risk_engine;
    let is_governance = signer == config.governance;

    match (vault.status, status) {
        // Active -> Paused: circuit breaker; anyone privileged may pause.
        (VaultStatus::Active, VaultStatus::Paused) => {
            require!(
                is_authority || is_risk_engine || is_governance,
                VaultError::Unauthorized
            );
        }
        // Paused -> Active: requires authority or governance (not the risk engine alone).
        (VaultStatus::Paused, VaultStatus::Active) => {
            require!(is_authority || is_governance, VaultError::Unauthorized);
        }
        // -> Emergency: governance or risk engine only.
        (_, VaultStatus::Emergency) => {
            require!(is_risk_engine || is_governance, VaultError::Unauthorized);
        }
        // Emergency -> Active: governance only.
        (VaultStatus::Emergency, VaultStatus::Active) => {
            require!(is_governance, VaultError::Unauthorized);
        }
        (old, new) => require!(old == new, VaultError::Unauthorized),
    }

    let vault = &mut ctx.accounts.vault;
    vault.status = status;
    vault.last_rebalance_at = Clock::get()?.unix_timestamp;
    Ok(())
}
