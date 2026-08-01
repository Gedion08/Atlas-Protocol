use anchor_lang::prelude::*;

pub use crate::error::*;

pub const MIN_LOCK_SECS: i64 = 604_800;
pub const MAX_LOCK_SECS: i64 = 126_144_000;
pub const YEAR_SECS: i64 = 31_556_952;
pub const THREE_YEAR_SECS: i64 = 3 * YEAR_SECS;
pub const VOTING_DURATION_SECS: i64 = 7 * 86_400;
pub const MAX_TITLE_LEN: usize = 64;
pub const MAX_IX_DATA_LEN: usize = 512;
pub const DEFAULT_FEE_DISCOUNT_BPS: u16 = 0;

#[derive(
    AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, Default,
)]
#[repr(u8)]
pub enum ProposalClass {
    #[default]
    Parametric = 0,
    Fiscal = 1,
    ProtocolCritical = 2,
    Constitutional = 3,
}

impl ProposalClass {
    pub fn quorum_bps(self) -> u16 {
        match self {
            ProposalClass::Parametric => 500,
            ProposalClass::Fiscal => 1000,
            ProposalClass::ProtocolCritical => 1500,
            ProposalClass::Constitutional => 1500,
        }
    }

    pub fn passage_percent(self) -> u16 {
        match self {
            ProposalClass::Parametric | ProposalClass::Fiscal => 50,
            ProposalClass::ProtocolCritical => 60,
            ProposalClass::Constitutional => 66,
        }
    }

    pub fn timelock_secs(self) -> i64 {
        match self {
            ProposalClass::Parametric => 2 * 86_400,
            ProposalClass::Fiscal => 3 * 86_400,
            ProposalClass::ProtocolCritical => 7 * 86_400,
            ProposalClass::Constitutional => 30 * 86_400,
        }
    }
}

#[derive(
    AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, Default,
)]
#[repr(u8)]
pub enum ProposalStatus {
    #[default]
    Active = 0,
    Succeeded = 1,
    Defeated = 2,
    Expired = 3,
    Executed = 4,
}

#[account]
pub struct GovernanceConfig {
    pub governance: Pubkey,
    pub atlas_mint: Pubkey,
    pub total_ve_weight: u128,
    pub proposal_counter: u64,
    pub bump: u8,
}

impl GovernanceConfig {
    pub const SPACE: usize = 8 + 32 + 32 + 16 + 8 + 1;
}

#[account]
pub struct VeLock {
    pub owner: Pubkey,
    pub delegate: Pubkey,
    pub amount: u64,
    pub weight: u128,
    pub unlock_at: i64,
    /// True once `sweep_expired_lock` removed the expired lock's weight from
    /// `total_ve_weight`. Guards against double-sweeping and against the owner
    /// withdrawing an already-swept lock and subtracting its weight twice.
    pub swept: bool,
    pub bump: u8,
}

impl VeLock {
    pub const SPACE: usize = 8 + 32 + 32 + 8 + 16 + 8 + 1 + 1;
}

#[account]
pub struct Proposal {
    pub id: u64,
    pub proposer: Pubkey,
    pub class: ProposalClass,
    pub title: String,
    pub target_program: Pubkey,
    pub instruction_data: Vec<u8>,
    pub quorum_weight: u128,
    pub for_votes: u128,
    pub against_votes: u128,
    pub start_voting_at: i64,
    pub end_voting_at: i64,
    pub execution_at: i64,
    pub status: ProposalStatus,
    pub bump: u8,
}

impl Proposal {
    pub const SPACE: usize = 8
        + 8
        + 32
        + 1
        + 4
        + MAX_TITLE_LEN
        + 32
        + 4
        + MAX_IX_DATA_LEN
        + 16
        + 16
        + 16
        + 8
        + 8
        + 8
        + 1
        + 1;
}

#[account]
pub struct Vote {
    pub voter: Pubkey,
    pub proposal: Pubkey,
    pub lock: Pubkey,
    pub weight: u128,
    pub in_favor: bool,
    pub bump: u8,
}

impl Vote {
    pub const SPACE: usize = 8 + 32 + 32 + 32 + 16 + 1 + 1;
}

pub fn duration_multiplier_bps(duration_secs: i64) -> u16 {
    if duration_secs <= 0 {
        return 0;
    }
    if duration_secs < YEAR_SECS {
        let bps = 2500 + (7500 * duration_secs) / YEAR_SECS;
        return bps.clamp(2500, 10000) as u16;
    }
    if duration_secs >= MAX_LOCK_SECS {
        return 25000;
    }
    let extra = (15000 * (duration_secs - YEAR_SECS)) / THREE_YEAR_SECS;
    (10000 + extra).min(25000) as u16
}

pub fn weight_from(amount: u64, duration_secs: i64) -> u128 {
    let mult = duration_multiplier_bps(duration_secs) as u128;
    (amount as u128) * mult / 10_000
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn multiplier_is_2500_bps_at_zero_duration() {
        assert_eq!(duration_multiplier_bps(0), 0);
        assert_eq!(duration_multiplier_bps(1), 2500);
    }

    #[test]
    fn multiplier_reaches_10000_at_one_year() {
        assert_eq!(duration_multiplier_bps(YEAR_SECS), 10000);
    }

    #[test]
    fn multiplier_scales_linearly_to_25000_at_four_years() {
        assert_eq!(duration_multiplier_bps(MAX_LOCK_SECS), 25000);
        let mid = YEAR_SECS + (THREE_YEAR_SECS / 2);
        assert_eq!(duration_multiplier_bps(mid), 17500);
    }

    #[test]
    fn weight_is_amount_scaled_by_multiplier() {
        assert_eq!(weight_from(1_000_000, YEAR_SECS), 1_000_000);
        assert_eq!(weight_from(1_000_000, MAX_LOCK_SECS), 2_500_000);
        assert_eq!(weight_from(1_000_000, MIN_LOCK_SECS), 264_300);
    }

    #[test]
    fn class_parameters_match_spec() {
        assert_eq!(ProposalClass::Parametric.quorum_bps(), 500);
        assert_eq!(ProposalClass::Fiscal.quorum_bps(), 1000);
        assert_eq!(ProposalClass::ProtocolCritical.quorum_bps(), 1500);
        assert_eq!(ProposalClass::Constitutional.quorum_bps(), 1500);
        assert_eq!(ProposalClass::Constitutional.passage_percent(), 66);
        assert_eq!(ProposalClass::Parametric.timelock_secs(), 2 * 86_400);
        assert_eq!(ProposalClass::ProtocolCritical.timelock_secs(), 7 * 86_400);
    }

    #[test]
    fn treasury_cap_math_is_exact() {
        let amount = 1_000_000u64;
        let bps = 1500u16;
        assert_eq!((amount as u128) * bps as u128 / 10_000, 150_000);
    }
}
