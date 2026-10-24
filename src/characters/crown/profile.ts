// Survivors of Victory card data (Character Select). MOBA kits are planned from it.
import { characterPortrait } from "../assets";
import type { CharacterProfile } from "../types";

export const profile: CharacterProfile = {
  accent: 0xffd94d,
  attack: 2,
  basicAttackDescription:
    "Mounted minigun fire controls a broad forward lane.",
  burstDescription:
    "A massive golden blast fills the screen and deals extreme damage.",
  burstName: "Last Kingdom",
  crit: 15,
  description: "Minigun cavalry with a golden nova burst.",
  hp: 50,
  id: "crown",
  name: "CROWN",
  normalAttackDescription:
    "A hundred-round minigun fires continuously while Crown advances.",
  portraitPath: characterPortrait("crown"),
  speed: 64,
  specialDescription:
    "Summons Trombe and charges forward while invincible for 2.5 seconds.",
  specialName: "Summon Trombe",
  squad: "WHITE KNIGHT",
  unlockCost: 8,
  weapon: "MINIGUN",
  weaponTag: "MG",
};
