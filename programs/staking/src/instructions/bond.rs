use crate::state::*;
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

#[derive(Accounts)]
pub struct BondTokens<'info> {
    #[account(
        init_if_needed,
        payer = owner,
        space = BondAccount::SPACE,
        seeds = [b"bond", owner.key().as_ref()],
        bump
    )]
    pub bond: Account<'info, BondAccount>,
    #[account(
        init_if_needed,
        payer = owner,
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
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
}

pub fn bond_handler(ctx: Context<BondTokens>, amount: u64) -> Result<()> {
    require!(amount > 0, StakingError::ZeroAmount);
    require!(
        ctx.accounts.bond.unbond_at == 0,
        StakingError::UnbondPending
    );

    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.owner_token.to_account_info(),
                to: ctx.accounts.escrow.to_account_info(),
                authority: ctx.accounts.owner.to_account_info(),
            },
        ),
        amount,
    )?;

    let bond = &mut ctx.accounts.bond;
    bond.owner = ctx.accounts.owner.key();
    bond.escrow = ctx.accounts.escrow.key();
    bond.amount = bond
        .amount
        .checked_add(amount)
        .ok_or(StakingError::MathOverflow)?;
    bond.bump = ctx.bumps.bond;
    Ok(())
}
