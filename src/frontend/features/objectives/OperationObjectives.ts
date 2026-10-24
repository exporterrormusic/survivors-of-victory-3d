import type { EnemyId } from "../../profile/Ids";
import {
  OPERATION_ZONES,
  operationZone,
  type StageSelection,
} from "../../profile/StageData";

export type OperationObjectiveKind =
  | "exterminate"
  | "priority-target"
  | "rescue"
  | "supply"
  | "survive"
  | "final-target";

export interface OperationObjectivePlan {
  readonly instruction: string;
  readonly kind: OperationObjectiveKind;
  readonly parSeconds: number;
  readonly target: number;
  readonly targetEnemyId?: EnemyId;
  readonly title: string;
}

export interface OperationStagePlan {
  readonly mapSeed: string;
  readonly objective: OperationObjectivePlan;
  readonly selection: StageSelection;
  readonly stageNumber: number;
}

const RANDOM_OBJECTIVE_KINDS: readonly OperationObjectiveKind[] = [
  "exterminate",
  "survive",
  "rescue",
  "supply",
  "priority-target",
];

const PRIORITY_TARGETS: readonly EnemyId[] = [
  "brute",
  "enforcer",
  "devastator",
  "colossus",
];

export function createOperationStagePlans(
  initialSelection: StageSelection,
  totalStages: number,
  random: () => number = Math.random,
): readonly OperationStagePlan[] {
  if (!Number.isSafeInteger(totalStages) || totalStages < 1)
    throw new RangeError("An operation must contain at least one stage.");

  const plans: OperationStagePlan[] = [];
  const usedZones = new Set<string>();
  let previousKind: OperationObjectiveKind | undefined;

  for (let stageNumber = 1; stageNumber <= totalStages; stageNumber += 1) {
    const finalStage = stageNumber === totalStages;
    const selection =
      stageNumber === 1
        ? { ...initialSelection }
        : pickStageSelection(
            initialSelection,
            usedZones,
            finalStage ? "final-target" : undefined,
            random,
          );
    const objective = finalStage
      ? objectiveFor("final-target", stageNumber, random)
      : pickObjective(stageNumber, selection.zoneId, previousKind, random);
    const mapSeed = `${selection.zoneId}-${stageNumber}-${Math.floor(
      clampRandom(random()) * 1_000_000_000,
    )}`;
    plans.push({ mapSeed, objective, selection, stageNumber });
    usedZones.add(selection.zoneId);
    previousKind = objective.kind;
  }
  return plans;
}

export function objectiveFor(
  kind: OperationObjectiveKind,
  stageNumber: number,
  random: () => number = Math.random,
): OperationObjectivePlan {
  const stage = Math.max(1, Math.floor(stageNumber));
  switch (kind) {
    case "exterminate": {
      const target = 45 + stage * 20;
      return {
        instruction: `DESTROY ${target} RAPTURE UNITS`,
        kind,
        parSeconds: 105 + stage * 5,
        target,
        title: "EXTERMINATION",
      };
    }
    case "survive": {
      const target = 75 + stage * 10;
      return {
        instruction: `SURVIVE FOR ${formatDuration(target)}`,
        kind,
        parSeconds: target,
        target,
        title: "HOLD THE LINE",
      };
    }
    case "rescue": {
      const target = stage >= 3 ? 3 : 2;
      return {
        instruction: `LOCATE ${target} SURVIVORS`,
        kind,
        parSeconds: 180 + stage * 15,
        target,
        title: "SEARCH AND RESCUE",
      };
    }
    case "supply": {
      const target = stage >= 3 ? 4 : 3;
      return {
        instruction: `RECOVER ${target} SUPPLY CACHES`,
        kind,
        parSeconds: 110 + stage * 5,
        target,
        title: "SUPPLY RECOVERY",
      };
    }
    case "priority-target": {
      const index = Math.floor(clampRandom(random()) * PRIORITY_TARGETS.length);
      return {
        instruction: "ELIMINATE THE PRIORITY TARGET",
        kind,
        parSeconds: 120,
        target: 1,
        targetEnemyId: PRIORITY_TARGETS[index]!,
        title: "TARGET ELIMINATION",
      };
    }
    case "final-target":
      return {
        instruction: "ELIMINATE RAPTURE QUEEN N01",
        kind,
        parSeconds: 150,
        target: 1,
        targetEnemyId: "n01_queen",
        title: "FINAL TARGET",
      };
  }
}

export function objectiveRequiresLargeMap(
  kind: OperationObjectiveKind,
): boolean {
  return kind === "rescue" || kind === "supply";
}

function pickObjective(
  stageNumber: number,
  zoneId: string,
  previousKind: OperationObjectiveKind | undefined,
  random: () => number,
): OperationObjectivePlan {
  const zone = operationZone(zoneId);
  const candidates = RANDOM_OBJECTIVE_KINDS.filter(
    (kind) =>
      kind !== previousKind &&
      (!objectiveRequiresLargeMap(kind) || zone.mapScale === "large") &&
      (stageNumber > 1 || kind !== "priority-target"),
  );
  const index = Math.floor(clampRandom(random()) * candidates.length);
  return objectiveFor(candidates[index] ?? "exterminate", stageNumber, random);
}

function pickStageSelection(
  base: StageSelection,
  usedZones: ReadonlySet<string>,
  forcedKind: OperationObjectiveKind | undefined,
  random: () => number,
): StageSelection {
  const compatible = OPERATION_ZONES.filter(
    (zone) =>
      (!objectiveRequiresLargeMap(forcedKind ?? "exterminate") ||
        zone.mapScale === "large") &&
      !usedZones.has(zone.id),
  );
  const fallback = OPERATION_ZONES.filter(
    (zone) =>
      !objectiveRequiresLargeMap(forcedKind ?? "exterminate") ||
      zone.mapScale === "large",
  );
  const pool = compatible.length > 0 ? compatible : fallback;
  const zone = pool[Math.floor(clampRandom(random()) * pool.length)]!;
  return {
    biome: zone.biome,
    difficulty: base.difficulty,
    goddessFall: base.goddessFall,
    modeId: base.modeId,
    time: zone.time,
    zoneId: zone.id,
  };
}

function clampRandom(value: number): number {
  return Math.max(0, Math.min(0.999_999, value));
}

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0");
  return `${minutes}:${remainder}`;
}
