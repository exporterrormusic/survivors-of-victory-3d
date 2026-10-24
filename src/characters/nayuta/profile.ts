// Survivors of Victory card data (Character Select). MOBA kits are planned from it.
import { characterPortrait } from "../assets";
import type { CharacterProfile } from "../types";

export const profile: CharacterProfile = {
  accent: 0x9960e6,
  attack: 2,
  basicAttackDescription:
    "Rapid SMG fire maintains pressure on nearby targets.",
  burstDescription:
    "A purple galaxy explosion damages every enemy currently on screen.",
  burstName: "Asceticism",
  crit: 20,
  description: "SMG operator with clone summoning.",
  hp: 50,
  id: "nayuta",
  name: "NAYUTA",
  normalAttackDescription:
    "Thirty-round dual SMGs deliver sustained automatic fire.",
  portraitPath: characterPortrait("nayuta"),
  speed: 68,
  specialDescription:
    "Summons a level-scaled clone with one-quarter health and one-fifth attack power.",
  specialName: "Summon Clone",
  squad: "PIONEER",
  unlockCost: 5,
  weapon: "SUBMACHINE GUN",
  weaponTag: "SMG",
};
