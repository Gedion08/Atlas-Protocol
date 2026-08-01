use crate::state::*;
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

/// Mirror of the `atlas_vault::state::Vault` account layout (fields up to
/// `total_value`, which is all the claims flow reads). Decoded from the raw
/// account data so `atlas-staking` does not need a crate dependency on
/// `atlas-vault` (which would be cyclic: vault → manager-registry → staking).
/// Keep in sync with `programs/vault/src/state.rs`.
#[derive(AnchorDeserialize, AnchorSerialize)]
pub struct VaultView {
    pub authority: Pubkey,
    pub manager: Pubkey,
    pub manager_profile: Pubkey,
    pub shares_mint: Pubkey,
    pub base_mint: Pubkey,
    pub bump: u8,
    pub status: u8,
    pub management_fee_bps: u16,
    pub performance_fee_bps: u16,
    pub insurance_premium_bps: u16,
    pub min_deposit: u64,
    pub total_value: u64,
}

/// Anchor account discriminator of `atlas_vault::state::Vault`
/// (`sha256("account:Vault")[..8]`), verified alongside the account owner so a
/// claim can only reference a genuine vault account of the configured program.
pub fn vault_discriminator() -> [u8; 8] {
    let hash = anchor_lang::solana_program::hash::hash(b"account:Vault");
    let bytes = hash.to_bytes();
    let mut out = [0u8; 8];
    out.copy_from_slice(&bytes[..8]);
    out
}

/// File an insurance claim (spec §6.4). One active claim per (claimant, vault);
/// must be filed within the claim window of the event timestamp.
///
/// The vault account must be owned by the configured vault program and carry the
/// vault account discriminator; the claimant must hold a positive share balance
/// of that vault (LP verification); and the claimed amount cannot exceed the
/// vault's total value (amount bound).
#[derive(Accounts)]
pub struct FileClaim<'info> {
    #[account(
        seeds = [b"atlas_staking_config"],
        bump = config.bump
    )]
    pub config: Account<'info, Config>,
    #[account(
        init,
        payer = claimant,
        space = Claim::SPACE,
        seeds = [b"claim", claimant.key().as_ref(), vault.key().as_ref()],
        bump
    )]
    pub claim: Account<'info, Claim>,
    #[account(
        constraint = vault.owner == &config.vault_program @ StakingError::InvalidVault
    )]
    pub vault: AccountInfo<'info>,
    /// Claimant's share balance in the vault; must be owned by the claimant and
    /// hold a positive balance (LP verification).
    #[account(
        constraint = claimant_shares.owner == claimant.key() @ StakingError::NotVaultLp
    )]
    pub claimant_shares: Box<Account<'info, TokenAccount>>,
    #[account(mut)]
    pub claimant: Signer<'info>,
    pub system_program: Program<'info, System>,
}

pub fn file_claim_handler(
    ctx: Context<FileClaim>,
    amount: u64,
    event_type: u8,
    evidence: [u8; 32],
    event_ts: i64,
) -> Result<()> {
    require!(amount > 0, StakingError::ZeroAmount);
    require!(event_type <= 5, StakingError::InvalidClaim);

    // LP verification: the vault account must be a genuine vault of the configured
    // vault program (owner + discriminator), and the claimant's shares must be in
    // that vault's share mint with a positive balance.
    let data = ctx.accounts.vault.try_borrow_data()?;
    require!(
        data.len() >= 8 + std::mem::size_of::<VaultView>(),
        StakingError::InvalidVault
    );
    require!(data[..8] == vault_discriminator(), StakingError::InvalidVault);
    let view = VaultView::deserialize(&mut &data[8..])?;
    drop(data);

    require!(
        ctx.accounts.claimant_shares.mint == view.shares_mint,
        StakingError::NotVaultLp
    );
    require!(
        ctx.accounts.claimant_shares.amount > 0,
        StakingError::NotVaultLp
    );
    // Amount bound: a single claim can never exceed the vault's total value.
    require!(amount <= view.total_value, StakingError::ClaimAmountTooLarge);

    let now = Clock::get()?.unix_timestamp;
    let config = &ctx.accounts.config;
    require!(
        event_ts <= now
            && now.saturating_sub(event_ts) <= config.claim_window_secs as i64,
        StakingError::ClaimWindowExpired
    );

    let claim = &mut ctx.accounts.claim;
    claim.claimant = ctx.accounts.claimant.key();
    claim.vault = ctx.accounts.vault.key();
    claim.amount = amount;
    claim.paid = 0;
    claim.event_type = event_type;
    claim.evidence = evidence;
    claim.event_ts = event_ts;
    claim.status = ClaimStatus::Pending;
    claim.decided_at = 0;
    claim.decided_by = Pubkey::default();
    claim.created_at = now;
    claim.bump = ctx.bumps.claim;
    Ok(())
}

