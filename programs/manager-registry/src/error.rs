use anchor_lang::prelude::*;

#[error_code]
pub enum RegistryError {
    #[msg("Manager profile already exists")]
    AlreadyRegistered,
    #[msg("Name exceeds maximum length")]
    NameTooLong,
    #[msg("Unauthorized signer")]
    Unauthorized,
    #[msg("Score components must be between 0 and 100")]
    InvalidScore,
    #[msg("Manager is not active")]
    NotActive,
    #[msg("Signer is not the configured oracle")]
    InvalidOracle,
    #[msg("Signer is not the configured governance")]
    InvalidGovernance,
    #[msg("Bond account is insufficient or belongs to another program")]
    BondInsufficient,
    #[msg("Manager bond does not meet the required amount")]
    BondBelowRequired,
    #[msg("Protocol config is already initialized")]
    ConfigAlreadyInitialized,
    #[msg("Invalid protocol configuration")]
    InvalidConfig,
    #[msg("Cannot set status from the current state")]
    InvalidTransition,
}
