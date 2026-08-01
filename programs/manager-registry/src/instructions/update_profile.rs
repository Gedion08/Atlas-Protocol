use crate::state::*;
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct UpdateProfile<'info> {
    #[account(
        mut,
        has_one = owner @ RegistryError::Unauthorized,
        seeds = [b"manager", owner.key().as_ref()],
        bump = profile.bump
    )]
    pub profile: Account<'info, ManagerProfile>,
    pub owner: Signer<'info>,
}

pub fn update_profile_handler(ctx: Context<UpdateProfile>, name: Option<String>) -> Result<()> {
    if let Some(name) = name {
        require!(
            name.as_bytes().len() <= ManagerProfile::MAX_NAME_LEN,
            RegistryError::NameTooLong
        );
        ctx.accounts.profile.name = name;
    }
    ctx.accounts.profile.updated_at = Clock::get()?.unix_timestamp;
    Ok(())
}
