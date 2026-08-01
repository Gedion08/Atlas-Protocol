use crate::state::*;
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

#[derive(Accounts)]
pub struct SlashBond<'info> {
    #[account(
        mut,
        seeds = [b"atlas_staking_config"],
        bump = config.bump
    )]
    pub config: Account<'info, Config>,
    #[account(
        mut,
        seeds = [b"bond", bond.owner.as_ref()],
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
    #[account(
        init_if_needed,
        payer = slash_authority,
        token::mint = bond_mint,
        token::authority = config,
        seeds = [b"insurance_escrow", config.key().as_ref()],
        bump
    )]
    pub insurance_escrow: Box<Account<'info, TokenAccount>>,
    #[account(mut)]
    pub slash_authority: Signer<'info>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
}

pub fn slash_handler(ctx: Context<SlashBond>, amount: u64) -> Result<()> {
    require!(
        ctx.accounts.slash_authority.key() == ctx.accounts.config.slash_authority,
        StakingError::Unauthorized
    );
    require!(amount > 0, StakingError::ZeroAmount);
    require!(
        amount <= ctx.accounts.bond.amount,
        StakingError::SlashExceedsBond
    );

    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.escrow.to_account_info(),
                to: ctx.accounts.insurance_escrow.to_account_info(),
                authority: ctx.accounts.bond.to_account_info(),
            },
            &[&[
                b"bond",
                ctx.accounts.bond.owner.as_ref(),
                &[ctx.accounts.bond.bump],
            ]],
        ),
        amount,
    )?;

    let bond = &mut ctx.accounts.bond;
    bond.amount = bond
        .amount
        .checked_sub(amount)
        .ok_or(StakingError::MathOverflow)?;
    bond.slash_count = bond.slash_count.saturating_add(1);
    Ok(())
}
