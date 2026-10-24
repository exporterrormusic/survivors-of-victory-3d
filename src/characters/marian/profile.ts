// Survivors of Victory card data (Character Select). MOBA kits are planned from it.
import { characterPortrait } from "../assets";
import type { CharacterProfile } from "../types";

export const profile: CharacterProfile = {
  accent: 0x8033cc,
  attack: 2,
  basicAttackDescription:
    "The Marian Cannon evolves through sustained contact and redirected energy.",
  burstDescription:
    "Transforms into her giant Heretic body and deploys its particle cannon array.",
  burstName: "Queen Ascendant",
  crit: 15,
  description:
    "Rapture Queen who commands subjects and redirects hostile energy.",
  hp: 50,
  id: "marian",
  name: "MARIAN",
  normalAttackDescription:
    "Her upgraded energy weapon projects a continuous, multi-target beam.",
  portraitPath: characterPortrait("marian"),
  speed: 62,
  specialDescription:
    "Emits the Queen's Signal around Marian, commanding nearby Raptures to fight for her.",
  specialName: "Queen's Signal",
  squad: "WHITE KNIGHT",
  unlockCost: 5,
  weapon: "ENERGY BEAM",
  weaponTag: "BEAM",
};
