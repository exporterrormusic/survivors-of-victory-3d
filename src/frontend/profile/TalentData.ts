import { TALENT_DEFINITIONS } from "./TalentDefinitions";
import type { CharacterId } from "./Ids";
import type { TalentDefinition, TalentTreeId } from "./TalentTypes";

export type { TalentDefinition, TalentTreeId } from "./TalentTypes";

export const TALENT_TREE_TABS: readonly {
  readonly id: TalentTreeId;
  readonly label: string;
}[] = [
  { id: "attack", label: "ATTACK" },
  { id: "skill", label: "SPECIAL" },
  { id: "burst", label: "BURST" },
];

export function getCharacterTalents(
  characterId: CharacterId,
  tree: TalentTreeId,
): readonly TalentDefinition[] {
  return TALENT_DEFINITIONS[characterId].filter(
    (talent) => talent.tree === tree,
  );
}
