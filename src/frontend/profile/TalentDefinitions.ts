import { CHARACTER_IDS, CHARACTER_MODULES, type CharacterId } from "../../characters";
import type { TalentDefinition } from "./TalentTypes";

/** Each character's Survivors talent tree, from src/characters/<id>/talents.ts. */
export const TALENT_DEFINITIONS = Object.fromEntries(
  CHARACTER_IDS.map((id) => [id, CHARACTER_MODULES[id].talents]),
) as Readonly<Record<CharacterId, readonly TalentDefinition[]>>;
