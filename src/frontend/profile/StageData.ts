import {
  readProfileSection,
  writeProfileSection,
} from "../persistence/ProfileStorage";

export type MissionModeId = "ark_siege" | "survival_round" | "endless_round" | "relay_run" | "salvage_run" | "stage_1" | "stage_3";

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
  readonly time: "day" | "dusk" | "night";
  readonly worldSize: number;
}

export interface StageSelection {
  readonly biome: string;
  readonly difficulty: number;
  readonly goddessFall: boolean;
  readonly modeId: MissionModeId;
  readonly time: "day" | "dusk" | "night";
  readonly zoneId: string;
}

// The deploy screen offers the two survival modes. Ark Siege (?mission=ark_siege), the Test Range
// (?run=test-range) and the archived MOBA battlegrounds (?hero=<id>&map=three-lane|single-lane)
// still open from their links.
export const MISSION_MODES: readonly MissionModeDefinition[] = [
  {
    description: "Survive 10 minutes, then defeat Obelisk. Win for 1 Rapture Core.",
    endless: false,
    id: "survival_round",
    name: "WAVE",
    unlockAfter: null,
  },
  {
    description: "The horde never stops. Obelisk returns every 10 minutes. First kill earns 1 Rapture Core.",
    endless: true,
    id: "endless_round",
    name: "ENDLESS",
    unlockAfter: null,
  },
] as const;

const preview = (file: string): string => `assets/menus/stage-select/${file}`;

/** Every zone, including ones kept out of Stage Select (still reachable by saved id and test links). */
export const ALL_OPERATION_ZONES: readonly OperationZoneDefinition[] = [
  {
    biome: "ark_outskirts",
    id: "volcano_day",
    mapScale: "standard",
    matchDurationSeconds: 600,
    name: "ASHEN CALDERA",
    previewPath: preview("caldera-day-v3.png"),
    subtitle: "ERUPTING",
    time: "day",
    worldSize: 4000,
  },
  {
    biome: "ark_outskirts",
    id: "outskirts_day",
    mapScale: "standard",
    matchDurationSeconds: 600,
    name: "ARK OUTSKIRTS",
    previewPath: preview("outskirts-day-v2.png"),
    subtitle: "OVERCAST",
    time: "day",
    worldSize: 4000,
  },
  {
    biome: "ark_outskirts",
    id: "outskirts_dusk",
    mapScale: "standard",
    matchDurationSeconds: 600,
    name: "ARK OUTSKIRTS",
    previewPath: preview("outskirts-dusk-v2.png"),
    subtitle: "DUSK",
    time: "dusk",
    worldSize: 4000,
  },
  {
    biome: "ark_outskirts",
    id: "outskirts_night",
    mapScale: "standard",
    matchDurationSeconds: 600,
    name: "ARK OUTSKIRTS",
    previewPath: preview("outskirts-night-v2.png"),
    subtitle: "NIGHT",
    time: "night",
    worldSize: 4000,
  },
  {
    biome: "sakura_grove",
    id: "sakura_day",
    mapScale: "standard",
    matchDurationSeconds: 600,
    name: "SAKURA GROVE",
    previewPath: preview("sakura-day.png"),
    subtitle: "OVERCAST",
    time: "day",
    worldSize: 4000,
  },
  {
    biome: "sakura_grove",
    id: "sakura_dusk",
    mapScale: "standard",
    matchDurationSeconds: 600,
    name: "SAKURA GROVE",
    previewPath: preview("sakura-dusk.png"),
    subtitle: "DUSK",
    time: "dusk",
    worldSize: 4000,
  },
  {
    biome: "sakura_grove",
    id: "sakura_night",
    mapScale: "large",
    matchDurationSeconds: 600,
    name: "SAKURA GROVE",
    previewPath: preview("sakura-night.png"),
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
    previewPath: preview("frozen-day-v2.png"),
    subtitle: "DAY",
    time: "day",
    worldSize: 6800,
  },
  {
    biome: "snowfield",
    id: "snow_night",
    mapScale: "large",
    matchDurationSeconds: 600,
    name: "THE FROZEN NORTH",
    previewPath: preview("frozen-night-v2.png"),
    subtitle: "NIGHT",
    time: "night",
    worldSize: 4400,
  },
  {
    biome: "dead_city",
    id: "city_day",
    mapScale: "standard",
    matchDurationSeconds: 600,
    name: "GREY RUINS",
    previewPath: preview("grey-ruins.png"),
    subtitle: "OVERCAST",
    time: "day",
    worldSize: 4000,
  },
  {
    biome: "rain_forest",
    id: "storm",
    mapScale: "large",
    matchDurationSeconds: 600,
    name: "STORMBRINGER",
    previewPath: preview("stormbringer.png"),
    subtitle: "NIGHT",
    time: "night",
    worldSize: 6400,
  },
  {
    biome: "haunted_forest",
    id: "haunted-forest",
    mapScale: "standard",
    matchDurationSeconds: 600,
    name: "HAUNTED PINE FOREST",
    previewPath: preview("forest-night-v3.png"),
    subtitle: "NIGHT",
    time: "night",
    worldSize: 4000,
  },
] as const;

/** Kept, but not offered at first launch. */
// Ark Outskirts is being reworked into the Ashen Caldera; its zones stay for saved ids and links.
const SHELVED_ZONES = new Set(["city_day", "outskirts_day", "outskirts_dusk", "outskirts_night", "sakura_dusk"]);
/** The zones Stage Select offers. */
export const OPERATION_ZONES: readonly OperationZoneDefinition[] =
  ALL_OPERATION_ZONES.filter((zone) => !SHELVED_ZONES.has(zone.id));

export function operationZone(zoneId: string): OperationZoneDefinition {
  if(zoneId === "snow_dusk") zoneId = "snow_day";
  // Retired Hollow saves retain their time variation in the consolidated city.
  if(['city_dusk','city_night','grey-ruins','grey_ruins'].includes(zoneId))zoneId='city_day';
  if(zoneId==='hollow'||zoneId==='the_hollow')zoneId='city_day';
  else if(zoneId.startsWith('hollow_'))zoneId='city_day';
  return (
    ALL_OPERATION_ZONES.find((zone) => zone.id === zoneId) ?? OPERATION_ZONES[0]!
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


