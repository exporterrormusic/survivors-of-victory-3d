// Survivors of Victory card data (Character Select). MOBA kits are planned from it.
import { characterPortrait } from "../assets";
import type { CharacterProfile } from "../types";

export const profile: CharacterProfile = {
  accent: 0x66b3ff,
  attack: 7,
  basicAttackDescription: "Piercing sniper fire with high damage and range.",
  burstDescription:
    "Fires a 90-degree cone dealing heavy attack-scaled damage across massive range.",
  burstName: "Seven Dwarves",
  crit: 30,
  description: "Sniper with piercing shots and turrets.",
  hp: 50,
  id: "snow-white",
  name: "SNOW WHITE",
  normalAttackDescription:
    "Seven-round sniper rifle. Precise shots pierce targets at extreme range.",
  portraitPath: characterPortrait("snow-white"),
  speed: 64,
  specialDescription:
    "Deploys a turret with four missiles. Holds two charges that fully refill after 10 seconds.",
  specialName: "Auto-Turret",
  squad: "PIONEER",
  unlockCost: 0,
  weapon: "SNIPER RIFLE",
  weaponTag: "SR",
};
