use anchor_lang::prelude::*;

pub mod error;
pub mod instructions;
pub mod state;

use instructions::*;
pub use state::*;

declare_id!("5vTfeciGVp3J6FWkvEGPfrdDNFAUkBA8RFXDvaKzZPBe");

#[program]
pub mod atlas_governance {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        initialize_handler(ctx)
    }

    pub fn create_lock(
        ctx: Context<CreateLock>,
        amount: u64,
        duration_secs: i64,
    ) -> Result<()> {
        create_lock_handler(ctx, amount, duration_secs)
    }

    pub fn extend_lock(
        ctx: Context<ExtendLock>,
        add_amount: u64,
        new_duration_secs: i64,
    ) -> Result<()> {
        extend_lock_handler(ctx, add_amount, new_duration_secs)
    }

    pub fn withdraw_lock(ctx: Context<WithdrawLock>) -> Result<()> {
        withdraw_lock_handler(ctx)
    }

    pub fn sweep_expired_lock(ctx: Context<SweepExpiredLock>) -> Result<()> {
        sweep_expired_lock_handler(ctx)
    }

    pub fn delegate_lock(ctx: Context<DelegateLock>, new_delegate: Pubkey) -> Result<()> {
        delegate_lock_handler(ctx, new_delegate)
    }

    pub fn create_proposal(
        ctx: Context<CreateProposal>,
        title: String,
        class: ProposalClass,
        target_program: Pubkey,
        instruction_data: Vec<u8>,
    ) -> Result<()> {
        create_proposal_handler(ctx, title, class, target_program, instruction_data)
    }

    pub fn vote(ctx: Context<VoteOnProposal>, in_favor: bool) -> Result<()> {
        vote_handler(ctx, in_favor)
    }

    pub fn finalize_proposal(ctx: Context<FinalizeProposal>) -> Result<()> {
        finalize_proposal_handler(ctx)
    }

    pub fn execute_proposal(ctx: Context<ExecuteProposal>) -> Result<()> {
        execute_proposal_handler(ctx)
    }
}