/// Adjudicate a claim: approve or deny (spec §6.4). Only the claims committee.
#[derive(Accounts)]
pub struct DecideClaim<'info> {
    #[account(
        seeds = [b"atlas_staking_config"],
        bump = config.bump,
        constraint = committee.key() == config.claims_committee @ StakingError::InvalidCommittee
    )]
    pub config: Account<'info, Config>,
    #[account(
        mut,
        seeds = [b"claim", claim.claimant.as_ref(), claim.vault.as_ref()],
        bump = claim.bump
    )]
    pub claim: Account<'info, Claim>,
    pub committee: Signer<'info>,
}

pub fn decide_claim_handler(ctx: Context<DecideClaim>, approve: bool) -> Result<()> {
    let claim = &mut ctx.accounts.claim;
    require!(
        claim.status == ClaimStatus::Pending,
        StakingError::InvalidClaimState
    );

    claim.status = if approve {
        ClaimStatus::Approved
    } else {
        ClaimStatus::Denied
    };
    claim.decided_at = Clock::get()?.unix_timestamp;
    claim.decided_by = ctx.accounts.committee.key();
    Ok(())
}

/// Deposit stablecoin insurance premiums into the canonical premium reserve
/// (spec §6.2 source 1, §6.4 payout currency). Permissionless: any party may
/// fund the reserve with the configured premium mint; the reserve PDA is
/// program-controlled and is the only source of claim payouts.
#[derive(Accounts)]
pub struct DepositPremium<'info> {
    #[account(
        mut,
        seeds = [b"atlas_staking_config"],
        bump = config.bump
    )]
    pub config: Account<'info, Config>,
    #[account(
        init_if_needed,
        payer = depositor,
        token::mint = premium_mint,
        token::authority = config,
        seeds = [b"premium_reserve", config.key().as_ref()],
        bump
    )]
    pub premium_reserve: Box<Account<'info, TokenAccount>>,
    #[account(
        mut,
        token::mint = premium_mint,
        constraint = premium_mint.key() == config.premium_mint @ StakingError::InvalidConfig
    )]
    pub depositor_token: Box<Account<'info, TokenAccount>>,
    pub premium_mint: Box<Account<'info, Mint>>,
    #[account(mut)]
    pub depositor: Signer<'info>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
}

pub fn deposit_premium_handler(ctx: Context<DepositPremium>, amount: u64) -> Result<()> {
    require!(amount > 0, StakingError::ZeroAmount);
    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.depositor_token.to_account_info(),
                to: ctx.accounts.premium_reserve.to_account_info(),
                authority: ctx.accounts.depositor.to_account_info(),
            },
        ),
        amount,
    )?;
    Ok(())
}

/// Pay an approved claim from the stablecoin premium reserve, applying
/// co-insurance and the per-event aggregate cap (spec §6.3, §6.5). If the
/// reserve cannot fully cover the claim, the payout is pro-rata scaled and the
/// remainder is a priced shortfall. Payouts are denominated in the premium mint
/// (spec §6.4: "Payout | Stablecoins from the reserve escrow").
#[derive(Accounts)]
pub struct PayClaim<'info> {
    #[account(
        mut,
        seeds = [b"atlas_staking_config"],
        bump = config.bump
    )]
    pub config: Account<'info, Config>,
    #[account(
        mut,
        seeds = [b"claim", claim.claimant.as_ref(), claim.vault.as_ref()],
        bump = claim.bump
    )]
    pub claim: Account<'info, Claim>,
    #[account(
        mut,
        token::mint = premium_mint,
        token::authority = config,
        seeds = [b"premium_reserve", config.key().as_ref()],
        bump
    )]
    pub premium_reserve: Box<Account<'info, TokenAccount>>,
    #[account(
        mut,
        token::mint = premium_mint,
        constraint = premium_mint.key() == config.premium_mint @ StakingError::InvalidConfig
    )]
    pub claimant_token: Box<Account<'info, TokenAccount>>,
    pub premium_mint: Box<Account<'info, Mint>>,
    pub claimant: SystemAccount<'info>,
    pub token_program: Program<'info, Token>,
}

