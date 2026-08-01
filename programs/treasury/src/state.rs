use anchor_lang::prelude::*;

pub use crate::error::*;

pub const DEFAULT_PERIOD_LENGTH_SECS: i64 = 30 * 86_400;
pub const DEFAULT_PERIOD_CAP_BPS: u16 = 1000;
pub const DEFAULT_PREMIUM_CAP_BPS: u16 = 1000;
pub const DEFAULT_WITHDRAW_CAP_BPS: u16 = 500;
/// Maximum number of price oracles in the M-of-N attestation set.
pub const MAX_ORACLES: usize = 5;
/// Required oracle attestations per buyback price (median of ≥3, spec §5.4).
pub const DEFAULT_MIN_ORACLE_SIGNATURES: u8 = 3;

#[account]
pub struct TreasuryConfig {
    pub governance: Pubkey,
    pub buyback_authority: Pubkey,
    pub revenue_mint: Pubkey,
    pub atlas_mint: Pubkey,
    /// M-of-N price oracle set: at least `min_oracle_signatures` distinct keys
    /// attest the buyback price; the median of their reports is applied (spec §5.4).
    pub oracles: [Pubkey; MAX_ORACLES],
    pub min_oracle_signatures: u8,
    pub intrinsic_price_bps: u64,
    pub premium_cap_bps: u16,
    pub period_length_secs: i64,
    pub period_cap_bps: u16,
    pub withdraw_cap_bps: u16,
    pub period_start: i64,
    pub period_spent: u64,
    /// Revenue withdrawn by governance within the current period (period-capped,
    /// mirrors `period_spent` for buybacks) so repeated calls cannot drain the escrow.
    pub withdraw_spent: u64,
    pub bump: u8,
}

impl TreasuryConfig {
    pub const SPACE: usize = 8
        + 32
        + 32
        + 32
        + 32
        + 32 * MAX_ORACLES
        + 1
        + 8
        + 2
        + 8
        + 2
        + 2
        + 8
        + 8
        + 8
        + 1;

    pub fn in_period(&self, now: i64) -> bool {
        now >= self.period_start && now < self.period_start + self.period_length_secs
    }

    /// True once the current accounting period has fully elapsed and a keeper
    /// may roll it over (spec §12.2 automation).
    pub fn period_elapsed(&self, now: i64) -> bool {
        now >= self.period_start.saturating_add(self.period_length_secs)
    }

    pub fn max_buyback(&self, escrow_amount: u64) -> u64 {
        ((escrow_amount as u128) * self.period_cap_bps as u128 / 10_000) as u64
    }

    pub fn max_premium_price(&self) -> u128 {
        (self.intrinsic_price_bps as u128)
            * (10_000 + self.premium_cap_bps as u128)
            / 10_000
    }

    /// Number of assigned (non-default) oracle keys.
    pub fn active_oracle_count(&self) -> usize {
        self.oracles.iter().filter(|k| **k != Pubkey::default()).count()
    }

    /// True if `key` is a member of the M-of-N oracle set.
    pub fn is_oracle(&self, key: &Pubkey) -> bool {
        self.oracles.iter().any(|k| k == key)
    }
}

/// Median of a sorted-copy of `values` (upper median for even-length inputs).
pub fn median_of(values: &[u64]) -> u64 {
    let mut sorted = values.to_vec();
    sorted.sort_unstable();
    sorted[sorted.len() / 2]
}

/// Validates an M-of-N oracle set: a distinct, non-default set of `MAX_ORACLES`
/// keys at most, with at least `min_oracle_signatures` (floor of 3).
pub fn validate_oracle_set(oracles: &[Pubkey], min_oracle_signatures: u8) -> Result<()> {
    require!(
        min_oracle_signatures as usize >= 3 && (min_oracle_signatures as usize) <= MAX_ORACLES,
        TreasuryError::TooFewOracleSigners
    );
    require!(
        oracles.len() >= min_oracle_signatures as usize && oracles.len() <= MAX_ORACLES,
        TreasuryError::OracleSetTooLarge
    );
    let mut seen: Vec<Pubkey> = Vec::with_capacity(oracles.len());
    for key in oracles {
        require!(*key != Pubkey::default(), TreasuryError::InvalidConfig);
        require!(!seen.contains(key), TreasuryError::DuplicateOracleSigner);
        seen.push(*key);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn median_of_is_robust_to_outlier_reports() {
        assert_eq!(median_of(&[100, 200, 300]), 200);
        assert_eq!(median_of(&[10, 20, 30, 40]), 30);
        assert_eq!(median_of(&[900, 1_000, 1_100, 99_000]), 1_100);
    }

    #[test]
    fn period_boundaries_roll_over_when_elapsed() {
        let mut config = TreasuryConfig {
            governance: Pubkey::default(),
            buyback_authority: Pubkey::default(),
            revenue_mint: Pubkey::default(),
            atlas_mint: Pubkey::default(),
            oracles: [Pubkey::default(); MAX_ORACLES],
            min_oracle_signatures: 3,
            intrinsic_price_bps: 10_000,
            premium_cap_bps: 1_000,
            period_length_secs: 7 * 24 * 3600,
            period_cap_bps: 5_00,
            withdraw_cap_bps: 5_00,
            period_start: 1_000,
            period_spent: 42,
            withdraw_spent: 7,
            bump: 0,
        };
        assert!(config.in_period(1_000));
        assert!(config.in_period(1_000 + 7 * 24 * 3600 - 1));
        assert!(!config.in_period(1_000 + 7 * 24 * 3600));
        assert!(!config.period_elapsed(1_000 + 7 * 24 * 3600 - 1));
        assert!(config.period_elapsed(1_000 + 7 * 24 * 3600));

        config.period_start = 1_000 + 7 * 24 * 3600;
        config.period_spent = 0;
        config.withdraw_spent = 0;
        assert!(config.in_period(1_000 + 7 * 24 * 3600));
    }

    #[test]
    fn oracle_set_validation_enforces_m_of_n() {
        let keys: Vec<Pubkey> = (0..6).map(|_| Pubkey::new_unique()).collect();
        assert!(validate_oracle_set(&keys[..3], 3).is_ok());
        assert!(validate_oracle_set(&keys[..3], 4).is_err());
        assert!(validate_oracle_set(&keys, 3).is_err());
        let mut dup = keys[..3].to_vec();
        dup.push(keys[0]);
        assert!(validate_oracle_set(&dup, 3).is_err());
        assert!(validate_oracle_set(&[], 3).is_err());
    }

    #[test]
    fn max_premium_price_scales_with_cap() {
        let mut config = TreasuryConfig {
            governance: Pubkey::default(),
            buyback_authority: Pubkey::default(),
            revenue_mint: Pubkey::default(),
            atlas_mint: Pubkey::default(),
            oracles: [Pubkey::default(); MAX_ORACLES],
            min_oracle_signatures: 3,
            intrinsic_price_bps: 1_000,
            premium_cap_bps: DEFAULT_PREMIUM_CAP_BPS,
            period_length_secs: DEFAULT_PERIOD_LENGTH_SECS,
            period_cap_bps: DEFAULT_PERIOD_CAP_BPS,
            withdraw_cap_bps: DEFAULT_WITHDRAW_CAP_BPS,
            period_start: 0,
            period_spent: 0,
            withdraw_spent: 0,
            bump: 0,
        };
        // 10% premium cap over an intrinsic price of 1000 bps.
        assert_eq!(config.max_premium_price(), 1_100);
    }
}
