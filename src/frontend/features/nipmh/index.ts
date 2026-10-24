export {
  NIPMH_CATALOG,
  STARTER_NIPMH_IDS,
  getNipmh,
  isNipmhId,
  nipmhUnlockCost,
  type NipmhId,
} from "./domain/NipmhCatalog";
export type {
  NipmhCategory,
  NipmhDefinition,
  NipmhEffect,
  NipmhFamily,
  NipmhTag,
} from "./domain/NipmhTypes";
export {
  DEFAULT_NIPMH_CAPACITY,
  NipmhRunInventory,
  validateNipmhRunSnapshot,
  type NipmhRunSnapshot,
} from "./application/NipmhRunInventory";
export {
  MAINTENANCE_STOCK_SIZE,
  MAX_NIPMH_CAPACITY,
  NipmhOperationSession,
  OPERATION_STAGE_COUNT,
  OPERATION_STAGE_DURATION_SECONDS,
  nipmhBuyPrice,
  nipmhCapacityUpgradePrice,
  operationStageCreditReward,
  type OperationStageMetrics,
  type OperationStageReward,
} from "./application/NipmhOperationSession";
export {
  NipmhCombatRuntime,
  type NipmhDamageResult,
  type NipmhEchoRequest,
  type NipmhKillResult,
  type NipmhStormRequest,
  type NipmhUpdateResult,
} from "./application/NipmhCombatRuntime";
export {
  beginNipmhOperation,
  clearActiveNipmhOperation,
  getActiveNipmhOperation,
  restartActiveNipmhOperation,
  type ActiveNipmhOperation,
  type BeginNipmhOperationOptions,
  type OperationPlayerProgress,
} from "./application/NipmhOperationRuntime";
export {
  nipmhTextureKey,
  preloadNipmhAssets,
} from "./presentation/NipmhAssets";
