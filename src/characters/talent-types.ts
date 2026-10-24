// Survivors of Victory talent trees (src/characters/<id>/talents.ts), shown in Character Select.
export type TalentTreeId = 'attack' | 'skill' | 'burst';

export interface TalentDefinition {
  readonly burst?: true;
  readonly col: number;
  readonly cost: number;
  readonly desc: string;
  readonly id: string;
  readonly max: number;
  readonly name: string;
  readonly requires: readonly string[];
  readonly row: number;
  readonly start_unlocked?: boolean;
  readonly special?: true;
  readonly tooltip: string;
  readonly tree: TalentTreeId;
}
