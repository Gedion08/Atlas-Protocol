use crate::state::*;
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct Unbond<'info> {
    #[account(
        mut,
        has_one = owner @ StakingError::Unauthorized,
        seeds = [b"bond", owner.key().as_ref()],
        bump = bond.bump
    )]
    pub bond: Account<'info, BondAccount>,
    #[account(
        seeds = [b"atlas_staking_config"],
        bump = config.bump
    )]
    pub config: Account<'info, Config>,
    pub owner: Signer<'info>,
}

pub fn unbond_handler(ctx: Context<Unbond>) -> Result<()> {
    let bond = &mut ctx.accounts.bond;
    require!(bond.unbond_at == 0, StakingError::UnbondPending);
    require!(bond.amount > 0, StakingError::ZeroAmount);

    bond.unbond_at = Clock::get()?
        .slot
        .checked_add(ctx.accounts.config.cooldown_slots)
        .ok_or(StakingError::MathOverflow)?;
    Ok(())
}
