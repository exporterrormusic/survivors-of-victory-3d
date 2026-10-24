// Survivors of Victory card data (Character Select). MOBA kits are planned from it.
import { characterPortrait } from "../assets";
import type { CharacterProfile } from "../types";

export const profile: CharacterProfile = {
  accent: 0xb333e6,
  attack: 2,
  basicAttackDescription: "Dual SMG bursts pressure nearby enemies.",
  burstDescription:
    "Applies an eight-second damage effect to visible enemies and drains their vitality.",
  burstName: "Words Can Kill",
  crit: 15,
  description: "SMG operator with charm and life drain.",
  hp: 50,
  id: "sin",
  name: "SIN",
  normalAttackDescription:
    "Thirty-round dual SMGs maintain close-range suppression.",
  portraitPath: characterPortrait("sin"),
  speed: 68,
  specialDescription:
    "Charms normal enemies in an area and forces them to fight for you.",
  specialName: "Heavy Talker",
  squad: "REAL KINDNESS",
  unlockCost: 8,
  weapon: "SUBMACHINE GUN",
  weaponTag: "SMG",
};
