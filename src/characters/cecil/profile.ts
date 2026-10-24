// Survivors of Victory card data (Character Select). MOBA kits are planned from it.
import { characterPortrait } from "../assets";
import type { CharacterProfile } from "../types";

export const profile: CharacterProfile = {
  accent: 0x3399ff,
  attack: 2,
  basicAttackDescription:
    "Dual SMGs provide continuous fire while drones maneuver.",
  burstDescription:
    "Freezes all enemies. Normal enemies are permanently converted into allies.",
  burstName: "System Hack",
  crit: 15,
  description: "SMG operator with drones and hacking.",
  hp: 50,
  id: "cecil",
  name: "CECIL",
  normalAttackDescription:
    "Thirty-round dual SMGs pair with autonomous drone support.",
  portraitPath: characterPortrait("cecil"),
  speed: 50,
  specialDescription:
    "Deploys two invincible drones and toggles between Hunt and Shield modes.",
  specialName: "Drone Deploy",
  squad: "EDEN",
  unlockCost: 8,
  weapon: "SUBMACHINE GUN",
  weaponTag: "SMG",
};
