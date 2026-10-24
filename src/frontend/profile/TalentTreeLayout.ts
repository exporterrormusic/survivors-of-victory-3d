import type { TalentDefinition } from "./TalentTypes";

export const TALENT_NODE_WIDTH = 356;
export const TALENT_NODE_HEIGHT = 150;
export const TALENT_TREE_LEFT_X = 518;
export const TALENT_TREE_CENTER_X = 932;
export const TALENT_TREE_RIGHT_X = 1346;
export const TALENT_TREE_ROW_Y = [310, 524, 738] as const;
export const TALENT_MASTERY_HEIGHT = 210;

type TalentRankLookup = (talentId: string) => number;

export function isMasteryTalent(talent: TalentDefinition): boolean {
  return talent.col === 0 && talent.row === 2;
}

export function isMainProgressionTalent(talent: TalentDefinition): boolean {
  return (
    (talent.col === 1 && (talent.row === 0 || talent.row === 1)) ||
    (talent.col === 2 && talent.row === 2)
  );
}

export function isInitialTalent(talent: TalentDefinition): boolean {
  return (
    talent.start_unlocked === true || (talent.col === 1 && talent.row === 0)
  );
}

export function ownedNonMasteryTalentCount(
  talents: readonly TalentDefinition[],
  rank: TalentRankLookup,
): number {
  return talents.filter(
    (talent) => !isMasteryTalent(talent) && rank(talent.id) > 0,
  ).length;
}

export function isMasteryReady(
  talents: readonly TalentDefinition[],
  rank: TalentRankLookup,
): boolean {
  return (
    ownedNonMasteryTalentCount(talents, rank) ===
    talents.filter((talent) => !isMasteryTalent(talent)).length
  );
}

export function talentTreePosition(talent: TalentDefinition): {
  readonly x: number;
  readonly y: number;
} {
  if (isMasteryTalent(talent)) {
    return { x: TALENT_TREE_RIGHT_X, y: TALENT_TREE_ROW_Y[2] };
  }
  if (talent.col === 2 && talent.row === 2) {
    return { x: TALENT_TREE_CENTER_X, y: TALENT_TREE_ROW_Y[2] };
  }
  return {
    x: TALENT_TREE_LEFT_X + talent.col * 414,
    y: TALENT_TREE_ROW_Y[talent.row] ?? TALENT_TREE_ROW_Y[0],
  };
}
