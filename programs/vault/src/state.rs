use anchor_lang::prelude::*;

pub use crate::error::*;

/// Scaling factor for share prices and high-water marks (1e9).
pub const SHARE_PRICE_SCALE: u64 = 1_000_000_000;

/// Seconds in one year (365.25 days), used for annualized fee accrual.
pub const SECS_PER_YEAR: u64 = 31_557_600;

/// Default management fee cap in bps (150 bps/yr, spec §10.1 F1 upper band).
pub const DEFAULT_MGMT_FEE_CAP_BPS: u16 = 1_500;
/// Default performance fee cap in bps (20%, spec §10.1 F2 upper band).
pub const DEFAULT_PERF_FEE_CAP_BPS: u16 = 2_000;
/// Default insurance premium cap in bps (30 bps/yr, spec §6.3 upper band).
pub const DEFAULT_PREMIUM_CAP_BPS: u16 = 300;
/// Protocol take of management fee (25%, spec §2.2 R1).
pub const DEFAULT_PROTOCOL_MGMT_SHARE_BPS: u16 = 2_500;
/// Protocol take of performance fee (20%, spec §2.2 R2).
pub const DEFAULT_PROTOCOL_PERF_SHARE_BPS: u16 = 2_000;
/// Waterfall: insurance net revenue (25% of remainder, spec §2.4 flow ④).
pub const DEFAULT_INSURANCE_SHARE_BPS: u16 = 2_500;
/// Waterfall: treasury net revenue (60% of remainder, spec §2.4 flow ③).
pub const DEFAULT_TREASURY_SHARE_BPS: u16 = 6_000;
/// Waterfall: veATLAS revenue share (15% of remainder, spec §2.4 flow ⑤).
pub const DEFAULT_VEATLAS_SHARE_BPS: u16 = 1_500;
/// Manager co-pay co-insurance stake (10 bps/yr of NAV, spec §4.5).
pub const DEFAULT_CO_PAY_BPS: u16 = 10;
/// Default redemption queue length in slots (T+1 at ~400ms slots, spec §3.4).
pub const DEFAULT_SETTLEMENT_SLOTS: u64 = 86_400;
/// Deferral window for performance fees (6 months, spec §4.5).
pub const DEFAULT_DEFERRAL_SECS: u64 = 180 * 86_400;
/// Maximum allowed single oracle mark as bps of the current total value (20%).
/// Prevents a compromised oracle set from imposing arbitrary NAV spikes/haircuts between
/// the multi-source off-chain aggregation windows (spec §3.1, AV-5). The first mark
/// (initial position deployment) is exempt.
pub const DEFAULT_MAX_VALUE_MOVE_BPS: u16 = 2_000;
/// Maximum number of oracle keys in the M-of-N signing set (spec §3.1, AV-5).
pub const MAX_ORACLES: usize = 5;
/// Required oracle signers per NAV mark. Each signer reports an independent value;
/// the vault applies the median of the signed feeds (spec §3.1, AV-5: median of ≥3).
pub const DEFAULT_MIN_ORACLE_SIGNATURES: u8 = 3;

#[repr(u8)]
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum VaultStatus {
    Active = 0,
    Paused = 1,
    Emergency = 2,
}

/// Protocol-level vault configuration. Single PDA per vault program deployment.
/// Governance-gated parameter changes land here (spec §12.1).
#[account]
pub struct Config {
    pub governance: Pubkey,
    /// M-of-N oracle set: at least `min_oracle_signatures` distinct authorized keys
    /// must sign a NAV mark; their reported values are aggregated by median (AV-5).
    /// Zero-pubkey slots are unassigned.
    pub oracles: [Pubkey; MAX_ORACLES],
    /// Number of distinct oracle signatures required per NAV mark.
    pub min_oracle_signatures: u8,
    pub risk_engine: Pubkey,
    pub treasury: Pubkey,
    pub insurance: Pubkey,
    pub veatlas: Pubkey,
    pub mgmt_fee_cap_bps: u16,
    pub perf_fee_cap_bps: u16,
    pub premium_cap_bps: u16,
    pub protocol_mgmt_share_bps: u16,
    pub protocol_perf_share_bps: u16,
    pub insurance_share_bps: u16,
    pub treasury_share_bps: u16,
    pub veatlas_share_bps: u16,
    pub co_pay_bps: u16,
    pub reserve_target: u64,
    pub settlement_slots: u64,
    pub deferral_secs: u64,
    /// Max single oracle-mark move as bps of current total value (both directions).
    pub max_value_move_bps: u16,
    pub bump: u8,
}

