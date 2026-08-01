use anchor_lang::prelude::*;

pub use crate::error::*;

pub const UNBOND_COOLDOWN_SLOTS: u64 = 86_400;

/// Claim filing window: claims must be filed within 30 days of the event (spec §6.4).
pub const DEFAULT_CLAIM_WINDOW_SECS: u64 = 30 * 86_400;
/// Co-insurance applied to covered claims: claimant bears 10% of the loss (spec §6.3).
pub const DEFAULT_CO_INSURANCE_BPS: u16 = 1_000;
/// Per-event aggregate cap: 15% of the reserve (spec §6.5).
pub const DEFAULT_MAX_CLAIM_RESERVE_BPS: u16 = 1_500;

#[account]
pub struct Config {
    pub slash_authority: Pubkey,
    pub cooldown_slots: u64,
    /// Committee that adjudicates insurance claims (spec §6.4).
    pub claims_committee: Pubkey,
    /// Program that owns vault accounts. Claims are only accepted against real
    /// vault accounts owned by this program (spec §6.1 coverage boundary).
    pub vault_program: Pubkey,
    /// Mint of the stablecoin premium reserve that backs claims (spec §6.2, §6.4).
    pub premium_mint: Pubkey,
    pub claim_window_secs: u64,
    /// Co-insurance rate in bps (claimant share of a covered loss).
    pub co_insurance_bps: u16,
    /// Per-event payout cap as bps of the reserve.
    pub max_claim_reserve_bps: u16,
    pub bump: u8,
}

impl Config {
    pub const SPACE: usize = 8 + 32 + 8 + 32 + 32 + 32 + 8 + 2 + 2 + 1;
}

#[account]
pub struct BondAccount {
    pub owner: Pubkey,
    pub escrow: Pubkey,
    pub amount: u64,
    pub unbond_at: u64,
    pub slash_count: u8,
    pub bump: u8,
}

impl BondAccount {
    pub const SPACE: usize = 8 + 32 + 32 + 8 + 8 + 1 + 1;
}

#[repr(u8)]
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum ClaimStatus {
    Pending = 0,
    Approved = 1,
    Denied = 2,
    Paid = 3,
}

/// Insurance claim against the protocol reserve (spec §6.4). Adjudicated by the
/// claims committee; payouts are subject to co-insurance and per-event caps.
#[account]
pub struct Claim {
    pub claimant: Pubkey,
    pub vault: Pubkey,
    pub amount: u64,
    /// Actual payout once settled (after co-insurance and caps).
    pub paid: u64,
    pub event_type: u8,
    pub evidence: [u8; 32],
    pub event_ts: i64,
    pub status: ClaimStatus,
    pub decided_at: i64,
    pub decided_by: Pubkey,
    pub created_at: i64,
    pub bump: u8,
}

impl Claim {
    pub const SPACE: usize = 8 + 32 + 32 + 8 + 8 + 1 + 32 + 8 + 1 + 8 + 32 + 8 + 1;
}
