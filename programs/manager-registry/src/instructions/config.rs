use crate::state::*;
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct InitializeConfig<'info> {
    #[account(
        init_if_needed,
        payer = governance,
        space = RegistryConfig::SPACE,
        seeds = [b"atlas_registry_config"],
        bump
    )]
    pub config: Account<'info, RegistryConfig>,
    #[account(mut)]
    pub governance: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct InitializeConfigParams {
    pub oracle: Pubkey,
    pub slash_authority: Pubkey,
    pub bond_mint: Pubkey,
    pub bond_amount: u64,
    pub score_threshold: u8,
}

pub fn initialize_config_handler(
    ctx: Context<InitializeConfig>,
    params: InitializeConfigParams,
) -> Result<()> {
    let config = &mut ctx.accounts.config;
    config.governance = ctx.accounts.governance.key();
    config.oracle = params.oracle;
    config.slash_authority = params.slash_authority;
    config.bond_mint = params.bond_mint;
    config.bond_amount = params.bond_amount;
    config.score_threshold = params.score_threshold;
    config.bump = ctx.bumps.config;
    Ok(())
}

#[derive(Accounts)]
pub struct UpdateConfig<'info> {
    #[account(
        mut,
        seeds = [b"atlas_registry_config"],
        bump = config.bump,
        constraint = governance.key() == config.governance @ RegistryError::InvalidGovernance
    )]
    pub config: Account<'info, RegistryConfig>,
    pub governance: Signer<'info>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct UpdateConfigInput {
    pub oracle: Option<Pubkey>,
    pub slash_authority: Option<Pubkey>,
    pub bond_mint: Option<Pubkey>,
    pub bond_amount: Option<u64>,
    pub score_threshold: Option<u8>,
}

pub fn update_config_handler(ctx: Context<UpdateConfig>, input: UpdateConfigInput) -> Result<()> {
    let config = &mut ctx.accounts.config;
    if let Some(k) = input.oracle {
        require!(k != Pubkey::default(), RegistryError::InvalidConfig);
        config.oracle = k;
    }
    if let Some(k) = input.slash_authority {
        require!(k != Pubkey::default(), RegistryError::InvalidConfig);
        config.slash_authority = k;
    }
    if let Some(k) = input.bond_mint {
        require!(k != Pubkey::default(), RegistryError::InvalidConfig);
        config.bond_mint = k;
    }
    if let Some(v) = input.bond_amount {
        config.bond_amount = v;
    }
    if let Some(v) = input.score_threshold {
        require!(v <= 100, RegistryError::InvalidConfig);
        config.score_threshold = v;
    }
    Ok(())
}