impl Config {
    pub const SPACE: usize = 8
        + 32
        + 32 * MAX_ORACLES
        + 1
        + 32 * 4
        + 2 * 10
        + 8
        + 8
        + 8
        + 1;

    /// Number of assigned (non-default) oracle keys.
    pub fn active_oracle_count(&self) -> usize {
        self.oracles.iter().filter(|k| **k != Pubkey::default()).count()
    }

    /// True if `key` is a member of the M-of-N oracle set.
    pub fn is_oracle(&self, key: &Pubkey) -> bool {
        self.oracles.iter().any(|k| k == key)
    }
}

/// Median of a sorted-copy of `values` (upper median for even-length inputs). The
/// vault applies the median of the M signed oracle feeds (spec §3.1, AV-5).
pub fn median_of(values: &[u64]) -> u64 {
    let mut sorted = values.to_vec();
    sorted.sort_unstable();
    sorted[sorted.len() / 2]
}

/// Validates an M-of-N oracle set: a distinct, non-default set of `MAX_ORACLES`
/// keys at most, with at least `min_oracle_signatures` (floor of 3, spec AV-5).
pub fn validate_oracle_set(oracles: &[Pubkey], min_oracle_signatures: u8) -> Result<()> {
    require!(
        min_oracle_signatures as usize >= 3 && (min_oracle_signatures as usize) <= MAX_ORACLES,
        VaultError::TooFewOracleSigners
    );
    require!(
        oracles.len() >= min_oracle_signatures as usize && oracles.len() <= MAX_ORACLES,
        VaultError::OracleSetTooLarge
    );
    let mut seen: Vec<Pubkey> = Vec::with_capacity(oracles.len());
    for key in oracles {
        require!(*key != Pubkey::default(), VaultError::InvalidConfig);
        require!(!seen.contains(key), VaultError::InvalidConfig);
        seen.push(*key);
    }
    Ok(())
}

#[account]
pub struct Vault {
    /// Protocol-side deployer / vault owner (not the LP manager).
    pub authority: Pubkey,
    /// LP manager fee recipient. May be updated by the authority.
    pub manager: Pubkey,
    /// On-chain manager profile in `atlas-manager-registry` (PDA `["manager", manager_owner]`).
    pub manager_profile: Pubkey,
    pub shares_mint: Pubkey,
    pub base_mint: Pubkey,
    pub bump: u8,
    pub status: VaultStatus,
    pub management_fee_bps: u16,
    pub performance_fee_bps: u16,
    pub insurance_premium_bps: u16,
    pub min_deposit: u64,
    /// Gross NAV: cash held in escrow plus oracle-marked positions (base units).
    pub total_value: u64,
    pub shares_outstanding: u64,
    pub accrued_mgmt_protocol: u64,
    pub accrued_mgmt_manager: u64,
    pub accrued_perf_protocol: u64,
    pub accrued_perf_manager: u64,
    pub accrued_insurance: u64,
    /// Peak net NAVPS ever achieved (scaled by `SHARE_PRICE_SCALE`). Performance fees
    /// accrue only against gains above this mark (spec §3.2, AV-8).
    pub hwm: u64,
    pub last_accrual_ts: i64,
    /// Aggregate shares queued for redemption (pro-rata accounting, spec §3.4).
    pub pending_shares: u64,
    pub pending_value: u64,
    pub created_at: i64,
    pub last_rebalance_at: i64,
    /// Number of keeper-triggered rebalance heartbeats (spec §12.2 automation).
    pub rebalance_count: u64,
    /// True once the oracle has submitted the first mark (initial position deployment).
    /// The first mark is unbounded; subsequent marks are bounded by
    /// `config.max_value_move_bps`.
    pub oracle_marked: bool,
}

