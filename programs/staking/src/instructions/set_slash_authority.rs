use crate::state::*;
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct SetSlashAuthority<'info> {
    #[account(
        mut,
        has_one = slash_authority @ StakingError::Unauthorized,
        seeds = [b"atlas_staking_config"],
        bump = config.bump
    )]
    pub config: Account<'info, Config>,
    pub slash_authority: Signer<'info>,
}

pub fn set_slash_authority_handler(
    ctx: Context<SetSlashAuthority>,
    new_authority: Pubkey,
) -> Result<()> {
    ctx.accounts.config.slash_authority = new_authority;
    Ok(())
}
