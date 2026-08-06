use anchor_lang::prelude::*;

pub mod error;
pub mod instructions;
pub mod state;

use instructions::*;
pub use state::*;

declare_id!("86pSPBBGKzMXteNGjxPT8XSt3fjuZGRMVMnEhQpWiefS");

#[program]
pub mod atlas_treasury {
    use super::*;

    pub fn initialize(
        ctx: Context<Initialize>,
        intrinsic_price_bps: u64,
        oracles: Vec<Pubkey>,
        min_oracle_signatures: u8,
    ) -> Result<()> {
        initialize_handler(ctx, intrinsic_price_bps, oracles, min_oracle_signatures)
    }

    pub fn deposit_revenue(ctx: Context<DepositRevenue>, amount: u64) -> Result<()> {
        deposit_revenue_handler(ctx, amount)
    }

    pub fn buyback(ctx: Context<Buyback>, amount: u64, prices: Vec<u64>) -> Result<()> {
        buyback_handler(ctx, amount, prices)
    }

    pub fn withdraw_revenue(ctx: Context<WithdrawRevenue>, amount: u64) -> Result<()> {
        withdraw_revenue_handler(ctx, amount)
    }

    #[allow(clippy::too_many_arguments)]
    pub fn update_config(
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
        update_config_handler(
            ctx,
            buyback_authority,
            oracles,
            min_oracle_signatures,
            intrinsic_price_bps,
            premium_cap_bps,
            period_length_secs,
            period_cap_bps,
            withdraw_cap_bps,
        )
    }

    pub fn rollover_period(ctx: Context<RolloverPeriod>) -> Result<()> {
        rollover_period_handler(ctx)
    }

    pub fn activate_insurance(ctx: Context<ActivateInsurance>, amount: u64) -> Result<()> {
        activate_insurance_handler(ctx, amount)
    }
}
