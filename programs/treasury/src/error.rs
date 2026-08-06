use anchor_lang::prelude::*;

#[error_code]
pub enum TreasuryError {
    #[msg("Config already initialized")]
    AlreadyInitialized,
    #[msg("Unauthorized signer")]
    Unauthorized,
    #[msg("Amount must be greater than zero")]
    ZeroAmount,
    #[msg("Market price exceeds the premium cap over intrinsic value")]
    PriceTooHigh,
    #[msg("Buyback exceeds the per-period cap")]
    PeriodCapExceeded,
    #[msg("Withdrawal exceeds the governance cap")]
    WithdrawCapExceeded,
    #[msg("Arithmetic overflow")]
    MathOverflow,
    #[msg("Invalid configuration")]
    InvalidConfig,
    #[msg("Oracle set requires at least three distinct signers")]
    TooFewOracleSigners,
    #[msg("Oracle set exceeds the maximum size")]
    OracleSetTooLarge,
    #[msg("Incorrect number of oracle signers or attested prices")]
    OracleSignatureCount,
    #[msg("Duplicate oracle signer")]
    DuplicateOracleSigner,
    #[msg("Accounting period has not yet elapsed")]
    PeriodNotElapsed,
    #[msg("Revenue escrow lacks liquidity for the requested transfer")]
    InsufficientLiquidity,
}
