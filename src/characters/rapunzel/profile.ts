// Survivors of Victory card data (Character Select). MOBA kits are planned from it.
import { characterPortrait } from "../assets";
import type { CharacterProfile } from "../types";

export const profile: CharacterProfile = {
  accent: 0xffd94d,
  attack: 15,
  basicAttackDescription: "Heavy explosive rockets damage clustered enemies.",
  burstDescription:
    "Fully heals, stuns every enemy for four seconds, and grants eight seconds of invincibility.",
  burstName: "Garden of Shangri-La",
  crit: 10,
  description: "Rocket launcher with healing abilities.",
  hp: 50,
  id: "rapunzel",
  name: "RAPUNZEL",
  normalAttackDescription:
    "Four-round rocket launcher with wide blast coverage.",
  portraitPath: characterPortrait("rapunzel"),
  speed: 62,
  specialDescription:
    "Creates a healing zone restoring 3% max HP per second for nine seconds.",
  specialName: "Divine Blessing",
  squad: "PIONEER",
  unlockCost: 3,
  weapon: "ROCKET LAUNCHER",
  weaponTag: "RL",
};