impl Vault {
    pub const SPACE: usize = 8
        + 32
        + 32
        + 32
        + 32
        + 32
        + 1
        + 1
        + 2
        + 2
        + 2
        + 8
        + 8
        + 8
        + 8
        + 8
        + 8
        + 8
        + 8
        + 8
        + 8
        + 8
        + 8
        + 8
        + 8
        + 1;

    /// Investor-visible NAV = gross value net of all accrued fees and insurance.
    pub fn net_nav(&self) -> u64 {
        self.total_value
            .saturating_sub(self.accrued_mgmt_protocol)
            .saturating_sub(self.accrued_mgmt_manager)
            .saturating_sub(self.accrued_perf_protocol)
            .saturating_sub(self.accrued_perf_manager)
            .saturating_sub(self.accrued_insurance)
    }

    /// Net asset value per share, scaled by `SHARE_PRICE_SCALE`.
    pub fn share_price(&self) -> Option<u64> {
        if self.shares_outstanding == 0 {
            return None;
        }
        let price = (self.net_nav() as u128)
            .checked_mul(SHARE_PRICE_SCALE as u128)?
            .checked_div(self.shares_outstanding as u128)?;
        Some(price as u64)
    }

    /// Total accrued fees owed out of the vault (protocol + manager + insurance).
    pub fn accrued_total(&self) -> u64 {
        self.accrued_mgmt_protocol
            .saturating_add(self.accrued_mgmt_manager)
            .saturating_add(self.accrued_perf_protocol)
            .saturating_add(self.accrued_perf_manager)
            .saturating_add(self.accrued_insurance)
    }
}

/// Management fee accrued on NAV over an elapsed window:
/// `nav * fee_bps/10000 * elapsed / SECS_PER_YEAR`, in base units.
pub fn accrued_mgmt_fee(nav: u64, fee_bps: u16, elapsed_secs: u64) -> u64 {
    let scaled = (nav as u128)
        .saturating_mul(fee_bps as u128)
        .saturating_mul(elapsed_secs as u128)
        / ((10_000 * SECS_PER_YEAR) as u128);
    scaled.min(u64::MAX as u128) as u64
}

/// Insurance contribution (premium + co-pay) accrued on NAV over an elapsed window.
pub fn accrued_insurance_fee(nav: u64, fee_bps: u16, elapsed_secs: u64) -> u64 {
    accrued_mgmt_fee(nav, fee_bps, elapsed_secs)
}

/// Performance fee on the NAVPS gain above the high-water mark:
/// `(navps - hwm) * shares * perf_bps/10000`, in base units.
/// `navps`/`hwm` are per-share prices scaled by `SHARE_PRICE_SCALE`, computed in u128
/// because share prices can exceed u64 range at low share counts.
pub fn accrued_perf_fee(
    navps: u128,
    hwm: u128,
    shares_outstanding: u64,
    perf_fee_bps: u16,
) -> u64 {
    if navps <= hwm || shares_outstanding == 0 {
        return 0;
    }
    let gain = navps.saturating_sub(hwm);
    let scaled = gain
        .saturating_mul(shares_outstanding as u128)
        .saturating_mul(perf_fee_bps as u128)
        / ((SHARE_PRICE_SCALE as u128) * 10_000);
    scaled.min(u64::MAX as u128) as u64
}

