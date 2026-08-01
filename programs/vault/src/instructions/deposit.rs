use crate::state::*;
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(
        seeds = [b"vault_config"],
        bump = config.bump
    )]
    pub config: Box<Account<'info, Config>>,
    #[account(
        mut,
        seeds = [b"atlas_vault", vault.authority.as_ref(), vault.base_mint.as_ref()],
        bump = vault.bump,
        constraint = vault.status == VaultStatus::Active @ VaultError::VaultNotActive
    )]
    pub vault: Box<Account<'info, Vault>>,
    /// Linked manager profile (owner check + active status, spec §3.4).
    #[account(
        constraint = manager_profile.key() == vault.manager_profile @ VaultError::InvalidManagerProfile
    )]
    pub manager_profile: Box<Account<'info, atlas_manager_registry::state::ManagerProfile>>,
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(
        mut,
        token::mint = vault.base_mint,
        token::authority = user
    )]
    pub user_token: Box<Account<'info, TokenAccount>>,
    #[account(
        mut,
        token::mint = vault.base_mint,
        token::authority = vault,
        seeds = [b"escrow", vault.key().as_ref(), vault.base_mint.as_ref()],
        bump
    )]
    pub vault_escrow: Box<Account<'info, TokenAccount>>,
    #[account(
        mut,
        mint::authority = vault,
        seeds = [b"shares", vault.key().as_ref()],
        bump
    )]
    pub shares_mint: Box<Account<'info, Mint>>,
    #[account(
        mut,
        token::mint = shares_mint,
        token::authority = user
    )]
    pub user_shares: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
}

pub fn deposit_handler(ctx: Context<Deposit>, amount: u64) -> Result<()> {
    require!(amount > 0, VaultError::ZeroAmount);
    require!(
        amount >= ctx.accounts.vault.min_deposit,
        VaultError::BelowMinDeposit
    );

    let config = &ctx.accounts.config;
    require!(
        ctx.accounts
            .manager_profile
            .to_account_info()
            .owner
            == &atlas_manager_registry::ID,
        VaultError::InvalidManagerProfile
    );
    require!(
        ctx.accounts.manager_profile.status
            == atlas_manager_registry::state::ManagerStatus::Active,
        VaultError::ManagerNotActive
    );

    let now = Clock::get()?.unix_timestamp;
    let vault = &mut ctx.accounts.vault;
    accrue_time_fees(vault, config, now)?;

    // Issue shares at current NAVPS (net of accrued fees). First deposit is at par.
    let navps = vault.share_price().unwrap_or(SHARE_PRICE_SCALE);
    let shares = (amount as u128)
        .checked_mul(SHARE_PRICE_SCALE as u128)
        .and_then(|v| v.checked_div(navps as u128))
        .ok_or(VaultError::MathOverflow)? as u64;
    if shares == 0 {
        return Err(VaultError::BelowMinDeposit.into());
    }

    let authority = vault.authority;
    let base_mint = vault.base_mint;
    let bump = vault.bump;
    let vault_info = vault.to_account_info();

    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.user_token.to_account_info(),
                to: ctx.accounts.vault_escrow.to_account_info(),
                authority: ctx.accounts.user.to_account_info(),
            },
        ),
        amount,
    )?;

    token::mint_to(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            anchor_spl::token::MintTo {
                mint: ctx.accounts.shares_mint.to_account_info(),
                to: ctx.accounts.user_shares.to_account_info(),
                authority: vault_info,
            },
            &[&[b"atlas_vault", authority.as_ref(), base_mint.as_ref(), &[bump]]],
        ),
        shares,
    )?;

    vault.total_value = vault.total_value.saturating_add(amount);
    vault.shares_outstanding = vault.shares_outstanding.saturating_add(shares);
    vault.last_accrual_ts = now;
    Ok(())
}
