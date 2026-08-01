use crate::state::*;
use anchor_lang::prelude::*;

/// Governance-gated protocol config update (spec §12.1). All fields are optional;
/// only the provided fields are changed. Rate/weight constraints are enforced.
#[derive(Accounts)]
pub struct UpdateConfig<'info> {
    #[account(
        mut,
        seeds = [b"vault_config"],
        bump = config.bump,
        constraint = governance.key() == config.governance @ VaultError::InvalidGovernance
    )]
    pub config: Box<Account<'info, Config>>,
    pub governance: Signer<'info>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct UpdateConfigInput {
    /// Replacement M-of-N oracle set (spec §3.1, AV-5). When provided, the set is
    /// validated against the current `min_oracle_signatures` unless that is also
    /// being updated in the same call.
    pub oracles: Option<Vec<Pubkey>>,
    pub min_oracle_signatures: Option<u8>,
    pub risk_engine: Option<Pubkey>,
    pub treasury: Option<Pubkey>,
    pub insurance: Option<Pubkey>,
    pub veatlas: Option<Pubkey>,
    pub governance: Option<Pubkey>,
    pub mgmt_fee_cap_bps: Option<u16>,
    pub perf_fee_cap_bps: Option<u16>,
    pub premium_cap_bps: Option<u16>,
    pub protocol_mgmt_share_bps: Option<u16>,
    pub protocol_perf_share_bps: Option<u16>,
    pub insurance_share_bps: Option<u16>,
    pub treasury_share_bps: Option<u16>,
    pub veatlas_share_bps: Option<u16>,
    pub co_pay_bps: Option<u16>,
    pub reserve_target: Option<u64>,
    pub settlement_slots: Option<u64>,
    pub deferral_secs: Option<u64>,
    pub max_value_move_bps: Option<u16>,
}

pub fn update_config_handler(ctx: Context<UpdateConfig>, input: UpdateConfigInput) -> Result<()> {
    let config = &mut ctx.accounts.config;

    if let Some(set) = input.oracles {
        let min = input
            .min_oracle_signatures
            .unwrap_or(config.min_oracle_signatures);
        validate_oracle_set(&set, min)?;
        config.oracles = [Pubkey::default(); MAX_ORACLES];
        for (i, key) in set.iter().enumerate() {
            config.oracles[i] = *key;
        }
        config.min_oracle_signatures = min;
    } else if let Some(min) = input.min_oracle_signatures {
        let current: Vec<Pubkey> = config
            .oracles
            .iter()
            .take(config.active_oracle_count())
            .copied()
            .collect();
        validate_oracle_set(&current, min)?;
        config.min_oracle_signatures = min;
    }
    if let Some(k) = input.risk_engine {
        require!(k != Pubkey::default(), VaultError::InvalidConfig);
        config.risk_engine = k;
    }
    if let Some(k) = input.treasury {
        config.treasury = k;
    }
    if let Some(k) = input.insurance {
        config.insurance = k;
    }
    if let Some(k) = input.veatlas {
        config.veatlas = k;
    }
    if let Some(k) = input.governance {
        require!(k != Pubkey::default(), VaultError::InvalidConfig);
        config.governance = k;
    }

    if let Some(cap) = input.mgmt_fee_cap_bps {
        require!(cap <= 10_000, VaultError::FeeBpsTooHigh);
        config.mgmt_fee_cap_bps = cap;
    }
    if let Some(cap) = input.perf_fee_cap_bps {
        require!(cap <= 10_000, VaultError::FeeBpsTooHigh);
        config.perf_fee_cap_bps = cap;
    }
    if let Some(cap) = input.premium_cap_bps {
        require!(cap <= 10_000, VaultError::FeeBpsTooHigh);
        config.premium_cap_bps = cap;
    }
    if let Some(share) = input.protocol_mgmt_share_bps {
        require!(share <= 10_000, VaultError::InvalidConfig);
        config.protocol_mgmt_share_bps = share;
    }
    if let Some(share) = input.protocol_perf_share_bps {
        require!(share <= 10_000, VaultError::InvalidConfig);
        config.protocol_perf_share_bps = share;
    }
    if let Some(co_pay) = input.co_pay_bps {
        require!(co_pay <= 10_000, VaultError::InvalidConfig);
        config.co_pay_bps = co_pay;
    }

    if let Some(share) = input.insurance_share_bps {
        config.insurance_share_bps = share;
    }
    if let Some(share) = input.treasury_share_bps {
        config.treasury_share_bps = share;
    }
    if let Some(share) = input.veatlas_share_bps {
        config.veatlas_share_bps = share;
    }
    // The net-revenue waterfall must fully allocate (spec §2.4).
    require!(
        (config.insurance_share_bps as u32)
            .saturating_add(config.treasury_share_bps as u32)
            .saturating_add(config.veatlas_share_bps as u32)
            == 10_000,
        VaultError::InvalidConfig
    );

    if let Some(target) = input.reserve_target {
        config.reserve_target = target;
    }
    if let Some(slots) = input.settlement_slots {
        config.settlement_slots = slots;
    }
    if let Some(secs) = input.deferral_secs {
        config.deferral_secs = secs;
    }
    if let Some(move_bps) = input.max_value_move_bps {
        require!(move_bps > 0 && move_bps <= 10_000, VaultError::InvalidConfig);
        config.max_value_move_bps = move_bps;
    }
    Ok(())
}
