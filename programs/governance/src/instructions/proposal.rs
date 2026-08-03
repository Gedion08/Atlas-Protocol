use crate::state::*;
use anchor_lang::prelude::*;
use anchor_lang::solana_program::program::invoke;
use anchor_lang::solana_program::instruction::Instruction;

#[derive(Accounts)]
pub struct CreateProposal<'info> {
    #[account(
        mut,
        seeds = [b"atlas_governance"],
        bump = config.bump
    )]
    pub config: Account<'info, GovernanceConfig>,
    #[account(
        init,
        payer = proposer,
        space = Proposal::SPACE,
        seeds = [b"proposal", config.key().as_ref(), config.proposal_counter.to_le_bytes().as_ref()],
        bump
    )]
    pub proposal: Account<'info, Proposal>,
    #[account(mut)]
    pub proposer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

pub fn create_proposal_handler(
    ctx: Context<CreateProposal>,
    title: String,
    class: ProposalClass,
    target_program: Pubkey,
    instruction_data: Vec<u8>,
) -> Result<()> {
    require!(
        title.len() <= MAX_TITLE_LEN,
        GovernanceError::InvalidClass
    );
    require!(
        instruction_data.len() <= MAX_IX_DATA_LEN,
        GovernanceError::InstructionTooLarge
    );

    let now = Clock::get()?.unix_timestamp;
    let config = &mut ctx.accounts.config;
    let id = config.proposal_counter;
    config.proposal_counter = config
        .proposal_counter
        .checked_add(1)
        .ok_or(GovernanceError::MathOverflow)?;

    let quorum_bps = class.quorum_bps() as u128;
    let quorum_weight = config.total_ve_weight * quorum_bps / 10_000;

    let proposal = &mut ctx.accounts.proposal;
    proposal.id = id;
    proposal.proposer = ctx.accounts.proposer.key();
    proposal.class = class;
    proposal.title = title;
    proposal.target_program = target_program;
    proposal.instruction_data = instruction_data;
    proposal.quorum_weight = quorum_weight;
    proposal.for_votes = 0;
    proposal.against_votes = 0;
    proposal.start_voting_at = now;
    proposal.end_voting_at = now + VOTING_DURATION_SECS;
    proposal.execution_at = now + VOTING_DURATION_SECS + class.timelock_secs();
    proposal.status = ProposalStatus::Active;
    proposal.bump = ctx.bumps.proposal;
    Ok(())
}

#[derive(Accounts)]
pub struct VoteOnProposal<'info> {
    #[account(
        mut,
        seeds = [b"proposal", config.key().as_ref(), proposal.id.to_le_bytes().as_ref()],
        bump = proposal.bump
    )]
    pub proposal: Account<'info, Proposal>,
    #[account(
        seeds = [b"atlas_governance"],
        bump = config.bump
    )]
    pub config: Account<'info, GovernanceConfig>,
    #[account(
        mut,
        seeds = [b"ve_lock", lock.owner.as_ref()],
        bump = lock.bump
    )]
    pub lock: Account<'info, VeLock>,
    #[account(
        init,
        payer = signer,
        space = Vote::SPACE,
        seeds = [b"vote", proposal.key().as_ref(), lock.key().as_ref()],
        bump
    )]
    pub vote: Account<'info, Vote>,
    #[account(mut)]
    pub signer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

