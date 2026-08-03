use crate::state::*;
use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};

/// Register an LP manager. A staking bond of `config.bond_amount` is required: the
/// registry CPIs `atlas_staking::bond` to lock the manager's ATLAS bond tokens in the
/// staking escrow (spec §3.3). Only managers with an active bond can hold a profile.
#[derive(Accounts)]
pub struct Register<'info> {
    #[account(
        seeds = [b"atlas_registry_config"],
        bump = config.bump
    )]
    pub config: Box<Account<'info, RegistryConfig>>,
    #[account(
        init,
        payer = owner,
        space = ManagerProfile::SPACE,
        seeds = [b"manager", owner.key().as_ref()],
        bump
    )]
    pub profile: Box<Account<'info, ManagerProfile>>,
    #[account(
        init_if_needed,
        payer = owner,
        space = atlas_staking::state::BondAccount::SPACE,
        seeds = [b"bond", owner.key().as_ref()],
        bump
    )]
    pub bond: Box<Account<'info, atlas_staking::state::BondAccount>>,
    #[account(
        init_if_needed,
        payer = owner,
        token::mint = bond_mint,
        token::authority = bond,
        seeds = [b"escrow", bond.key().as_ref()],
        bump
    )]
    pub bond_escrow: Box<Account<'info, TokenAccount>>,
    pub bond_mint: Box<Account<'info, Mint>>,
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(
        mut,
        token::mint = bond_mint,
        token::authority = owner
    )]
    pub owner_token: Box<Account<'info, TokenAccount>>,
    pub staking_program: Program<'info, atlas_staking::program::AtlasStaking>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
}

pub fn register_handler(ctx: Context<Register>, name: String) -> Result<()> {
    require!(
        name.len() <= ManagerProfile::MAX_NAME_LEN,
        RegistryError::NameTooLong
    );

    // Lock the manager bond via CPI into the staking program.
    let bond_amount = ctx.accounts.config.bond_amount;
    require!(bond_amount > 0, RegistryError::InvalidConfig);
    let cpi_accounts = atlas_staking::cpi::accounts::BondTokens {
        bond: ctx.accounts.bond.to_account_info(),
        escrow: ctx.accounts.bond_escrow.to_account_info(),
        bond_mint: ctx.accounts.bond_mint.to_account_info(),
        owner: ctx.accounts.owner.to_account_info(),
        owner_token: ctx.accounts.owner_token.to_account_info(),
        system_program: ctx.accounts.system_program.to_account_info(),
        token_program: ctx.accounts.token_program.to_account_info(),
    };
    atlas_staking::cpi::bond(CpiContext::new(
        ctx.accounts.staking_program.to_account_info(),
        cpi_accounts,
    ), bond_amount)?;

    let clock = Clock::get()?;
    let profile = &mut ctx.accounts.profile;
    profile.owner = ctx.accounts.owner.key();
    profile.name = name;
    profile.status = ManagerStatus::Active;
    profile.bond_required = bond_amount;
    profile.score = ManagerScore::default();
    profile.tvl = 0;
    profile.created_at = clock.unix_timestamp;
    profile.updated_at = clock.unix_timestamp;
    profile.bump = ctx.bumps.profile;
    Ok(())
}
