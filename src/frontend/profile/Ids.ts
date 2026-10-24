// Characters live in src/characters; this module keeps the Survivors import path.
export { CHARACTER_IDS, isCharacterId, type CharacterId } from "../../characters/ids";

export const ENEMY_IDS = [
  "basic",
  "ranged",
  "tank",
  "shielder",
  "exploder",
  "elite",
  "boss",
  "super_boss",
  "swarmer",
  "trooper",
  "marauder",
  "brute",
  "enforcer",
  "harrier",
  "devastator",
  "skitter",
  "lunger",
  "warden",
  "breaker",
  "colossus",
  "leviathan",
  "future_marian",
  "n01_queen",
] as const;

export type EnemyId = (typeof ENEMY_IDS)[number];

const ENEMY_ID_SET: ReadonlySet<string> = new Set(ENEMY_IDS);

export function isEnemyId(value: unknown): value is EnemyId {
  return typeof value === "string" && ENEMY_ID_SET.has(value);
}
