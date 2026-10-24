// Survivors of Victory card data (Character Select). MOBA kits are planned from it.
import { characterPortrait } from "../assets";
import type { CharacterProfile } from "../types";

export const profile: CharacterProfile = {
  accent: 0xe64d4d,
  attack: 10,
  basicAttackDescription: "Fast melee slashes with high close-range damage.",
  burstDescription:
    "Costs 50% HP, strikes every visible enemy, then teleports to the final target.",
  burstName: "Scarlet Flash",
  crit: 25,
  description: "Melee fighter who sacrifices HP for power.",
  hp: 50,
  id: "scarlet",
  name: "SCARLET",
  normalAttackDescription:
    "Rapid sword attacks carve through enemies at close range.",
  portraitPath: characterPortrait("scarlet"),
  speed: 100,
  specialDescription:
    "Dash releases a piercing wave dealing damage. Four second cooldown.",
  specialName: "Dash Slash",
  squad: "PIONEER",
  unlockCost: 3,
  weapon: "SWORD",
  weaponTag: "SWORD",
};
