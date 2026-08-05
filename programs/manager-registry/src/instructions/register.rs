use crate::state::*;
use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, TokenAccount};

/// Register an LP manager. A staking bond of `config.bond_amount` is required: the
/// manager must first lock ATLAS bond tokens via `atlas_staking::bond`, which creates
/// the bond + escrow accounts at staking-derived PDAs. `register` verifies the
/// pre-existing bond against the staking program's derivation and does not CPI
/// (spec §3.3). Only managers with an active bond can hold a profile.
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
    /// Pre-existing bond account created by `atlas_staking::bond` at the
    /// staking-derived PDA `["bond", owner]`.
    pub bond: Box<Account<'info, atlas_staking::state::BondAccount>>,
    #[account(
        token::mint = bond_mint,
        token::authority = bond
    )]
    pub bond_escrow: Box<Account<'info, TokenAccount>>,
    pub bond_mint: Box<Account<'info, Mint>>,
    #[account(mut)]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
}

pub fn register_handler(ctx: Context<Register>, name: String) -> Result<()> {
    require!(
        name.len() <= ManagerProfile::MAX_NAME_LEN,
        RegistryError::NameTooLong
    );

    // The bond must live at the staking-derived PDA and belong to this manager.
    let owner = ctx.accounts.owner.key();
    let (expected_bond, _) =
        Pubkey::find_program_address(&[b"bond", owner.as_ref()], &atlas_staking::ID);
    require!(
        ctx.accounts.bond.key() == expected_bond,
        RegistryError::BondInsufficient
    );
    let (expected_escrow, _) = Pubkey::find_program_address(
        &[b"escrow", ctx.accounts.bond.key().as_ref()],
        &atlas_staking::ID,
    );
    require!(
        ctx.accounts.bond_escrow.key() == expected_escrow,
        RegistryError::BondInsufficient
    );
    require!(
        ctx.accounts.bond.owner == owner,
        RegistryError::BondInsufficient
    );
    require!(
        ctx.accounts.bond.escrow == ctx.accounts.bond_escrow.key(),
        RegistryError::BondInsufficient
    );

    let bond_amount = ctx.accounts.config.bond_amount;
    require!(bond_amount > 0, RegistryError::InvalidConfig);
    require!(
        ctx.accounts.bond.amount >= bond_amount,
        RegistryError::BondBelowRequired
    );

    let clock = Clock::get()?;
    let profile = &mut ctx.accounts.profile;
    profile.owner = owner;
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
