use crate::state::*;
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = deployer,
        space = TreasuryConfig::SPACE,
        seeds = [b"atlas_treasury"],
        bump
    )]
    pub config: Account<'info, TreasuryConfig>,
    #[account(
        init_if_needed,
        payer = deployer,
        token::mint = revenue_mint,
        token::authority = config,
        seeds = [b"revenue_escrow", config.key().as_ref()],
        bump
    )]
    pub revenue_escrow: Box<Account<'info, TokenAccount>>,
    pub revenue_mint: Box<Account<'info, Mint>>,
    pub atlas_mint: Box<Account<'info, Mint>>,
    #[account(mut)]
    pub deployer: Signer<'info>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
}

pub fn initialize_handler(
    ctx: Context<Initialize>,
    intrinsic_price_bps: u64,
    oracles: Vec<Pubkey>,
    min_oracle_signatures: u8,
) -> Result<()> {
    require!(intrinsic_price_bps > 0, TreasuryError::InvalidConfig);
    validate_oracle_set(&oracles, min_oracle_signatures)?;
    let config = &mut ctx.accounts.config;
    config.governance = ctx.accounts.deployer.key();
    config.buyback_authority = ctx.accounts.deployer.key();
    config.revenue_mint = ctx.accounts.revenue_mint.key();
    config.atlas_mint = ctx.accounts.atlas_mint.key();
    config.oracles = [Pubkey::default(); MAX_ORACLES];
    for (i, key) in oracles.iter().enumerate() {
        config.oracles[i] = *key;
    }
    config.min_oracle_signatures = min_oracle_signatures;
    config.intrinsic_price_bps = intrinsic_price_bps;
    config.premium_cap_bps = DEFAULT_PREMIUM_CAP_BPS;
    config.period_length_secs = DEFAULT_PERIOD_LENGTH_SECS;
    config.period_cap_bps = DEFAULT_PERIOD_CAP_BPS;
    config.withdraw_cap_bps = DEFAULT_WITHDRAW_CAP_BPS;
    config.period_start = Clock::get()?.unix_timestamp;
    config.period_spent = 0;
    config.withdraw_spent = 0;
    config.bump = ctx.bumps.config;
    Ok(())
}

#[derive(Accounts)]
pub struct DepositRevenue<'info> {
    #[account(
        mut,
        seeds = [b"atlas_treasury"],
        bump = config.bump
    )]
    pub config: Account<'info, TreasuryConfig>,
    #[account(
        mut,
        seeds = [b"revenue_escrow", config.key().as_ref()],
        bump
    )]
    pub revenue_escrow: Box<Account<'info, TokenAccount>>,
    #[account(mut)]
    pub depositor_token: Box<Account<'info, TokenAccount>>,
    #[account(mut)]
    pub depositor: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

pub fn deposit_revenue_handler(ctx: Context<DepositRevenue>, amount: u64) -> Result<()> {
    require!(amount > 0, TreasuryError::ZeroAmount);
    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.depositor_token.to_account_info(),
                to: ctx.accounts.revenue_escrow.to_account_info(),
                authority: ctx.accounts.depositor.to_account_info(),
            },
        ),
        amount,
    )?;
    Ok(())
}

#[derive(Accounts)]
pub struct Buyback<'info> {
    #[account(
        mut,
        seeds = [b"atlas_treasury"],
        bump = config.bump,
        constraint = buyback_authority.key() == config.buyback_authority @ TreasuryError::Unauthorized
    )]
    pub config: Account<'info, TreasuryConfig>,
    #[account(
        mut,
        seeds = [b"revenue_escrow", config.key().as_ref()],
        bump
    )]
    pub revenue_escrow: Box<Account<'info, TokenAccount>>,
    /// Canonical buyback pool (spec §5.4): revenue spent on buybacks lands in a
    /// program-controlled PDA rather than an arbitrary caller-chosen recipient.
    /// The authority of the account is the treasury config itself.
    #[account(
        init_if_needed,
        payer = buyback_authority,
        token::mint = revenue_mint,
        token::authority = config,
        seeds = [b"buyback_escrow", config.key().as_ref()],
        bump
    )]
    pub buyback_escrow: Box<Account<'info, TokenAccount>>,
    pub revenue_mint: Box<Account<'info, Mint>>,
    #[account(mut)]
    pub buyback_authority: Signer<'info>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
}

