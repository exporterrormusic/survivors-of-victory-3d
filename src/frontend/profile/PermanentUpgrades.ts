export type PermanentUpgradeId = "atk" | "hp" | "speed" | "crit" | "xp";

export interface PermanentUpgradeDefinition {
  readonly accent: number;
  readonly baseCost: number;
  readonly description: string;
  readonly glyph: string;
  readonly id: PermanentUpgradeId;
  readonly maxLevel: number;
  readonly name: string;
  readonly perLevel: number;
  readonly unit: "%" | "HP";
}

export const PERMANENT_UPGRADES: readonly PermanentUpgradeDefinition[] = [
  {
    accent: 0xffd23f,
    baseCost: 1,
    description: "+25% Attack Damage per level",
    glyph: "ATK",
    id: "atk",
    maxLevel: 99,
    name: "Attack",
    perLevel: 25,
    unit: "%",
  },
  {
    accent: 0xff6b61,
    baseCost: 1,
    description: "+1 Max HP per level",
    glyph: "HP",
    id: "hp",
    maxLevel: 99,
    name: "HP",
    perLevel: 1,
    unit: "HP",
  },
  {
    accent: 0x80e0a8,
    baseCost: 1,
    description: "+5% Movement Speed per level",
    glyph: "SPD",
    id: "speed",
    maxLevel: 99,
    name: "Speed",
    perLevel: 5,
    unit: "%",
  },
  {
    accent: 0xffa54d,
    baseCost: 1,
    description: "+2% Critical Chance per level",
    glyph: "CRT",
    id: "crit",
    maxLevel: 99,
    name: "Critical",
    perLevel: 2,
    unit: "%",
  },
  {
    accent: 0x5bd2f7,
    baseCost: 2,
    description: "+5% Experience Gain per level",
    glyph: "EXP",
    id: "xp",
    maxLevel: 99,
    name: "Experience",
    perLevel: 5,
    unit: "%",
  },
] as const;

export type PermanentUpgradeLevels = Record<PermanentUpgradeId, number>;

export const DEFAULT_PERMANENT_UPGRADE_LEVELS: PermanentUpgradeLevels = {
  atk: 0,
  crit: 0,
  hp: 0,
  speed: 0,
  xp: 0,
};

export function permanentUpgradeCost(
  upgrade: PermanentUpgradeDefinition,
  level: number,
): number {
  return upgrade.baseCost + Math.floor(Math.max(0, level) / 10);
}

export function formatPermanentUpgradeBonus(
  upgrade: PermanentUpgradeDefinition,
  level: number,
): string {
  const amount = upgrade.perLevel * Math.max(0, level);
  return upgrade.unit === "%" ? `+${amount}%` : `+${amount} ${upgrade.unit}`;
}
