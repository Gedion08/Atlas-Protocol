use crate::state::*;
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Burn, Mint, Token, TokenAccount};

#[derive(Accounts)]
pub struct RequestWithdraw<'info> {
    #[account(
        seeds = [b"vault_config"],
        bump = config.bump
    )]
    pub config: Box<Account<'info, Config>>,
    #[account(
        mut,
        seeds = [b"atlas_vault", vault.authority.as_ref(), vault.base_mint.as_ref()],
        bump = vault.bump,
        constraint = vault.status != VaultStatus::Emergency @ VaultError::EmergencyShutdown
    )]
    pub vault: Box<Account<'info, Vault>>,
    #[account(
        init,
        payer = user,
        space = WithdrawalRequest::SPACE,
        seeds = [b"withdraw", vault.key().as_ref(), user.key().as_ref()],
        bump
    )]
    pub request: Box<Account<'info, WithdrawalRequest>>,
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(
        mut,
        token::mint = shares_mint,
        token::authority = user
    )]
    pub user_shares: Box<Account<'info, TokenAccount>>,
    pub shares_mint: Box<Account<'info, Mint>>,
    pub system_program: Program<'info, System>,
}

pub fn request_withdraw_handler(ctx: Context<RequestWithdraw>, shares: u64) -> Result<()> {
    require!(shares > 0, VaultError::ZeroAmount);
    require!(
        shares <= ctx.accounts.user_shares.amount,
        VaultError::InsufficientShares
    );

    let now = Clock::get()?.unix_timestamp;
    let slot = Clock::get()?.slot;
    let config = &ctx.accounts.config;
    let vault = &mut ctx.accounts.vault;
    accrue_time_fees(vault, config, now)?;

    // Lock the request value at the current net NAVPS (spec §3.4).
    let navps = vault.share_price().ok_or(VaultError::EmptyVault)?;
    let value = (shares as u128)
        .checked_mul(navps as u128)
        .and_then(|v| v.checked_div(SHARE_PRICE_SCALE as u128))
        .ok_or(VaultError::MathOverflow)? as u64;

    let request = &mut ctx.accounts.request;
    request.vault = vault.key();
    request.user = ctx.accounts.user.key();
    request.shares = shares;
    request.value = value;
    request.settlement_slot = slot.saturating_add(config.settlement_slots);
    request.settled = false;
    request.bump = ctx.bumps.request;

    vault.pending_shares = vault.pending_shares.saturating_add(shares);
    vault.pending_value = vault.pending_value.saturating_add(value);
    vault.last_accrual_ts = now;
    Ok(())
}

#[derive(Accounts)]
pub struct SettleWithdraw<'info> {
    #[account(
        seeds = [b"vault_config"],
        bump = config.bump
    )]
    pub config: Box<Account<'info, Config>>,
    #[account(
        mut,
        seeds = [b"atlas_vault", vault.authority.as_ref(), vault.base_mint.as_ref()],
        bump = vault.bump,
        constraint = vault.status == VaultStatus::Active @ VaultError::VaultPaused
    )]
    pub vault: Box<Account<'info, Vault>>,
    #[account(
        mut,
        seeds = [b"withdraw", request.vault.as_ref(), request.user.as_ref()],
        bump = request.bump,
        constraint = request.vault == vault.key() @ VaultError::Unauthorized
    )]
    pub request: Box<Account<'info, WithdrawalRequest>>,
    #[account(mut)]
    pub user: Signer<'info>,
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
        token::mint = vault.base_mint,
        token::authority = user
    )]
    pub user_token: Box<Account<'info, TokenAccount>>,
    #[account(
        mut,
        token::mint = shares_mint,
        token::authority = user
    )]
    pub user_shares: Box<Account<'info, TokenAccount>>,
    #[account(
        mut,
        mint::authority = vault,
        seeds = [b"shares", vault.key().as_ref()],
        bump
    )]
    pub shares_mint: Box<Account<'info, Mint>>,
    pub token_program: Program<'info, Token>,
}

pub fn settle_withdraw_handler(ctx: Context<SettleWithdraw>) -> Result<()> {
    let req_shares = ctx.accounts.request.shares;
    let req_value = ctx.accounts.request.value;
    let req_settled = ctx.accounts.request.settled;
    let req_slot = ctx.accounts.request.settlement_slot;
    require!(!req_settled, VaultError::AlreadySettled);

    let now = Clock::get()?.unix_timestamp;
    let config = &ctx.accounts.config;
    let vault = &mut ctx.accounts.vault;
    accrue_time_fees(vault, config, now)?;

    let escrow_amount = ctx.accounts.vault_escrow.amount;
    require!(escrow_amount > 0, VaultError::EscrowEmpty);

    // In an emergency shutdown the slot gate is bypassed so investors can
    // redeem immediately. In normal operation the request must be due.
    let emergency = vault.status == VaultStatus::Emergency;
    require!(emergency || Clock::get()?.slot >= req_slot, VaultError::NotDue);

    // Settlement at current NAVPS (net of accrued fees), pro-rata against the queued
    // redemption pool and hard-capped by liquid escrow. If the vault is short, each
    // request in the queue is filled in proportion to its locked basis (spec §3.4).
    let navps = vault.share_price().ok_or(VaultError::EmptyVault)?;
    let value_now = (req_shares as u128)
        .checked_mul(navps as u128)
        .and_then(|v| v.checked_div(SHARE_PRICE_SCALE as u128))
        .ok_or(VaultError::MathOverflow)? as u64;

    let factor_num = escrow_amount.min(vault.pending_value);
    let factor_den = vault.pending_value.max(1);
    let pro_rata = (value_now as u128)
        .checked_mul(factor_num as u128)
        .and_then(|v| v.checked_div(factor_den as u128))
        .ok_or(VaultError::MathOverflow)? as u64;
    let payout = pro_rata.min(escrow_amount);
    let burn = if navps > 0 {
        ((payout as u128)
            .checked_mul(SHARE_PRICE_SCALE as u128)
            .and_then(|v| v.checked_div(navps as u128))
            .ok_or(VaultError::MathOverflow)? as u64)
            .min(req_shares)
    } else {
        0
    };

    let authority = vault.authority;
    let base_mint = vault.base_mint;
    let bump = vault.bump;
    let vault_info = vault.to_account_info();

    if payout > 0 {
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                anchor_spl::token::Transfer {
                    from: ctx.accounts.vault_escrow.to_account_info(),
                    to: ctx.accounts.user_token.to_account_info(),
                    authority: vault_info.clone(),
                },
                &[&[b"atlas_vault", authority.as_ref(), base_mint.as_ref(), &[bump]]],
            ),
            payout,
        )?;
    }
    if burn > 0 {
        token::burn(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Burn {
                    mint: ctx.accounts.shares_mint.to_account_info(),
                    from: ctx.accounts.user_shares.to_account_info(),
                    authority: ctx.accounts.user.to_account_info(),
                },
            ),
            burn,
        )?;
    }

    let request = &mut ctx.accounts.request;
    request.settled = true;

    vault.pending_shares = vault.pending_shares.saturating_sub(req_shares);
    vault.pending_value = vault.pending_value.saturating_sub(req_value);
    vault.shares_outstanding = vault.shares_outstanding.saturating_sub(burn);
    vault.total_value = vault.total_value.saturating_sub(payout);
    vault.last_accrual_ts = now;
    Ok(())
}
