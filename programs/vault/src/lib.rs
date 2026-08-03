use anchor_lang::prelude::*;

pub mod error;
pub mod instructions;
pub mod state;

use instructions::*;
pub use state::*;

declare_id!("BeEtwSTYjPs47ZWa4joMppCNdJs4f4GRumCRtKXfSfSR");

#[program]
pub mod atlas_vault {
    use super::*;

    pub fn initialize_config(
        ctx: Context<InitializeConfig>,
        params: InitializeConfigParams,
    ) -> Result<()> {
        initialize_config_handler(ctx, params)
    }

    pub fn initialize(ctx: Context<Initialize>, params: InitializeParams) -> Result<()> {
        initialize_handler(ctx, params)
    }

    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        deposit_handler(ctx, amount)
    }

    pub fn update_value(ctx: Context<UpdateValue>, values: Vec<u64>) -> Result<()> {
        update_value_handler(ctx, values)
    }

    pub fn request_withdraw(ctx: Context<RequestWithdraw>, shares: u64) -> Result<()> {
        request_withdraw_handler(ctx, shares)
    }

    pub fn settle_withdraw(ctx: Context<SettleWithdraw>) -> Result<()> {
        settle_withdraw_handler(ctx)
    }

    pub fn settle_fees(ctx: Context<SettleFees>) -> Result<()> {
        settle_fees_handler(ctx)
    }

    pub fn release_fee_escrow(ctx: Context<ReleaseFeeEscrow>) -> Result<()> {
        release_fee_escrow_handler(ctx)
    }

    pub fn clawback_fee_escrow(ctx: Context<ClawbackFeeEscrow>) -> Result<()> {
        clawback_fee_escrow_handler(ctx)
    }

    pub fn update_params(ctx: Context<UpdateParams>, params: UpdateParamsInput) -> Result<()> {
        update_params_handler(ctx, params)
    }

    pub fn set_manager(
        ctx: Context<SetManager>,
        manager: Pubkey,
    ) -> Result<()> {
        set_manager_handler(ctx, manager)
    }

    pub fn set_status(ctx: Context<SetStatus>, status: VaultStatus) -> Result<()> {
        set_status_handler(ctx, status)
    }

    pub fn update_config(ctx: Context<UpdateConfig>, input: UpdateConfigInput) -> Result<()> {
        update_config_handler(ctx, input)
    }

    pub fn rebalance(ctx: Context<Rebalance>) -> Result<()> {
        rebalance_handler(ctx)
    }
}