pub fn buyback_handler(ctx: Context<Buyback>, amount: u64, prices: Vec<u64>) -> Result<()> {
    require!(amount > 0, TreasuryError::ZeroAmount);

    // Oracle-attested price (spec §5.4): every oracle in `remaining_accounts`
    // must be an authorized, distinct signer and must attest exactly one price;
    // the market price is the median of the attested reports.
    let signers = ctx.remaining_accounts;
    let config = &ctx.accounts.config;
    require!(
        prices.len() == signers.len()
            && (prices.len() as u8) >= config.min_oracle_signatures
            && prices.len() <= MAX_ORACLES,
        TreasuryError::OracleSignatureCount
    );
    let mut seen: Vec<Pubkey> = Vec::with_capacity(signers.len());
    for info in signers {
        let key = info.key();
        require!(info.is_signer, TreasuryError::OracleSignatureCount);
        require!(config.is_oracle(&key), TreasuryError::Unauthorized);
        require!(!seen.contains(&key), TreasuryError::DuplicateOracleSigner);
        seen.push(key);
    }
    let market_price_bps = median_of(&prices);

    let now = Clock::get()?.unix_timestamp;
    require!(
        (market_price_bps as u128) <= config.max_premium_price(),
        TreasuryError::PriceTooHigh
    );

    let reset_period = !config.in_period(now);
    let escrow = ctx.accounts.revenue_escrow.amount;
    let cap = config.max_buyback(escrow);
    require!(amount <= cap, TreasuryError::PeriodCapExceeded);
    let spent = if reset_period {
        0u64
    } else {
        config.period_spent
    };
    require!(
        (spent as u128)
            .checked_add(amount as u128)
            .ok_or(TreasuryError::MathOverflow)?
            <= cap as u128,
        TreasuryError::PeriodCapExceeded
    );

    let config_seed = [b"atlas_treasury".as_slice(), &[config.bump]];
    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.revenue_escrow.to_account_info(),
                to: ctx.accounts.buyback_escrow.to_account_info(),
                authority: ctx.accounts.config.to_account_info(),
            },
            &[&config_seed],
        ),
        amount,
    )?;

    let config = &mut ctx.accounts.config;
    if reset_period {
        config.period_start = now;
        config.period_spent = 0;
        config.withdraw_spent = 0;
    }
    config.period_spent = config
        .period_spent
        .checked_add(amount)
        .ok_or(TreasuryError::MathOverflow)?;
    Ok(())
}

#[derive(Accounts)]
pub struct WithdrawRevenue<'info> {
    #[account(
        mut,
        seeds = [b"atlas_treasury"],
        bump = config.bump,
        constraint = governance.key() == config.governance @ TreasuryError::Unauthorized
    )]
    pub config: Account<'info, TreasuryConfig>,
    #[account(
        mut,
        seeds = [b"revenue_escrow", config.key().as_ref()],
        bump
    )]
    pub revenue_escrow: Box<Account<'info, TokenAccount>>,
    #[account(mut)]
    pub recipient: Box<Account<'info, TokenAccount>>,
    #[account(mut)]
    pub governance: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

