use crate::state::*;
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

/// Settle all accrued fees:
/// - management fee: manager share paid immediately, protocol share into the waterfall;
/// - performance fee: 50% paid immediately to the manager, 50% deferred into a rolling
///   `FeeEscrow` (spec §4.5) subject to clawback;
/// - waterfall (spec §2.4): insurance reserve top-up first (flow ①), then remainder
///   split 25% insurance / 60% treasury / 15% veATLAS (flows ③④⑤);
/// - accrued insurance premium paid to the insurance vault.
#[derive(Accounts)]
pub struct SettleFees<'info> {
    #[account(
        seeds = [b"vault_config"],
        bump = config.bump
    )]
    pub config: Box<Account<'info, Config>>,
    #[account(
        mut,
        seeds = [b"atlas_vault", vault.authority.as_ref(), vault.base_mint.as_ref()],
        bump = vault.bump
    )]
    pub vault: Box<Account<'info, Vault>>,
    #[account(
        mut,
        token::mint = vault.base_mint,
        token::authority = vault,
        seeds = [b"escrow", vault.key().as_ref(), vault.base_mint.as_ref()],
        bump
    )]
    pub vault_escrow: Box<Account<'info, TokenAccount>>,
    pub base_mint: Box<Account<'info, Mint>>,
    #[account(mut, token::mint = vault.base_mint)]
    pub manager_token: Box<Account<'info, TokenAccount>>,
    #[account(mut, token::mint = vault.base_mint)]
    pub insurance_token: Box<Account<'info, TokenAccount>>,
    #[account(mut, token::mint = vault.base_mint)]
    pub treasury_token: Box<Account<'info, TokenAccount>>,
    #[account(mut, token::mint = vault.base_mint)]
    pub veatlas_token: Box<Account<'info, TokenAccount>>,
    #[account(
        init_if_needed,
        payer = keeper,
        space = FeeEscrow::SPACE,
        seeds = [b"fee_escrow", vault.key().as_ref(), vault.manager.as_ref()],
        bump
    )]
    pub fee_escrow: Box<Account<'info, FeeEscrow>>,
    #[account(
        init_if_needed,
        payer = keeper,
        token::mint = base_mint,
        token::authority = fee_escrow,
        seeds = [b"fee_escrow_ata", vault.key().as_ref(), vault.manager.as_ref()],
        bump
    )]
    pub fee_escrow_token: Box<Account<'info, TokenAccount>>,
    #[account(mut)]
    pub keeper: Signer<'info>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
}