pub fn pay_claim_handler(ctx: Context<PayClaim>) -> Result<()> {
    let config = &ctx.accounts.config;
    let claim = &ctx.accounts.claim;
    require!(
        claim.status == ClaimStatus::Approved,
        StakingError::InvalidClaimState
    );
    require!(
        ctx.accounts.claimant.key() == claim.claimant,
        StakingError::Unauthorized
    );

    let reserve = ctx.accounts.premium_reserve.amount;
    require!(reserve > 0, StakingError::ReserveEmpty);

    // Co-insurance: the claimant bears `co_insurance_bps` of the loss.
    let after_deductible = (claim.amount as u128)
        .checked_mul((10_000 - config.co_insurance_bps as u32) as u128)
        .map(|v| v / 10_000)
        .ok_or(StakingError::MathOverflow)? as u64;
    // Per-event aggregate cap on the reserve.
    let capped = (reserve as u128)
        .checked_mul(config.max_claim_reserve_bps as u128)
        .map(|v| v / 10_000)
        .ok_or(StakingError::MathOverflow)? as u64;
    // Hard liquidity bound (pro-rata if the reserve is short).
    let payout = after_deductible.min(capped).min(reserve);

    let config_seed = [b"atlas_staking_config".as_slice(), &[config.bump]];
    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.premium_reserve.to_account_info(),
                to: ctx.accounts.claimant_token.to_account_info(),
                authority: ctx.accounts.config.to_account_info(),
            },
            &[&config_seed],
        ),
        payout,
    )?;

    let claim = &mut ctx.accounts.claim;
    claim.paid = payout;
    claim.status = ClaimStatus::Paid;
    claim.decided_at = Clock::get()?.unix_timestamp;
    Ok(())
}

/// Appeal a denied claim within the claim window (spec §4.9). Returns the claim to
/// Pending for fresh committee adjudication. Claimant only.
#[derive(Accounts)]
pub struct AppealClaim<'info> {
    #[account(
        seeds = [b"atlas_staking_config"],
        bump = config.bump
    )]
    pub config: Account<'info, Config>,
    #[account(
        mut,
        seeds = [b"claim", claim.claimant.as_ref(), claim.vault.as_ref()],
        bump = claim.bump,
        constraint = claimant.key() == claim.claimant @ StakingError::Unauthorized
    )]
    pub claim: Account<'info, Claim>,
    pub claimant: Signer<'info>,
}

pub fn appeal_claim_handler(ctx: Context<AppealClaim>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let claim = &mut ctx.accounts.claim;
    require!(
        claim.status == ClaimStatus::Denied,
        StakingError::InvalidClaimState
    );
    require!(
        now.saturating_sub(claim.decided_at) <= ctx.accounts.config.claim_window_secs as i64,
        StakingError::ClaimWindowExpired
    );

    claim.status = ClaimStatus::Pending;
    claim.decided_at = 0;
    claim.decided_by = Pubkey::default();
    Ok(())
}

/// Rotate the claims committee (self-governed; current committee signs).
#[derive(Accounts)]
pub struct SetClaimsCommittee<'info> {
    #[account(
        mut,
        seeds = [b"atlas_staking_config"],
        bump = config.bump,
        constraint = committee.key() == config.claims_committee @ StakingError::InvalidCommittee
    )]
    pub config: Account<'info, Config>,
    pub committee: Signer<'info>,
}

pub fn set_claims_committee_handler(
    ctx: Context<SetClaimsCommittee>,
    new_committee: Pubkey,
) -> Result<()> {
    require!(new_committee != Pubkey::default(), StakingError::InvalidClaim);
    ctx.accounts.config.claims_committee = new_committee;
    Ok(())
}
