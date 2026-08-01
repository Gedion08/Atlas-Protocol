use crate::state::*;
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct DelegateLock<'info> {
    #[account(
        mut,
        seeds = [b"ve_lock", owner.key().as_ref()],
        bump = lock.bump,
        constraint = lock.owner == owner.key() @ GovernanceError::Unauthorized
    )]
    pub lock: Account<'info, VeLock>,
    pub owner: Signer<'info>,
}

pub fn delegate_lock_handler(ctx: Context<DelegateLock>, new_delegate: Pubkey) -> Result<()> {
    ctx.accounts.lock.delegate = new_delegate;
    Ok(())
}
