export { ApiError, AtlasClient } from "./client.js";
export type { AtlasClientOptions, WalletSigner } from "./client.js";
export type {
  DepositInput,
  InvestorPosition,
  InvestorSummary,
  LeaderboardEntry,
  ManagerPerformance,
  ManagerProfile,
  RiskDecision,
  Strategy,
  StrategyType,
  StrategyUpload,
  Vault,
  WithdrawInput,
} from "atlas-types";
export {
  validateStrategyParams,
  getStrategySchema,
  listStrategyTypes,
  nextVersion,
  compareVersions,
  isNewerVersion,
  computeSchemaHash,
  diffVersions,
  STRATEGY_PARAMS,
} from "strategy-sdk";
export type {
  ValidationResult,
  VersionedStrategy,
  StrategyRegistryEntry,
  RegistryVersion,
} from "strategy-sdk";
