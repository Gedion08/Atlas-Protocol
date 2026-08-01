use crate::state::*;
use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};

/// Slash a manager's staking bond via CPI into `atlas_staking::slash` and
/// escalate status by offense count (spec §4.7): bond confiscation → `Suspended`
/// on the first offense → `Banned` with registry revocation on the second.
/// Funds route to the staking insurance escrow. Requires the staking program's
/// `slash_authority` to be configured to this registry's `slash_authority`.
#[derive(Accounts)]
pub struct SlashBond<'info> {
    #[account(
        seeds = [b"atlas_registry_config"],
        bump = config.bump,
        constraint = slash_authority.key() == config.slash_authority @ RegistryError::Unauthorized
    )]
    pub config: Box<Account<'info, RegistryConfig>>,
    #[account(
        mut,
        seeds = [b"atlas_staking_config"],
        bump = staking_config.bump
    )]
    pub staking_config: Box<Account<'info, atlas_staking::state::Config>>,
    #[account(
        mut,
        seeds = [b"manager", profile.owner.as_ref()],
        bump = profile.bump,
        constraint = profile.status != ManagerStatus::Inactive @ RegistryError::NotActive
    )]
    pub profile: Box<Account<'info, ManagerProfile>>,
    #[account(
        mut,
        seeds = [b"bond", bond.owner.as_ref()],
        bump = bond.bump
    )]
    pub bond: Box<Account<'info, atlas_staking::state::BondAccount>>,
    #[account(
        mut,
        token::mint = bond_mint,
        token::authority = bond,
        seeds = [b"escrow", bond.key().as_ref()],
        bump
    )]
    pub bond_escrow: Box<Account<'info, TokenAccount>>,
    #[account(
        init_if_needed,
        payer = slash_authority,
        token::mint = bond_mint,
        token::authority = staking_config,
        seeds = [b"insurance_escrow", staking_config.key().as_ref()],
        bump
    )]
    pub insurance_escrow: Box<Account<'info, TokenAccount>>,
    pub bond_mint: Box<Account<'info, Mint>>,
    #[account(mut)]
    pub slash_authority: Signer<'info>,
    pub staking_program: Program<'info, atlas_staking::program::AtlasStaking>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
}

pub fn slash_bond_handler(ctx: Context<SlashBond>, amount: u64) -> Result<()> {
    require!(
        ctx.accounts.slash_authority.key() == ctx.accounts.config.slash_authority,
        RegistryError::Unauthorized
    );
    require!(amount > 0, RegistryError::Unauthorized);

    let cpi_accounts = atlas_staking::cpi::accounts::SlashBond {
        config: ctx.accounts.staking_config.to_account_info(),
        bond: ctx.accounts.bond.to_account_info(),
        escrow: ctx.accounts.bond_escrow.to_account_info(),
        bond_mint: ctx.accounts.bond_mint.to_account_info(),
        insurance_escrow: ctx.accounts.insurance_escrow.to_account_info(),
        slash_authority: ctx.accounts.slash_authority.to_account_info(),
        system_program: ctx.accounts.system_program.to_account_info(),
        token_program: ctx.accounts.token_program.to_account_info(),
    };
    atlas_staking::cpi::slash(
        CpiContext::new(
            ctx.accounts.staking_program.to_account_info(),
            cpi_accounts,
        ),
        amount,
    )?;

    // The CPI mutates the bond account in the staking program's domain; reload to
    // observe the updated `slash_count` before escalating the manager status.
    ctx.accounts.bond.reload()?;
    let profile = &mut ctx.accounts.profile;
    match ctx.accounts.bond.slash_count {
        // Second (or later) offense: registry revocation.
        2.. => profile.status = ManagerStatus::Banned,
        // First offense: suspension (spec §4.7 cascading consequences).
        _ => profile.status = ManagerStatus::Suspended,
    }
    profile.updated_at = Clock::get()?.unix_timestamp;
    Ok(())
}
