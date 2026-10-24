// Survivors of Victory card data (Character Select). MOBA kits are planned from it.
import { characterPortrait } from "../assets";
import type { CharacterProfile } from "../types";

export const profile: CharacterProfile = {
  accent: 0xff8033,
  attack: 3,
  basicAttackDescription:
    "Five-pellet shotgun blasts dominate close-range groups.",
  burstDescription:
    "Grants infinite ammunition, rapid fire, and 2.2x damage for five seconds.",
  burstName: "Assign Priority",
  crit: 20,
  description: "Shotgun specialist with explosive blasts.",
  hp: 50,
  id: "kilo",
  name: "KILO",
  normalAttackDescription: "Eight-shell shotgun fires a five-pellet spread.",
  portraitPath: characterPortrait("kilo"),
  speed: 64,
  specialDescription:
    "Pellet impacts trigger V-shaped explosions behind enemies.",
  specialName: "Explosive Shells",
  squad: "HEAVY GRAM",
  unlockCost: 5,
  weapon: "SHOTGUN",
  weaponTag: "SG",
};
