use anchor_lang::prelude::*;

pub mod error;
pub mod instructions;
pub mod state;

use instructions::*;
pub use state::*;

declare_id!("B2sKSyicsc65bJ8AXZigQSfa1MUBiKbBjRqpYQuT6iUA");

#[program]
pub mod atlas_staking {
    use super::*;

    pub fn initialize(
        ctx: Context<Initialize>,
        vault_program: Pubkey,
        premium_mint: Pubkey,
    ) -> Result<()> {
        initialize_handler(ctx, vault_program, premium_mint)
    }

    pub fn set_slash_authority(ctx: Context<SetSlashAuthority>, slash_authority: Pubkey) -> Result<()> {
        set_slash_authority_handler(ctx, slash_authority)
    }

    pub fn bond(ctx: Context<BondTokens>, amount: u64) -> Result<()> {
        bond_handler(ctx, amount)
    }

    pub fn unbond(ctx: Context<Unbond>) -> Result<()> {
        unbond_handler(ctx)
    }

    pub fn claim(ctx: Context<ClaimBond>) -> Result<()> {
        claim_handler(ctx)
    }

    pub fn slash(ctx: Context<SlashBond>, amount: u64) -> Result<()> {
        slash_handler(ctx, amount)
    }

    pub fn file_claim(
        ctx: Context<FileClaim>,
        amount: u64,
        event_type: u8,
        evidence: [u8; 32],
        event_ts: i64,
    ) -> Result<()> {
        file_claim_handler(ctx, amount, event_type, evidence, event_ts)
    }

    pub fn deposit_premium(ctx: Context<DepositPremium>, amount: u64) -> Result<()> {
        deposit_premium_handler(ctx, amount)
    }

    pub fn decide_claim(ctx: Context<DecideClaim>, approve: bool) -> Result<()> {
        decide_claim_handler(ctx, approve)
    }

    pub fn pay_claim(ctx: Context<PayClaim>) -> Result<()> {
        pay_claim_handler(ctx)
    }

    pub fn appeal_claim(ctx: Context<AppealClaim>) -> Result<()> {
        appeal_claim_handler(ctx)
    }

    pub fn set_claims_committee(
        ctx: Context<SetClaimsCommittee>,
        new_committee: Pubkey,
    ) -> Result<()> {
        set_claims_committee_handler(ctx, new_committee)
    }
}
