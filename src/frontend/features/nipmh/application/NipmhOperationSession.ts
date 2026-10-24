import { getNipmh, type NipmhId } from "../domain/NipmhCatalog";
import { NipmhRunInventory } from "./NipmhRunInventory";

export const OPERATION_STAGE_COUNT = 5;
export const OPERATION_STAGE_DURATION_SECONDS = 120;
export const MAX_NIPMH_CAPACITY = 9;
export const MAINTENANCE_STOCK_SIZE = 8;

export interface OperationStageMetrics {
  readonly elapsedSeconds: number;
  readonly parSeconds: number;
}

export interface OperationStageReward {
  readonly completedStage: number;
  readonly creditsAwarded: number;
  readonly nextStage: number | null;
}

export function nipmhBuyPrice(id: NipmhId): number {
  return 80 + getNipmh(id).cost * 60;
}

export function nipmhCapacityUpgradePrice(capacity: number): number {
  if (!Number.isSafeInteger(capacity) || capacity < 3)
    throw new RangeError("NIPMH capacity must be at least 3.");
  return 300 + (capacity - 3) * 150;
}

export function operationStageCreditReward(
  metrics: OperationStageMetrics,
): number {
  const elapsed = Math.max(0, metrics.elapsedSeconds);
  const par = Math.max(1, metrics.parSeconds);
  const timeSavedRatio = Math.max(0, Math.min(1, (par - elapsed) / par));
  const multiplier = 1 + timeSavedRatio * 0.5;
  return Math.round(300 * multiplier);
}

export class NipmhOperationSession {
  public readonly inventory: NipmhRunInventory;
  private creditsValue = 0;
  private initialNipmhIdValue?: NipmhId;
  private lastRewardValue?: OperationStageReward;
  private maintenanceStockIdsValue: NipmhId[] = [];
  private previousMaintenanceStockIds = new Set<NipmhId>();
  private stageValue = 1;

  public constructor(
    eligibleIds: Iterable<NipmhId>,
    private readonly totalStagesValue = OPERATION_STAGE_COUNT,
    private readonly random: () => number = Math.random,
  ) {
    if (!Number.isSafeInteger(totalStagesValue) || totalStagesValue < 1)
      throw new RangeError("An operation must contain at least one stage.");
    this.inventory = new NipmhRunInventory(eligibleIds);
  }

  public get credits(): number {
    return this.creditsValue;
  }

  public get currentStage(): number {
    return this.stageValue;
  }

  public get isFinalStage(): boolean {
    return this.stageValue >= this.totalStagesValue;
  }

  public get initialNipmhId(): NipmhId | undefined {
    return this.initialNipmhIdValue;
  }

  public get lastReward(): OperationStageReward | undefined {
    return this.lastRewardValue;
  }

  public get maintenanceStockIds(): readonly NipmhId[] {
    return this.maintenanceStockIdsValue;
  }

  public get totalStages(): number {
    return this.totalStagesValue;
  }

  public completeCurrentStage(
    metrics: OperationStageMetrics,
  ): OperationStageReward {
    const completedStage = this.stageValue;
    const creditsAwarded = operationStageCreditReward(metrics);
    this.creditsValue += creditsAwarded;
    if (!this.isFinalStage) {
      this.stageValue += 1;
      this.refreshMaintenanceStock();
    }
    const reward = {
      completedStage,
      creditsAwarded,
      nextStage:
        completedStage < this.totalStagesValue ? this.stageValue : null,
    } satisfies OperationStageReward;
    this.lastRewardValue = reward;
    return reward;
  }

  public buy(id: NipmhId): boolean {
    const price = nipmhBuyPrice(id);
    if (
      this.creditsValue < price ||
      !this.maintenanceStockIdsValue.includes(id) ||
      !this.inventory.grant(id)
    )
      return false;
    this.creditsValue -= price;
    this.maintenanceStockIdsValue = this.maintenanceStockIdsValue.filter(
      (stockId) => stockId !== id,
    );
    return true;
  }

  public equip(id: NipmhId): boolean {
    return this.inventory.equip(id);
  }

  public selectInitialNipmh(id: NipmhId): boolean {
    if (
      this.stageValue !== 1 ||
      this.lastRewardValue !== undefined ||
      !this.inventory.eligibleIds.has(id) ||
      getNipmh(id).cost > this.inventory.capacity
    )
      return false;

    if (this.initialNipmhIdValue === id) {
      if (this.inventory.equippedIds.includes(id)) return true;
      return this.inventory.equip(id);
    }

    this.inventory.clearStartingSelection();

    if (!this.inventory.grant(id) || !this.inventory.equip(id)) return false;
    this.initialNipmhIdValue = id;
    return true;
  }

  public unequip(id: NipmhId): boolean {
    return this.inventory.unequip(id);
  }

  public upgradeCapacity(): boolean {
    if (this.inventory.capacity >= MAX_NIPMH_CAPACITY) return false;
    const price = nipmhCapacityUpgradePrice(this.inventory.capacity);
    if (this.creditsValue < price) return false;
    this.creditsValue -= price;
    this.inventory.upgradeCapacity();
    return true;
  }

  private refreshMaintenanceStock(): void {
    const candidates = this.inventory.availableIds;
    const newCandidates = candidates.filter(
      (id) => !this.previousMaintenanceStockIds.has(id),
    );
    const repeatCandidates = candidates.filter((id) =>
      this.previousMaintenanceStockIds.has(id),
    );
    const nextStock = [
      ...this.shuffled(newCandidates),
      ...this.shuffled(repeatCandidates),
    ].slice(0, MAINTENANCE_STOCK_SIZE);
    this.maintenanceStockIdsValue = nextStock;
    this.previousMaintenanceStockIds = new Set(nextStock);
  }

  private shuffled(ids: readonly NipmhId[]): NipmhId[] {
    const result = [...ids];
    for (let index = result.length - 1; index > 0; index -= 1) {
      const randomValue = Math.max(0, Math.min(0.999_999, this.random()));
      const swapIndex = Math.floor(randomValue * (index + 1));
      [result[index], result[swapIndex]] = [result[swapIndex]!, result[index]!];
    }
    return result;
  }
}
