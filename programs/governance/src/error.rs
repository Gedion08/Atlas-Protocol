use anchor_lang::prelude::*;

#[error_code]
pub enum GovernanceError {
    #[msg("Config already initialized")]
    AlreadyInitialized,
    #[msg("Unauthorized signer")]
    Unauthorized,
    #[msg("Amount must be greater than zero")]
    ZeroAmount,
    #[msg("Lock duration out of allowed bounds")]
    InvalidLockDuration,
    #[msg("Lock is still active")]
    LockActive,
    #[msg("Lock has already expired")]
    LockExpired,
    #[msg("Lock has already been swept")]
    LockSwept,
    #[msg("Signer is neither the owner nor the delegate")]
    NotAuthorized,
    #[msg("Proposal already voted by this lock")]
    AlreadyVoted,
    #[msg("Voting has not started")]
    VotingNotStarted,
    #[msg("Voting has ended")]
    VotingEnded,
    #[msg("Proposal is not in the required state")]
    InvalidProposalState,
    #[msg("Proposal did not meet quorum")]
    QuorumNotMet,
    #[msg("Proposal did not reach required majority")]
    MajorityNotMet,
    #[msg("Proposer cannot execute their own proposal")]
    SelfExecution,
    #[msg("Invalid proposal class")]
    InvalidClass,
    #[msg("Instruction data too large")]
    InstructionTooLarge,
    #[msg("Arithmetic overflow")]
    MathOverflow,
}
