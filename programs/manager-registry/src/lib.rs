use anchor_lang::prelude::*;

pub mod error;
pub mod instructions;
pub mod state;

use instructions::*;
pub use state::*;

declare_id!("9h29CPwoYFgQ4wYN2oWWCyA9rS3nMYaeS99Y676zSGa8");

#[program]
pub mod atlas_manager_registry {
    use super::*;

    pub fn initialize_config(
        ctx: Context<InitializeConfig>,
        params: InitializeConfigParams,
    ) -> Result<()> {
        initialize_config_handler(ctx, params)
    }

    pub fn update_config(ctx: Context<UpdateConfig>, input: UpdateConfigInput) -> Result<()> {
        update_config_handler(ctx, input)
    }

    pub fn register(ctx: Context<Register>, name: String) -> Result<()> {
        register_handler(ctx, name)
    }

    pub fn set_score(ctx: Context<SetScore>, score: ScoreInput) -> Result<()> {
        set_score_handler(ctx, score)
    }

    pub fn update_profile(ctx: Context<UpdateProfile>, name: Option<String>) -> Result<()> {
        update_profile_handler(ctx, name)
    }

    pub fn set_status(ctx: Context<SetStatus>, status: ManagerStatus) -> Result<()> {
        set_status_handler(ctx, status)
    }

    pub fn slash_bond(ctx: Context<SlashBond>, amount: u64) -> Result<()> {
        slash_bond_handler(ctx, amount)
    }
}