/// Accrue time-based fees (management, insurance premium, manager co-pay) for the
/// elapsed window since the last accrual, and mark the accrual timestamp. Performance
/// fees are NOT accrued here — they require a fresh oracle mark (`update_value`).
pub fn accrue_time_fees(vault: &mut Vault, config: &Config, now: i64) -> Result<()> {
    if vault.shares_outstanding == 0 {
        vault.last_accrual_ts = now;
        return Ok(());
    }
    let elapsed = (now.saturating_sub(vault.last_accrual_ts)) as u64;
    if elapsed == 0 {
        return Ok(());
    }

    let mgmt = accrued_mgmt_fee(vault.total_value, vault.management_fee_bps, elapsed);
    let protocol_mgmt = mgmt
        .checked_mul(config.protocol_mgmt_share_bps as u64)
        .map(|v| v / 10_000)
        .ok_or(VaultError::MathOverflow)?;
    vault.accrued_mgmt_protocol = vault.accrued_mgmt_protocol.saturating_add(protocol_mgmt);
    vault.accrued_mgmt_manager = vault
        .accrued_mgmt_manager
        .saturating_add(mgmt.saturating_sub(protocol_mgmt));

    let insurance_bps = (vault.insurance_premium_bps as u32)
        .saturating_add(config.co_pay_bps as u32);
    let insurance = accrued_mgmt_fee(vault.total_value, insurance_bps as u16, elapsed);
    vault.accrued_insurance = vault.accrued_insurance.saturating_add(insurance);

    vault.last_accrual_ts = now;
    Ok(())
}

#[account]
pub struct WithdrawalRequest {
    pub vault: Pubkey,
    pub user: Pubkey,
    pub shares: u64,
    /// Value at request time (pro-rata basis, spec §3.4).
    pub value: u64,
    pub settlement_slot: u64,
    pub settled: bool,
    pub bump: u8,
}

impl WithdrawalRequest {
    pub const SPACE: usize = 8 + 32 + 32 + 8 + 8 + 8 + 1 + 1;
}

/// Rolling performance-fee deferral escrow (spec §4.5): 50% of manager performance
/// fees are held for `deferral_secs`, subject to clawback on misconduct.
#[account]
pub struct FeeEscrow {
    pub vault: Pubkey,
    pub manager: Pubkey,
    pub amount: u64,
    pub release_at: i64,
    pub bump: u8,
}

impl FeeEscrow {
    pub const SPACE: usize = 8 + 32 + 32 + 8 + 8 + 1;
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_vault() -> Vault {
        Vault {
            authority: Pubkey::default(),
            manager: Pubkey::default(),
            manager_profile: Pubkey::default(),
            shares_mint: Pubkey::default(),
            base_mint: Pubkey::default(),
            bump: 0,
            status: VaultStatus::Active,
            management_fee_bps: 750,
            performance_fee_bps: 1500,
            insurance_premium_bps: 100,
            min_deposit: 0,
            total_value: 0,
            shares_outstanding: 0,
            accrued_mgmt_protocol: 0,
            accrued_mgmt_manager: 0,
            accrued_perf_protocol: 0,
            accrued_perf_manager: 0,
            accrued_insurance: 0,
            hwm: 0,
            last_accrual_ts: 0,
            pending_shares: 0,
            pending_value: 0,
            created_at: 0,
            last_rebalance_at: 0,
            rebalance_count: 0,
            oracle_marked: false,
        }
    }

    #[test]
    fn share_price_is_none_when_empty() {
        assert_eq!(test_vault().share_price(), None);
    }

    #[test]
    fn share_price_is_one_to_one_at_par() {
        let mut vault = test_vault();
        vault.total_value = 1_000_000_000;
        vault.shares_outstanding = 1_000_000_000;
        assert_eq!(vault.share_price(), Some(SHARE_PRICE_SCALE));
    }

    #[test]
    fn share_price_reflects_gains() {
        let mut vault = test_vault();
        vault.total_value = 1_100_000_000;
        vault.shares_outstanding = 1_000_000_000;
        assert_eq!(
            vault.share_price(),
            Some(1_100_000_000 * SHARE_PRICE_SCALE / 1_000_000_000)
        );
    }

    #[test]
    fn share_price_is_net_of_accrued_fees() {
        let mut vault = test_vault();
        vault.total_value = 1_100_000_000;
        vault.shares_outstanding = 1_000_000_000;
        vault.accrued_mgmt_protocol = 100_000_000;
        // net = 1.0e9 → price = 1.0 * 1e9
        assert_eq!(vault.share_price(), Some(SHARE_PRICE_SCALE));
    }

    #[test]
    fn net_nav_never_goes_negative() {
        let mut vault = test_vault();
        vault.total_value = 1_000;
        vault.accrued_mgmt_protocol = 10_000;
        vault.accrued_insurance = 10_000;
        assert_eq!(vault.net_nav(), 0);
    }

