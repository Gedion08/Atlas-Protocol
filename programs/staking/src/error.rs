use anchor_lang::prelude::*;

#[error_code]
pub enum StakingError {
    #[msg("Config already initialized")]
    AlreadyInitialized,
    #[msg("Unauthorized signer")]
    Unauthorized,
    #[msg("Amount must be greater than zero")]
    ZeroAmount,
    #[msg("Bond has an active unbond request")]
    UnbondPending,
    #[msg("No unbond request pending")]
    NoUnbondPending,
    #[msg("Cooldown period has not elapsed")]
    CooldownNotElapsed,
    #[msg("Slash amount exceeds bonded amount")]
    SlashExceedsBond,
    #[msg("Arithmetic overflow")]
    MathOverflow,
    #[msg("Signer is not the claims committee")]
    InvalidCommittee,
    #[msg("Claim must be filed within the claim window")]
    ClaimWindowExpired,
    #[msg("Claim is not in the required state")]
    InvalidClaimState,
    #[msg("Reserve has no liquidity")]
    ReserveEmpty,
    #[msg("Invalid claim parameters")]
    InvalidClaim,
    #[msg("Invalid protocol configuration")]
    InvalidConfig,
    #[msg("Vault does not belong to the configured vault program")]
    InvalidVault,
    #[msg("Claimant does not hold vault shares")]
    NotVaultLp,
    #[msg("Claim amount exceeds the vault total value")]
    ClaimAmountTooLarge,
}
