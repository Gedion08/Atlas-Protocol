use crate::state::*;
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = deployer,
        space = Config::SPACE,
        seeds = [b"atlas_staking_config"],
        bump
    )]
    pub config: Account<'info, Config>,
    #[account(mut)]
    pub deployer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

pub fn initialize_handler(
    ctx: Context<Initialize>,
    vault_program: Pubkey,
    premium_mint: Pubkey,
) -> Result<()> {
    require!(vault_program != Pubkey::default(), StakingError::InvalidConfig);
    require!(premium_mint != Pubkey::default(), StakingError::InvalidConfig);
    let config = &mut ctx.accounts.config;
    config.slash_authority = ctx.accounts.deployer.key();
    config.cooldown_slots = UNBOND_COOLDOWN_SLOTS;
    config.claims_committee = Pubkey::default();
    config.vault_program = vault_program;
    config.premium_mint = premium_mint;
    config.claim_window_secs = DEFAULT_CLAIM_WINDOW_SECS;
    config.co_insurance_bps = DEFAULT_CO_INSURANCE_BPS;
    config.max_claim_reserve_bps = DEFAULT_MAX_CLAIM_RESERVE_BPS;
    config.bump = ctx.bumps.config;
    Ok(())
}
