use crate::state::*;
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

#[derive(Accounts)]
pub struct ClaimBond<'info> {
    #[account(
        mut,
        has_one = owner @ StakingError::Unauthorized,
        seeds = [b"bond", owner.key().as_ref()],
        bump = bond.bump
    )]
    pub bond: Account<'info, BondAccount>,
    #[account(
        mut,
        token::mint = bond_mint,
        token::authority = bond,
        seeds = [b"escrow", bond.key().as_ref()],
        bump
    )]
    pub escrow: Box<Account<'info, TokenAccount>>,
    pub bond_mint: Box<Account<'info, Mint>>,
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(
        mut,
        token::mint = bond_mint,
        token::authority = owner
    )]
    pub owner_token: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
}

pub fn claim_handler(ctx: Context<ClaimBond>) -> Result<()> {
    require!(
        ctx.accounts.bond.unbond_at != 0,
        StakingError::NoUnbondPending
    );
    require!(
        Clock::get()?.slot >= ctx.accounts.bond.unbond_at,
        StakingError::CooldownNotElapsed
    );

    let amount = ctx.accounts.bond.amount;
    let bond_bump = ctx.accounts.bond.bump;
    let owner = ctx.accounts.owner.key();
    let bond_info = ctx.accounts.bond.to_account_info();

    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.escrow.to_account_info(),
                to: ctx.accounts.owner_token.to_account_info(),
                authority: bond_info,
            },
            &[&[b"bond", owner.as_ref(), &[bond_bump]]],
        ),
        amount,
    )?;

    let bond = &mut ctx.accounts.bond;
    bond.amount = 0;
    bond.unbond_at = 0;
    Ok(())
}
