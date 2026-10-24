import type { CharacterId } from "../../../profile/Ids";
import type { StageSelection } from "../../../profile/StageData";
import {
  createOperationStagePlans,
  type OperationStagePlan,
} from "../../objectives/OperationObjectives";
import type { NipmhId } from "../domain/NipmhCatalog";
import { NipmhOperationSession } from "./NipmhOperationSession";

export interface OperationPlayerProgress {
  readonly experience: number;
  readonly health: number;
  readonly level: number;
  readonly maxHealth: number;
  readonly skillPoints: number;
  readonly talentRanks: Readonly<Record<string, number>>;
}

export interface ActiveNipmhOperation {
  readonly characterId: CharacterId;
  readonly session: NipmhOperationSession;
  playerProgress?: OperationPlayerProgress;
  readonly stagePlans: readonly OperationStagePlan[];
  readonly stagePlan: OperationStagePlan;
  readonly stageSelection: StageSelection;
}

export interface BeginNipmhOperationOptions {
  readonly characterId: CharacterId;
  readonly eligibleIds: Iterable<NipmhId>;
  readonly random?: () => number;
  readonly stageSelection: StageSelection;
}

let activeOperation: ActiveNipmhOperation | undefined;

export function beginNipmhOperation(
  options: BeginNipmhOperationOptions,
): ActiveNipmhOperation {
  const random = options.random ?? Math.random;
  const session = new NipmhOperationSession(
    options.eligibleIds,
    undefined,
    random,
  );
  const stagePlans = createOperationStagePlans(
    options.stageSelection,
    session.totalStages,
    random,
  );
  activeOperation = {
    characterId: options.characterId,
    session,
    stagePlans,
    get stagePlan() {
      return (
        stagePlans[session.currentStage - 1] ??
        stagePlans[stagePlans.length - 1]!
      );
    },
    get stageSelection() {
      return this.stagePlan.selection;
    },
  };
  return activeOperation;
}

export function getActiveNipmhOperation(): ActiveNipmhOperation | undefined {
  return activeOperation;
}

export function clearActiveNipmhOperation(): void {
  activeOperation = undefined;
}

export function restartActiveNipmhOperation():
  ActiveNipmhOperation | undefined {
  if (activeOperation === undefined) return undefined;
  const initialNipmhId = activeOperation.session.initialNipmhId;
  const restarted = beginNipmhOperation({
    characterId: activeOperation.characterId,
    eligibleIds: activeOperation.session.inventory.eligibleIds,
    stageSelection:
      activeOperation.stagePlans[0]?.selection ??
      activeOperation.stageSelection,
  });
  if (initialNipmhId !== undefined)
    restarted.session.selectInitialNipmh(initialNipmhId);
  return restarted;
}
