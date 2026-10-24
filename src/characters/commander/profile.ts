// Survivors of Victory card data (Character Select). MOBA kits are planned from it.
import { characterPortrait } from "../assets";
import type { CharacterProfile } from "../types";

export const profile: CharacterProfile = {
  accent: 0xb87338,
  attack: 6,
  basicAttackDescription:
    "Disciplined assault-rifle fire balances reach and damage.",
  burstDescription:
    "Deploys Scarlet, Snow White, and Rapunzel under the Commander's orders.",
  burstName: "Goddess Squad",
  crit: 15,
  description: "Mercenary commander whose VAPAUS blood defies death.",
  hp: 50,
  id: "commander",
  name: "COMMANDER",
  normalAttackDescription:
    "Thirty-round assault rifle provides reliable automatic fire.",
  portraitPath: characterPortrait("commander"),
  speed: 54,
  specialDescription:
    "His VAPAUS healing factor restores health over time and can keep him standing through lethal pressure.",
  specialName: "Good Genes",
  squad: "GODDESS",
  unlockCost: 3,
  weapon: "ASSAULT RIFLE",
  weaponTag: "AR",
};
