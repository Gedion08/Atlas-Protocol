use crate::state::*;
use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};

#[derive(Accounts)]
pub struct InitializeConfig<'info> {
    #[account(
        init,
        payer = governance,
        space = Config::SPACE,
        seeds = [b"vault_config"],
        bump
    )]
    pub config: Account<'info, Config>,
    #[account(mut)]
    pub governance: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct InitializeConfigParams {
    /// M-of-N oracle set for NAV marks (spec §3.1, AV-5). At least
    /// `min_oracle_signatures` distinct keys; median-of-≥3 on `update_value`.
    pub oracles: Vec<Pubkey>,
    /// Number of distinct oracle signatures required per NAV mark.
    pub min_oracle_signatures: u8,
    pub risk_engine: Pubkey,
    pub treasury: Pubkey,
    pub insurance: Pubkey,
    pub veatlas: Pubkey,
    /// Insurance reserve target in base units (spec §2.4 flow ①).
    pub reserve_target: u64,
}

pub fn initialize_config_handler(
    ctx: Context<InitializeConfig>,
    params: InitializeConfigParams,
) -> Result<()> {
    validate_oracle_set(&params.oracles, params.min_oracle_signatures)?;

    let config = &mut ctx.accounts.config;
    config.governance = ctx.accounts.governance.key();
    config.oracles = [Pubkey::default(); MAX_ORACLES];
    for (i, key) in params.oracles.iter().enumerate() {
        config.oracles[i] = *key;
    }
    config.min_oracle_signatures = params.min_oracle_signatures;
    config.risk_engine = params.risk_engine;
    config.treasury = params.treasury;
    config.insurance = params.insurance;
    config.veatlas = params.veatlas;
    config.mgmt_fee_cap_bps = DEFAULT_MGMT_FEE_CAP_BPS;
    config.perf_fee_cap_bps = DEFAULT_PERF_FEE_CAP_BPS;
    config.premium_cap_bps = DEFAULT_PREMIUM_CAP_BPS;
    config.protocol_mgmt_share_bps = DEFAULT_PROTOCOL_MGMT_SHARE_BPS;
    config.protocol_perf_share_bps = DEFAULT_PROTOCOL_PERF_SHARE_BPS;
    config.insurance_share_bps = DEFAULT_INSURANCE_SHARE_BPS;
    config.treasury_share_bps = DEFAULT_TREASURY_SHARE_BPS;
    config.veatlas_share_bps = DEFAULT_VEATLAS_SHARE_BPS;
    config.co_pay_bps = DEFAULT_CO_PAY_BPS;
    config.reserve_target = params.reserve_target;
    config.settlement_slots = DEFAULT_SETTLEMENT_SLOTS;
    config.deferral_secs = DEFAULT_DEFERRAL_SECS;
    config.max_value_move_bps = DEFAULT_MAX_VALUE_MOVE_BPS;
    config.bump = ctx.bumps.config;
    Ok(())
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = authority,
        space = Vault::SPACE,
        seeds = [b"atlas_vault", authority.key().as_ref(), base_mint.key().as_ref()],
        bump
    )]
    pub vault: Account<'info, Vault>,
    #[account(
        init,
        payer = authority,
        mint::authority = vault,
        mint::decimals = 6,
        seeds = [b"shares", vault.key().as_ref()],
        bump
    )]
    pub shares_mint: Box<Account<'info, Mint>>,
    #[account(
        init,
        payer = authority,
        token::mint = base_mint,
        token::authority = vault,
        seeds = [b"escrow", vault.key().as_ref(), base_mint.key().as_ref()],
        bump
    )]
    pub vault_escrow: Box<Account<'info, TokenAccount>>,
    #[account(
        seeds = [b"vault_config"],
        bump = config.bump
    )]
    pub config: Box<Account<'info, Config>>,
    /// Linked manager profile, must be the account referenced by `manager`.
    pub manager_profile: Box<Account<'info, atlas_manager_registry::state::ManagerProfile>>,
    pub base_mint: Box<Account<'info, Mint>>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct InitializeParams {
    pub manager: Pubkey,
    pub management_fee_bps: u16,
    pub performance_fee_bps: u16,
    pub insurance_premium_bps: u16,
    pub min_deposit: u64,
}

pub fn initialize_handler(ctx: Context<Initialize>, params: InitializeParams) -> Result<()> {
    let config = &ctx.accounts.config;
    require!(
        params.management_fee_bps <= config.mgmt_fee_cap_bps,
        VaultError::FeeBpsTooHigh
    );
    require!(
        params.performance_fee_bps <= config.perf_fee_cap_bps,
        VaultError::FeeBpsTooHigh
    );
    require!(
        params.insurance_premium_bps <= config.premium_cap_bps,
        VaultError::FeeBpsTooHigh
    );
    require!(
        ctx.accounts
            .manager_profile
            .to_account_info()
            .owner
            == &atlas_manager_registry::ID,
        VaultError::InvalidManagerProfile
    );
    require!(
        ctx.accounts.manager_profile.owner == params.manager,
        VaultError::InvalidManagerProfile
    );
    require!(
        ctx.accounts.manager_profile.status == atlas_manager_registry::state::ManagerStatus::Active,
        VaultError::ManagerNotActive
    );

    let clock = Clock::get()?;
    let vault = &mut ctx.accounts.vault;
    vault.authority = ctx.accounts.authority.key();
    vault.manager = params.manager;
    vault.manager_profile = ctx.accounts.manager_profile.key();
    vault.shares_mint = ctx.accounts.shares_mint.key();
    vault.base_mint = ctx.accounts.base_mint.key();
    vault.bump = ctx.bumps.vault;
    vault.status = VaultStatus::Active;
    vault.management_fee_bps = params.management_fee_bps;
    vault.performance_fee_bps = params.performance_fee_bps;
    vault.insurance_premium_bps = params.insurance_premium_bps;
    vault.min_deposit = params.min_deposit;
    vault.total_value = 0;
    vault.shares_outstanding = 0;
    vault.accrued_mgmt_protocol = 0;
    vault.accrued_mgmt_manager = 0;
    vault.accrued_perf_protocol = 0;
    vault.accrued_perf_manager = 0;
    vault.accrued_insurance = 0;
    vault.hwm = SHARE_PRICE_SCALE;
    vault.last_accrual_ts = clock.unix_timestamp;
    vault.pending_shares = 0;
    vault.pending_value = 0;
    vault.created_at = clock.unix_timestamp;
    vault.last_rebalance_at = clock.unix_timestamp;
    vault.oracle_marked = false;
    Ok(())
}
