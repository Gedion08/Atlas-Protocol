use crate::state::*;
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

#[derive(Accounts)]
pub struct CreateLock<'info> {
    #[account(
        mut,
        seeds = [b"atlas_governance"],
        bump = config.bump
    )]
    pub config: Account<'info, GovernanceConfig>,
    #[account(
        init_if_needed,
        payer = owner,
        token::mint = atlas_mint,
        token::authority = config,
        seeds = [b"vault", config.key().as_ref()],
        bump
    )]
    pub vault: Box<Account<'info, TokenAccount>>,
    #[account(
        init,
        payer = owner,
        space = VeLock::SPACE,
        seeds = [b"ve_lock", owner.key().as_ref()],
        bump
    )]
    pub lock: Account<'info, VeLock>,
    #[account(mut)]
    pub owner_token: Box<Account<'info, TokenAccount>>,
    pub atlas_mint: Box<Account<'info, Mint>>,
    #[account(mut)]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
}

pub fn create_lock_handler(ctx: Context<CreateLock>, amount: u64, duration_secs: i64) -> Result<()> {
    require!(amount > 0, GovernanceError::ZeroAmount);
    require!(
        (MIN_LOCK_SECS..=MAX_LOCK_SECS).contains(&duration_secs),
        GovernanceError::InvalidLockDuration
    );

    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.owner_token.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
                authority: ctx.accounts.owner.to_account_info(),
            },
        ),
        amount,
    )?;

    let now = Clock::get()?.unix_timestamp;
    let weight = weight_from(amount, duration_secs);

    let lock = &mut ctx.accounts.lock;
    lock.owner = ctx.accounts.owner.key();
    lock.delegate = ctx.accounts.owner.key();
    lock.amount = amount;
    lock.weight = weight;
    lock.unlock_at = now + duration_secs;
    lock.bump = ctx.bumps.lock;

    let config = &mut ctx.accounts.config;
    config.total_ve_weight = config
        .total_ve_weight
        .checked_add(weight)
        .ok_or(GovernanceError::MathOverflow)?;
    Ok(())
}

#[derive(Accounts)]
pub struct ExtendLock<'info> {
    #[account(
        mut,
        seeds = [b"atlas_governance"],
        bump = config.bump
    )]
    pub config: Account<'info, GovernanceConfig>,
    #[account(
        mut,
        seeds = [b"vault", config.key().as_ref()],
        bump
    )]
    pub vault: Box<Account<'info, TokenAccount>>,
    #[account(
        mut,
        seeds = [b"ve_lock", owner.key().as_ref()],
        bump = lock.bump,
        constraint = lock.owner == owner.key() @ GovernanceError::Unauthorized
    )]
    pub lock: Account<'info, VeLock>,
    #[account(mut)]
    pub owner_token: Box<Account<'info, TokenAccount>>,
    #[account(mut)]
    pub owner: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

pub fn extend_lock_handler(
    ctx: Context<ExtendLock>,
    add_amount: u64,
    new_duration_secs: i64,
) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let lock = &mut ctx.accounts.lock;
    require!(
        lock.unlock_at > now,
        GovernanceError::LockExpired
    );
    require!(
        (MIN_LOCK_SECS..=MAX_LOCK_SECS).contains(&new_duration_secs),
        GovernanceError::InvalidLockDuration
    );

    if add_amount > 0 {
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.owner_token.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                    authority: ctx.accounts.owner.to_account_info(),
                },
            ),
            add_amount,
        )?;
    }

    let old_weight = lock.weight;
    lock.amount = lock
        .amount
        .checked_add(add_amount)
        .ok_or(GovernanceError::MathOverflow)?;
    lock.weight = weight_from(lock.amount, new_duration_secs);
    lock.unlock_at = now + new_duration_secs;

    let config = &mut ctx.accounts.config;
    config.total_ve_weight = config
        .total_ve_weight
        .checked_add(lock.weight)
        .and_then(|v| v.checked_sub(old_weight))
        .ok_or(GovernanceError::MathOverflow)?;
    Ok(())
}

#[derive(Accounts)]
pub struct WithdrawLock<'info> {
    #[account(
        mut,
        seeds = [b"atlas_governance"],
        bump = config.bump
    )]
    pub config: Account<'info, GovernanceConfig>,
    #[account(
        mut,
        seeds = [b"vault", config.key().as_ref()],
        bump
    )]
    pub vault: Box<Account<'info, TokenAccount>>,
    #[account(
        mut,
        seeds = [b"ve_lock", owner.key().as_ref()],
        bump = lock.bump,
        constraint = lock.owner == owner.key() @ GovernanceError::Unauthorized
    )]
    pub lock: Account<'info, VeLock>,
    #[account(mut)]
    pub owner_token: Box<Account<'info, TokenAccount>>,
    #[account(mut)]
    pub owner: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

pub fn withdraw_lock_handler(ctx: Context<WithdrawLock>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let lock = &mut ctx.accounts.lock;
    require!(
        now >= lock.unlock_at,
        GovernanceError::LockActive
    );
    require!(lock.amount > 0, GovernanceError::ZeroAmount);

    let config_seed = [b"atlas_governance".as_slice(), &[ctx.accounts.config.bump]];
    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.vault.to_account_info(),
                to: ctx.accounts.owner_token.to_account_info(),
                authority: ctx.accounts.config.to_account_info(),
            },
            &[&config_seed],
        ),
        lock.amount,
    )?;

    let config = &mut ctx.accounts.config;
    config.total_ve_weight = config
        .total_ve_weight
        .checked_sub(lock.weight)
        .ok_or(GovernanceError::MathOverflow)?;

    lock.amount = 0;
    lock.weight = 0;
    lock.swept = false;
    Ok(())
}

/// Permissionless sweep of an expired lock (spec §12.2, quorum-inflation fix).
///
/// Expired locks carry no voting weight but keep their weight in
/// `total_ve_weight` until withdrawn, which inflates the quorum floor for every
/// new proposal. Anyone may call this for any expired lock: the lock's weight is
/// zeroed and removed from `total_ve_weight`, and the lock is marked `swept` so
/// the contribution is never removed twice. The owner's tokens remain in the
/// vault and are released by the normal `withdraw_lock` path.
#[derive(Accounts)]
pub struct SweepExpiredLock<'info> {
    #[account(
        mut,
        seeds = [b"atlas_governance"],
        bump = config.bump
    )]
    pub config: Account<'info, GovernanceConfig>,
    #[account(
        mut,
        seeds = [b"ve_lock", lock.owner.as_ref()],
        bump = lock.bump
    )]
    pub lock: Account<'info, VeLock>,
    /// Permissionless: any account may sweep an expired lock.
    pub sweeper: Signer<'info>,
}

pub fn sweep_expired_lock_handler(ctx: Context<SweepExpiredLock>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let lock = &mut ctx.accounts.lock;
    require!(now >= lock.unlock_at, GovernanceError::LockActive);
    require!(!lock.swept, GovernanceError::LockSwept);
    require!(lock.weight > 0, GovernanceError::ZeroAmount);

    let weight = lock.weight;
    lock.weight = 0;
    lock.swept = true;

    let config = &mut ctx.accounts.config;
    config.total_ve_weight = config
        .total_ve_weight
        .checked_sub(weight)
        .ok_or(GovernanceError::MathOverflow)?;
    Ok(())
}