pub fn settle_fees_handler(ctx: Context<SettleFees>) -> Result<()> {
    let config = &ctx.accounts.config;
    require!(
        ctx.accounts.vault.status != VaultStatus::Emergency,
        VaultError::EmergencyShutdown
    );

    // Validate fee recipients.
    require!(
        ctx.accounts.manager_token.owner == ctx.accounts.vault.manager,
        VaultError::InvalidRecipient
    );
    require!(
        ctx.accounts.insurance_token.owner == config.insurance,
        VaultError::InvalidRecipient
    );
    require!(
        ctx.accounts.treasury_token.owner == config.treasury,
        VaultError::InvalidRecipient
    );
    require!(
        ctx.accounts.veatlas_token.owner == config.veatlas,
        VaultError::InvalidRecipient
    );

    let token_program = ctx.accounts.token_program.to_account_info();
    let vault_info = ctx.accounts.vault.to_account_info();
    let vault_escrow_info = ctx.accounts.vault_escrow.to_account_info();
    let manager_info = ctx.accounts.manager_token.to_account_info();
    let insurance_info = ctx.accounts.insurance_token.to_account_info();
    let treasury_info = ctx.accounts.treasury_token.to_account_info();
    let veatlas_info = ctx.accounts.veatlas_token.to_account_info();
    let fee_escrow_token_info = ctx.accounts.fee_escrow_token.to_account_info();
    let authority_bytes = ctx.accounts.vault.authority.to_bytes();
    let base_mint_bytes = ctx.accounts.vault.base_mint.to_bytes();
    let vault_bump = ctx.accounts.vault.bump;
    let vault_seed = [
        b"atlas_vault".as_slice(),
        authority_bytes.as_slice(),
        base_mint_bytes.as_slice(),
        &[vault_bump],
    ];

    macro_rules! vault_transfer {
        ($to:expr, $amount:expr) => {
            if $amount > 0 {
                token::transfer(
                    CpiContext::new_with_signer(
                        token_program.clone(),
                        Transfer {
                            from: vault_escrow_info.clone(),
                            to: $to.to_account_info(),
                            authority: vault_info.clone(),
                        },
                        &[&vault_seed],
                    ),
                    $amount,
                )?;
            }
        };
    }

    let now = Clock::get()?.unix_timestamp;
    let vault = &mut ctx.accounts.vault;
    accrue_time_fees(vault, config, now)?;

    let insurance_balance = ctx.accounts.insurance_token.amount;
    let escrow_balance = ctx.accounts.vault_escrow.amount;

    let mgmt_manager = vault.accrued_mgmt_manager;
    let mgmt_protocol = vault.accrued_mgmt_protocol;
    let perf_manager = vault.accrued_perf_manager;
    let perf_protocol = vault.accrued_perf_protocol;
    let insurance_fee = vault.accrued_insurance;

    // Performance fee deferral: 50% immediately, 50% into rolling escrow.
    let perf_current = perf_manager / 2;
    let perf_deferred = perf_manager - perf_current;
    let protocol_pool = mgmt_protocol.saturating_add(perf_protocol);

    let total_out = mgmt_manager
        .saturating_add(protocol_pool)
        .saturating_add(perf_manager)
        .saturating_add(insurance_fee);
    require!(
        total_out <= escrow_balance && total_out <= vault.accrued_total(),
        VaultError::InsufficientLiquidity
    );

    // 1) Management fee, manager share.
    vault_transfer!(manager_info, mgmt_manager);

    // 2) Performance fee: immediate + deferred.
    vault_transfer!(manager_info, perf_current);
    if perf_deferred > 0 {
        vault_transfer!(fee_escrow_token_info, perf_deferred);
        let escrow = &mut ctx.accounts.fee_escrow;
        escrow.vault = vault.key();
        escrow.manager = vault.manager;
        escrow.amount = escrow.amount.saturating_add(perf_deferred);
        escrow.release_at = now.saturating_add(config.deferral_secs as i64);
        escrow.bump = ctx.bumps.fee_escrow;
    }

    // 3) Waterfall on protocol net revenue (spec §2.4).
    if protocol_pool > 0 {
        // Flow ①: top up the insurance reserve to target first.
        let target = config.reserve_target;
        let topup = protocol_pool.min(target.saturating_sub(insurance_balance));
        let remainder = protocol_pool.saturating_sub(topup);
        let insurance_share = (remainder as u128)
            .saturating_mul(config.insurance_share_bps as u128)
            .div_ceil(10_000) as u64;
        let treasury_share = (remainder as u128)
            .saturating_mul(config.treasury_share_bps as u128)
            .div_ceil(10_000) as u64;
        let veatlas_share = remainder
            .saturating_sub(insurance_share)
            .saturating_sub(treasury_share);

        vault_transfer!(insurance_info, topup.saturating_add(insurance_share));
        vault_transfer!(treasury_info, treasury_share);
        vault_transfer!(veatlas_info, veatlas_share);
    }

    // 4) Accrued insurance premium to the insurance vault.
    vault_transfer!(insurance_info, insurance_fee);

    // Zero accruals; total value decreases by the full settled amount (the deferred
    // portion is now held in the program-controlled fee escrow, outside vault NAV).
    vault.accrued_mgmt_manager = 0;
    vault.accrued_mgmt_protocol = 0;
    vault.accrued_perf_manager = 0;
    vault.accrued_perf_protocol = 0;
    vault.accrued_insurance = 0;
    vault.total_value = vault.total_value.saturating_sub(total_out);
    vault.last_accrual_ts = now;
    Ok(())
}

