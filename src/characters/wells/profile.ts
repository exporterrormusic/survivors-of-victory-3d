// Survivors of Victory card data (Character Select). MOBA kits are planned from it.
import { characterPortrait } from "../assets";
import type { CharacterProfile } from "../types";

export const profile: CharacterProfile = {
  accent: 0x667799,
  attack: 7,
  basicAttackDescription:
    "Piercing sniper shots deliver high precision damage.",
  burstDescription: "Summons Marian as a temporary combat ally.",
  burstName: "Echoes of Hope",
  crit: 30,
  description: "Time-traveler sniper with Bullet Time.",
  hp: 50,
  id: "wells",
  name: "WELLS",
  normalAttackDescription:
    "Seven-round sniper rifle pierces distant targets.",
  portraitPath: characterPortrait("wells"),
  speed: 64,
  specialDescription:
    "Hold the skill control to slow time. Consumes fuel that recharges over time.",
  specialName: "Mnemosyne Project",
  squad: "MNEMOSYNE",
  unlockCost: 12,
  weapon: "SNIPER RIFLE",
  weaponTag: "SR",
};