pub fn withdraw_revenue_handler(ctx: Context<WithdrawRevenue>, amount: u64) -> Result<()> {
    require!(amount > 0, TreasuryError::ZeroAmount);
    let now = Clock::get()?.unix_timestamp;
    let reset_period = !ctx.accounts.config.in_period(now);
    let config = &ctx.accounts.config;
    let cap = (ctx.accounts.revenue_escrow.amount as u128)
        * config.withdraw_cap_bps as u128
        / 10_000;
    // The withdrawal cap is per-period, not per-call: repeated withdrawals within a
    // period cannot drain the escrow beyond the cap (spec §5.5 spending ladders).
    let spent = if reset_period {
        0u64
    } else {
        config.withdraw_spent
    };
    require!(
        (spent as u128)
            .checked_add(amount as u128)
            .ok_or(TreasuryError::MathOverflow)?
            <= cap,
        TreasuryError::WithdrawCapExceeded
    );

    let config_seed = [b"atlas_treasury".as_slice(), &[ctx.accounts.config.bump]];
    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.revenue_escrow.to_account_info(),
                to: ctx.accounts.recipient.to_account_info(),
                authority: ctx.accounts.config.to_account_info(),
            },
            &[&config_seed],
        ),
        amount,
    )?;

    let config = &mut ctx.accounts.config;
    if reset_period {
        config.period_start = now;
        config.period_spent = 0;
        config.withdraw_spent = 0;
    }
    config.withdraw_spent = config
        .withdraw_spent
        .checked_add(amount)
        .ok_or(TreasuryError::MathOverflow)?;
    Ok(())
}

/// Permissionless keeper instruction (spec §12.2 automation): advances the
/// buyback/withdraw accounting period once it has elapsed, resetting the
/// per-period caps. Spam is harmless (resets are idempotent and cheap).
#[derive(Accounts)]
pub struct RolloverPeriod<'info> {
    #[account(
        mut,
        seeds = [b"atlas_treasury"],
        bump = config.bump
    )]
    pub config: Account<'info, TreasuryConfig>,
    pub keeper: Signer<'info>,
}

pub fn rollover_period_handler(ctx: Context<RolloverPeriod>) -> Result<()> {
    let config = &mut ctx.accounts.config;
    let now = Clock::get()?.unix_timestamp;
    require!(
        config.period_elapsed(now),
        TreasuryError::PeriodNotElapsed
    );
    config.period_start = now;
    config.period_spent = 0;
    config.withdraw_spent = 0;
    Ok(())
}

#[derive(Accounts)]
pub struct UpdateConfig<'info> {    #[account(
        mut,
        seeds = [b"atlas_treasury"],
        bump = config.bump,
        constraint = governance.key() == config.governance @ TreasuryError::Unauthorized
    )]
    pub config: Account<'info, TreasuryConfig>,
    #[account(mut)]
    pub governance: Signer<'info>,
}

#[allow(clippy::too_many_arguments)]
pub fn update_config_handler(
    ctx: Context<UpdateConfig>,
    buyback_authority: Option<Pubkey>,
    oracles: Option<Vec<Pubkey>>,
    min_oracle_signatures: Option<u8>,
    intrinsic_price_bps: Option<u64>,
    premium_cap_bps: Option<u16>,
    period_length_secs: Option<i64>,
    period_cap_bps: Option<u16>,
    withdraw_cap_bps: Option<u16>,
) -> Result<()> {
    let config = &mut ctx.accounts.config;
    if let Some(v) = buyback_authority {
        require!(v != Pubkey::default(), TreasuryError::InvalidConfig);
        config.buyback_authority = v;
    }
    if let Some(set) = oracles {
        let min = min_oracle_signatures.unwrap_or(config.min_oracle_signatures);
        validate_oracle_set(&set, min)?;
        config.oracles = [Pubkey::default(); MAX_ORACLES];
        for (i, key) in set.iter().enumerate() {
            config.oracles[i] = *key;
        }
        config.min_oracle_signatures = min;
    } else if let Some(min) = min_oracle_signatures {
        let current: Vec<Pubkey> = config
            .oracles
            .iter()
            .take(config.active_oracle_count())
            .copied()
            .collect();
        validate_oracle_set(&current, min)?;
        config.min_oracle_signatures = min;
    }
    if let Some(v) = intrinsic_price_bps {
        require!(v > 0, TreasuryError::InvalidConfig);
        config.intrinsic_price_bps = v;
    }
    if let Some(v) = premium_cap_bps {
        config.premium_cap_bps = v;
    }
    if let Some(v) = period_length_secs {
        require!(v > 0, TreasuryError::InvalidConfig);
        config.period_length_secs = v;
    }
    if let Some(v) = period_cap_bps {
        config.period_cap_bps = v;
    }
    if let Some(v) = withdraw_cap_bps {
        config.withdraw_cap_bps = v;
    }
    Ok(())
}