pub fn vote_handler(ctx: Context<VoteOnProposal>, in_favor: bool) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let proposal = &ctx.accounts.proposal;
    require!(
        proposal.status == ProposalStatus::Active,
        GovernanceError::InvalidProposalState
    );
    require!(now >= proposal.start_voting_at, GovernanceError::VotingNotStarted);
    require!(now <= proposal.end_voting_at, GovernanceError::VotingEnded);

    let lock = &ctx.accounts.lock;
    require!(
        ctx.accounts.signer.key() == lock.owner || ctx.accounts.signer.key() == lock.delegate,
        GovernanceError::NotAuthorized
    );
    // Expired locks must be withdrawn first; a lock whose unlock time has passed
    // carries no voting weight (spec §7.3).
    require!(lock.unlock_at > now, GovernanceError::LockExpired);
    require!(lock.weight > 0, GovernanceError::ZeroAmount);

    let vote = &mut ctx.accounts.vote;
    vote.voter = ctx.accounts.signer.key();
    vote.proposal = proposal.key();
    vote.lock = lock.key();
    vote.weight = lock.weight;
    vote.in_favor = in_favor;
    vote.bump = ctx.bumps.vote;

    let proposal = &mut ctx.accounts.proposal;
    if in_favor {
        proposal.for_votes = proposal
            .for_votes
            .checked_add(lock.weight)
            .ok_or(GovernanceError::MathOverflow)?;
    } else {
        proposal.against_votes = proposal
            .against_votes
            .checked_add(lock.weight)
            .ok_or(GovernanceError::MathOverflow)?;
    }
    Ok(())
}

#[derive(Accounts)]
pub struct FinalizeProposal<'info> {
    #[account(
        mut,
        seeds = [b"proposal", config.key().as_ref(), proposal.id.to_le_bytes().as_ref()],
        bump = proposal.bump
    )]
    pub proposal: Account<'info, Proposal>,
    pub config: Account<'info, GovernanceConfig>,
}

pub fn finalize_proposal_handler(ctx: Context<FinalizeProposal>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let proposal = &mut ctx.accounts.proposal;
    require!(
        proposal.status == ProposalStatus::Active,
        GovernanceError::InvalidProposalState
    );
    require!(now >= proposal.end_voting_at, GovernanceError::VotingEnded);

    let cast = proposal
        .for_votes
        .checked_add(proposal.against_votes)
        .ok_or(GovernanceError::MathOverflow)?;
    require!(cast >= proposal.quorum_weight, GovernanceError::QuorumNotMet);

    let passage = proposal.class.passage_percent() as u128;
    let for_pct = proposal
        .for_votes
        .checked_mul(100)
        .and_then(|n| n.checked_div(cast))
        .unwrap_or(0);
    proposal.status = if for_pct >= passage {
        ProposalStatus::Succeeded
    } else {
        ProposalStatus::Defeated
    };
    Ok(())
}

#[derive(Accounts)]
pub struct ExecuteProposal<'info> {
    #[account(
        mut,
        seeds = [b"proposal", config.key().as_ref(), proposal.id.to_le_bytes().as_ref()],
        bump = proposal.bump,
        constraint = executor.key() != proposal.proposer @ GovernanceError::SelfExecution
    )]
    pub proposal: Account<'info, Proposal>,
    pub config: Account<'info, GovernanceConfig>,
    #[account(mut)]
    pub executor: Signer<'info>,
}

pub fn execute_proposal_handler(ctx: Context<ExecuteProposal>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let proposal = &ctx.accounts.proposal;
    require!(
        proposal.status == ProposalStatus::Succeeded,
        GovernanceError::InvalidProposalState
    );
    require!(now >= proposal.execution_at, GovernanceError::VotingEnded);

    let instruction = Instruction {
        program_id: proposal.target_program,
        accounts: ctx
            .remaining_accounts
            .iter()
            .map(|acc| {
                if acc.is_writable {
                    anchor_lang::solana_program::instruction::AccountMeta::new(
                        *acc.key,
                        acc.is_signer,
                    )
                } else {
                    anchor_lang::solana_program::instruction::AccountMeta::new_readonly(
                        *acc.key,
                        acc.is_signer,
                    )
                }
            })
            .collect(),
        data: proposal.instruction_data.clone(),
    };
    invoke(&instruction, ctx.remaining_accounts)?;

    let proposal = &mut ctx.accounts.proposal;
    proposal.status = ProposalStatus::Executed;
    Ok(())
}
