use anchor_lang::prelude::*;

pub use crate::error::*;

/// Default manager bond required at registration, in bond-mint base units.
pub const DEFAULT_BOND_AMOUNT: u64 = 100 * 1_000_000;
/// Score at or below which a manager is auto-suspended (spec §3.3).
pub const DEFAULT_SCORE_THRESHOLD: u8 = 40;

/// Protocol-level registry configuration. Single PDA per registry deployment.
/// Governs the oracle (score submitter), required manager bond, and slashing.
#[account]
pub struct RegistryConfig {
    pub governance: Pubkey,
    pub oracle: Pubkey,
    /// Authority allowed to slash manager bonds (routes to staking insurance escrow).
    pub slash_authority: Pubkey,
    pub bond_mint: Pubkey,
    /// Bond required to hold an active manager profile (spec §3.3).
    pub bond_amount: u64,
    /// Auto-suspend threshold for composite scores.
    pub score_threshold: u8,
    pub bump: u8,
}

impl RegistryConfig {
    pub const SPACE: usize = 8 + 32 + 32 + 32 + 32 + 8 + 1 + 1;
}

#[repr(u8)]
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum ManagerStatus {
    Inactive = 0,
    Active = 1,
    Suspended = 2,
    Banned = 3,
}

#[account]
pub struct ManagerProfile {
    pub owner: Pubkey,
    pub name: String,
    pub status: ManagerStatus,
    pub bond_required: u64,
    pub score: ManagerScore,
    pub tvl: u64,
    pub created_at: i64,
    pub updated_at: i64,
    pub bump: u8,
}

impl ManagerProfile {
    pub const MAX_NAME_LEN: usize = 64;
    pub const SPACE: usize = 8
        + 32
        + 4
        + Self::MAX_NAME_LEN
        + 1
        + 8
        + 8 * 8
        + 8
        + 8
        + 8
        + 1;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Default, Debug)]
pub struct ManagerScore {
    pub fee_generation: u8,
    pub risk: u8,
    pub drawdown: u8,
    pub capital_retention: u8,
    pub consistency: u8,
    pub tvl_growth: u8,
    pub governance_participation: u8,
    pub total: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Default, Debug)]
pub struct ScoreInput {
    pub fee_generation: u8,
    pub risk: u8,
    pub drawdown: u8,
    pub capital_retention: u8,
    pub consistency: u8,
    pub tvl_growth: u8,
    pub governance_participation: u8,
}

impl From<ScoreInput> for ManagerScore {
    fn from(i: ScoreInput) -> Self {
        let total = (i.fee_generation as u16 * 30
            + i.risk as u16 * 20
            + i.drawdown as u16 * 15
            + i.capital_retention as u16 * 10
            + i.consistency as u16 * 10
            + i.tvl_growth as u16 * 10
            + i.governance_participation as u16 * 5)
            / 100;
        Self {
            fee_generation: i.fee_generation,
            risk: i.risk,
            drawdown: i.drawdown,
            capital_retention: i.capital_retention,
            consistency: i.consistency,
            tvl_growth: i.tvl_growth,
            governance_participation: i.governance_participation,
            total: total as u8,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn perfect_inputs_yield_perfect_score() {
        let input = ScoreInput {
            fee_generation: 100,
            risk: 100,
            drawdown: 100,
            capital_retention: 100,
            consistency: 100,
            tvl_growth: 100,
            governance_participation: 100,
        };
        let score = ManagerScore::from(input);
        assert_eq!(score.total, 100);
    }

    #[test]
    fn weights_are_applied_correctly() {
        let input = ScoreInput {
            fee_generation: 100,
            risk: 0,
            drawdown: 0,
            capital_retention: 0,
            consistency: 0,
            tvl_growth: 0,
            governance_participation: 0,
        };
        let score = ManagerScore::from(input);
        assert_eq!(score.total, 30);
    }

    #[test]
    fn components_are_preserved() {
        let input = ScoreInput {
            fee_generation: 42,
            risk: 7,
            drawdown: 9,
            capital_retention: 11,
            consistency: 13,
            tvl_growth: 17,
            governance_participation: 3,
        };
        let score = ManagerScore::from(input);
        assert_eq!(score.fee_generation, 42);
        assert_eq!(score.governance_participation, 3);
    }
}
