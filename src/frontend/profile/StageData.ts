import {
  readProfileSection,
  writeProfileSection,
} from "../persistence/ProfileStorage";

export type MissionModeId = "stage_1" | "stage_3";

export interface MissionModeDefinition {
  readonly description: string;
  readonly endless: boolean;
  readonly id: MissionModeId;
  readonly name: string;
  readonly unlockAfter: MissionModeId | null;
}

export interface OperationZoneDefinition {
  readonly biome: string;
  readonly id: string;
  readonly mapScale: "standard" | "large";
  readonly matchDurationSeconds: number;
  readonly name: string;
  readonly previewPath: string;
  readonly subtitle: string;
  readonly time: "day" | "night";
  readonly worldSize: number;
}

export interface StageSelection {
  readonly biome: string;
  readonly difficulty: number;
  readonly goddessFall: boolean;
  readonly modeId: MissionModeId;
  readonly time: "day" | "night";
  readonly zoneId: string;
}

export const MISSION_MODES: readonly MissionModeDefinition[] = [
  {
    description:
      "Outpost Hollow: three lanes and jungle paths. Destroy the enemy Core.",
    endless: false,
    id: "stage_1",
    name: "THREE LANES",
    unlockAfter: null,
  },
  {
    description: "Lost Outpost: one lane with side pockets. Push through to the enemy Core.",
    endless: false,
    id: "stage_3",
    name: "ONE LANE",
    unlockAfter: null,
  },
] as const;

const preview = (file: string): string => `assets/menus/stage-select/${file}`;

export const OPERATION_ZONES: readonly OperationZoneDefinition[] = [
  {
    biome: "sakura_grove",
    id: "sakura_day",
    mapScale: "standard",
    matchDurationSeconds: 600,
    name: "ARK OUTSKIRTS",
    previewPath: preview("forest.jpg"),
    subtitle: "DAY",
    time: "day",
    worldSize: 4000,
  },
  {
    biome: "sakura_grove",
    id: "sakura_night",
    mapScale: "large",
    matchDurationSeconds: 600,
    name: "ARK OUTSKIRTS",
    previewPath: preview("rapturefield2.jpg"),
    subtitle: "NIGHT",
    time: "night",
    worldSize: 6200,
  },
  {
    biome: "snowfield",
    id: "snow_day",
    mapScale: "large",
    matchDurationSeconds: 600,
    name: "THE FROZEN NORTH",
    previewPath: preview("snow-day.jpg"),
    subtitle: "DAY",
    time: "day",
    worldSize: 6800,
  },
  {
    biome: "snowfield",
    id: "snow_night",
    mapScale: "standard",
    matchDurationSeconds: 600,
    name: "THE FROZEN NORTH",
    previewPath: preview("snow-night.jpg"),
    subtitle: "NIGHT",
    time: "night",
    worldSize: 4400,
  },
  {
    biome: "rain_forest",
    id: "storm",
    mapScale: "large",
    matchDurationSeconds: 600,
    name: "STORMBRINGER",
    previewPath: preview("rapturefield1.jpg"),
    subtitle: "NIGHT",
    time: "night",
    worldSize: 6400,
  },
] as const;

export function operationZone(zoneId: string): OperationZoneDefinition {
  return (
    OPERATION_ZONES.find((zone) => zone.id === zoneId) ?? OPERATION_ZONES[0]!
  );
}

export function loadPreferredDifficulty(): number {
  const value = readProfileSection<{ difficulty?: unknown }>(
    "stage",
    {},
  ).difficulty;
  return typeof value === "number" && Number.isInteger(value)
    ? Math.max(1, Math.min(100, value))
    : 1;
}

export function savePreferredDifficulty(difficulty: number): void {
  writeProfileSection("stage", {
    difficulty: Math.max(1, Math.min(100, Math.round(difficulty))),
  });
}

export function enemyAttackScale(difficulty: number): number {
  return 1 + 0.25 * (difficulty - 1);
}

/**
 * Difficulty should make the horde more dangerous, not turn every unit into
 * a damage sponge. Run levels award talent points rather than raw attack, so
 * enemy health grows at less than half the rate of enemy attack.
 */
export function enemyHealthScale(difficulty: number): number {
  return 1 + 0.1 * (difficulty - 1);
}

export function formatScale(value: number): string {
  return `x${Number.isInteger(value) ? value : value.toFixed(2)}`;
}
