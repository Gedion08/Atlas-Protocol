use anchor_lang::prelude::*;

#[error_code]
pub enum VaultError {
    #[msg("Fee basis points exceed the allowed maximum")]
    FeeBpsTooHigh,
    #[msg("Vault is not active")]
    VaultNotActive,
    #[msg("Vault is in emergency shutdown")]
    EmergencyShutdown,
    #[msg("Vault is paused; redemptions are gated")]
    VaultPaused,
    #[msg("Deposit below minimum")]
    BelowMinDeposit,
    #[msg("Amount must be greater than zero")]
    ZeroAmount,
    #[msg("Insufficient shares")]
    InsufficientShares,
    #[msg("Vault is empty")]
    EmptyVault,
    #[msg("Arithmetic overflow")]
    MathOverflow,
    #[msg("Unauthorized signer")]
    Unauthorized,
    #[msg("Signer is not the configured oracle")]
    InvalidOracle,
    #[msg("Oracle set requires at least three distinct signers")]
    TooFewOracleSigners,
    #[msg("Oracle set exceeds the maximum size")]
    OracleSetTooLarge,
    #[msg("Incorrect number of oracle signers or reported values")]
    OracleSignatureCount,
    #[msg("Duplicate oracle signer")]
    DuplicateOracleSigner,
    #[msg("Signer is not the configured risk engine")]
    InvalidRiskEngine,
    #[msg("Signer is not the configured governance")]
    InvalidGovernance,
    #[msg("Linked manager profile is invalid or belongs to another program")]
    InvalidManagerProfile,
    #[msg("Linked manager is not active")]
    ManagerNotActive,
    #[msg("Protocol config is not initialized")]
    ConfigNotInitialized,
    #[msg("Protocol config is already initialized")]
    ConfigAlreadyInitialized,
    #[msg("Token account owner does not match the expected recipient")]
    InvalidRecipient,
    #[msg("Single oracle mark exceeds the maximum allowed move")]
    ValueMoveTooLarge,
    #[msg("Withdrawal request not yet due")]
    NotDue,
    #[msg("Withdrawal request already settled")]
    AlreadySettled,
    #[msg("Fee escrow has not matured")]
    EscrowNotMature,
    #[msg("Fee escrow is empty")]
    EscrowEmpty,
    #[msg("Insurance reserve is above target")]
    ReserveAboveTarget,
    #[msg("Vault escrow lacks liquidity to settle fees")]
    InsufficientLiquidity,
    #[msg("Invalid protocol configuration")]
    InvalidConfig,
    #[msg("Rebalance is within the minimum interval cooldown")]
    RebalanceCooldown,
}
