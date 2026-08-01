use crate::state::*;
use anchor_lang::prelude::*;
use anchor_spl::token::Mint;

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = deployer,
        space = GovernanceConfig::SPACE,
        seeds = [b"atlas_governance"],
        bump
    )]
    pub config: Account<'info, GovernanceConfig>,
    pub atlas_mint: Box<Account<'info, Mint>>,
    #[account(mut)]
    pub deployer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

pub fn initialize_handler(ctx: Context<Initialize>) -> Result<()> {
    let config = &mut ctx.accounts.config;
    config.governance = ctx.accounts.deployer.key();
    config.atlas_mint = ctx.accounts.atlas_mint.key();
    config.total_ve_weight = 0;
    config.proposal_counter = 0;
    config.bump = ctx.bumps.config;
    Ok(())
}