    #[test]
    fn mgmt_fee_is_annualized() {
        // nav in base units: 1e12 units = $1M at 1e6 decimals. 75 bps/yr of that
        // NAV is exactly 1e12 * 75 / 1e4 = 7.5e9 units/yr.
        let nav = 1_000_000_000_000u64;
        let year = SECS_PER_YEAR;
        assert_eq!(accrued_mgmt_fee(nav, 75, year), 7_500_000_000);
        // half a year → half the fee
        assert_eq!(accrued_mgmt_fee(nav, 75, year / 2), 3_750_000_000);
    }

    #[test]
    fn mgmt_fee_scales_linearly_with_elapsed() {
        let nav = 10_000_000_000_000u64;
        let year = SECS_PER_YEAR;
        // Doubling the elapsed window doubles the fee (division is exact).
        assert_eq!(
            accrued_mgmt_fee(nav, 100, year),
            accrued_mgmt_fee(nav, 100, year / 2) * 2
        );
    }

    #[test]
    fn perf_fee_only_above_hwm() {
        let shares = 1_000_000_000_000u64; // 1M shares at 1e6 units
        // NAVPS at par = 1e9; hwm = 1e9; new NAVPS 1.1e9 → gain 1e8
        let navps = 1_100_000_000u128;
        let hwm = 1_000_000_000u128;
        // gain_value = (1.1 - 1.0) * 1e6 units = 1e5 units... compute: gain(1e8) * shares / 1e9
        // = 1e8 * 1e12 / 1e9 = 1e11 units, *1500/1e4 = 1.5e10 units = 15_000 * 1e6... in base units
        let fee = accrued_perf_fee(navps, hwm, shares, 1_500);
        let expected = ((1e8 as u128) * (shares as u128) * 1_500) / ((1e9 as u128) * 10_000);
        assert_eq!(fee as u128, expected);
        // At or below HWM → no fee
        assert_eq!(accrued_perf_fee(navps, navps, shares, 1_500), 0);
        assert_eq!(accrued_perf_fee(hwm, hwm, shares, 1_500), 0);
    }

    #[test]
    fn perf_fee_is_zero_when_empty() {
        assert_eq!(accrued_perf_fee(1_100_000_000u128, 1_000_000_000u128, 0, 1_500), 0);
    }

    #[test]
    fn fee_split_protocol_and_manager() {
        let cfg_protocol_bps = 2_500u16; // 25%
        let total = 10_000u64;
        let protocol = total * (cfg_protocol_bps as u64) / 10_000;
        assert_eq!(protocol, 2_500);
        assert_eq!(total - protocol, 7_500);
    }

    #[test]
    fn median_of_odd_count_is_middle_element() {
        assert_eq!(median_of(&[100, 50, 75]), 75);
        assert_eq!(median_of(&[1, 2, 3, 4, 5]), 3);
    }

    #[test]
    fn median_of_even_count_is_upper_median() {
        assert_eq!(median_of(&[10, 20, 30, 40]), 30);
        assert_eq!(median_of(&[90, 70, 80, 60]), 80);
    }

    #[test]
    fn median_is_robust_to_outlier_reports() {
        // One compromised oracle reporting an extreme value cannot move the median.
        assert_eq!(median_of(&[1_000_000, 1_010_000, 1_005_000, 9_999_000]), 1_010_000);
    }

    #[test]
    fn oracle_set_validation_enforces_m_of_n() {
        let keys: Vec<Pubkey> = (0..6).map(|_| Pubkey::new_unique()).collect();
        assert!(validate_oracle_set(&keys[..3], 3).is_ok());
        assert!(validate_oracle_set(&keys[..4], 3).is_ok());
        assert!(validate_oracle_set(&keys[..3], 4).is_err());
        assert!(validate_oracle_set(&keys, 3).is_err());
        let mut dup = keys[..3].to_vec();
        dup.push(keys[0]);
        assert!(validate_oracle_set(&dup, 3).is_err());
        assert!(validate_oracle_set(&[], 3).is_err());
    }
}