/// Release a matured fee escrow to its manager (spec §4.5).
#[derive(Accounts)]
pub struct ReleaseFeeEscrow<'info> {
    #[account(
        mut,
        seeds = [b"fee_escrow", fee_escrow.vault.as_ref(), fee_escrow.manager.as_ref()],
        bump = fee_escrow.bump
    )]
    pub fee_escrow: Box<Account<'info, FeeEscrow>>,
    #[account(
        mut,
        token::mint = base_mint,
        token::authority = fee_escrow,
        seeds = [b"fee_escrow_ata", fee_escrow.vault.as_ref(), fee_escrow.manager.as_ref()],
        bump
    )]
    pub fee_escrow_token: Box<Account<'info, TokenAccount>>,
    #[account(mut, token::mint = base_mint)]
    pub manager_token: Box<Account<'info, TokenAccount>>,
    pub base_mint: Box<Account<'info, Mint>>,
    pub manager: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

pub fn release_fee_escrow_handler(ctx: Context<ReleaseFeeEscrow>) -> Result<()> {
    let escrow = &ctx.accounts.fee_escrow;
    require!(
        ctx.accounts.manager.key() == escrow.manager,
        VaultError::Unauthorized
    );
    require!(
        ctx.accounts.manager_token.owner == escrow.manager,
        VaultError::InvalidRecipient
    );
    require!(
        Clock::get()?.unix_timestamp >= escrow.release_at,
        VaultError::EscrowNotMature
    );
    let amount = escrow.amount;
    require!(amount > 0, VaultError::EscrowEmpty);

    let escrow_seed = [
        b"fee_escrow".as_slice(),
        escrow.vault.as_ref(),
        escrow.manager.as_ref(),
        &[escrow.bump],
    ];
    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.fee_escrow_token.to_account_info(),
                to: ctx.accounts.manager_token.to_account_info(),
                authority: ctx.accounts.fee_escrow.to_account_info(),
            },
            &[&escrow_seed],
        ),
        amount,
    )?;

    ctx.accounts.fee_escrow.amount = 0;
    Ok(())
}

/// Governance clawback of a deferred performance-fee escrow on manager misconduct.
/// Funds return to the vault's investor escrow (increasing net NAV).
#[derive(Accounts)]
pub struct ClawbackFeeEscrow<'info> {
    #[account(
        seeds = [b"vault_config"],
        bump = config.bump,
        constraint = governance.key() == config.governance @ VaultError::InvalidGovernance
    )]
    pub config: Box<Account<'info, Config>>,
    #[account(mut)]
    pub governance: Signer<'info>,
    #[account(
        mut,
        seeds = [b"atlas_vault", vault.authority.as_ref(), vault.base_mint.as_ref()],
        bump = vault.bump
    )]
    pub vault: Box<Account<'info, Vault>>,
    #[account(
        mut,
        seeds = [b"fee_escrow", fee_escrow.vault.as_ref(), fee_escrow.manager.as_ref()],
        bump = fee_escrow.bump
    )]
    pub fee_escrow: Box<Account<'info, FeeEscrow>>,
    #[account(
        mut,
        token::mint = base_mint,
        token::authority = fee_escrow,
        seeds = [b"fee_escrow_ata", fee_escrow.vault.as_ref(), fee_escrow.manager.as_ref()],
        bump
    )]
    pub fee_escrow_token: Box<Account<'info, TokenAccount>>,
    #[account(
        mut,
        token::mint = base_mint,
        token::authority = vault,
        seeds = [b"escrow", vault.key().as_ref(), base_mint.key().as_ref()],
        bump
    )]
    pub vault_escrow: Box<Account<'info, TokenAccount>>,
    pub base_mint: Box<Account<'info, Mint>>,
    pub token_program: Program<'info, Token>,
}

pub fn clawback_fee_escrow_handler(ctx: Context<ClawbackFeeEscrow>) -> Result<()> {
    let escrow = &ctx.accounts.fee_escrow;
    require!(escrow.amount > 0, VaultError::EscrowEmpty);

    let amount = escrow.amount;
    let escrow_seed = [
        b"fee_escrow".as_slice(),
        escrow.vault.as_ref(),
        escrow.manager.as_ref(),
        &[escrow.bump],
    ];
    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.fee_escrow_token.to_account_info(),
                to: ctx.accounts.vault_escrow.to_account_info(),
                authority: ctx.accounts.fee_escrow.to_account_info(),
            },
            &[&escrow_seed],
        ),
        amount,
    )?;

    let vault = &mut ctx.accounts.vault;
    vault.total_value = vault.total_value.saturating_add(amount);
    ctx.accounts.fee_escrow.amount = 0;
    Ok(())
}
