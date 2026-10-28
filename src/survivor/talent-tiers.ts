// Heroes of the Storm-style talent tiers (docs/SNOW_WHITE_TALENT_TIERS.md). At set levels the
// player picks one of a few talents; picks never pause the game and can't be changed later in the
// run. A pick is a list of effect flags, so combat code keeps asking RunTalents.has(flag).
// No DOM or engine imports: the Node tests load this file directly.

export type TalentAbility = 'weapon' | 'special' | 'burst' | 'utility';
/** A hero's talent set: display names for its abilities and its tiers. */
export interface TalentSet { readonly abilities: Readonly<Record<TalentAbility, string>>; readonly tiers: readonly TalentTier[] }

/** What a quest sees about each kill. `source` is the run's DamageSource. */
export interface TalentKill { readonly marked: boolean; readonly burning: boolean; readonly source: string }

export interface TalentQuest {
  readonly goal: number;
  /** progress label, e.g. "Marked kills" */
  readonly label: string;
  counts(kill: TalentKill): boolean;
  readonly reward: readonly string[];
  readonly rewardName: string;
  readonly rewardText: string;
}

export interface TierTalent {
  readonly id: string;
  readonly name: string;
  readonly ability: TalentAbility;
  /** talent-icons.ts glyph */
  readonly icon: string;
  /** optional square illustration under public/ */
  readonly art?: string;
  readonly description: string;
  readonly effects: readonly string[];
  readonly quest?: TalentQuest;
}

export interface TalentTier {
  readonly level: number;
  /** short tier name shown in the picker and the Tab grid */
  readonly label: string;
  readonly options: readonly TierTalent[];
}

export interface QuestState { readonly talent: TierTalent; readonly quest: TalentQuest; readonly count: number; readonly done: boolean }

export class TalentTiers {
  readonly tiers: readonly TalentTier[];
  /** display names, e.g. weapon → "Rifle" */
  readonly abilities: Readonly<Record<TalentAbility, string>>;
  private readonly chosen: (number | null)[];
  private readonly effects = new Set<string>();
  private readonly counts = new Map<string, number>();

  // Plain fields (no parameter properties) so Node's type stripping can load this file.
  constructor(set: TalentSet) {
    this.tiers = set.tiers;
    this.abilities = set.abilities;
    this.chosen = set.tiers.map(() => null);
  }

  has(effect: string): boolean { return this.effects.has(effect); }

  /** The chosen option of a tier, or null. */
  choice(tier: number): TierTalent | null {
    const option = this.chosen[tier];
    return option === null || option === undefined ? null : this.tiers[tier].options[option];
  }
  chosenIndex(tier: number): number | null { return this.chosen[tier] ?? null; }

  /** The oldest unlocked tier still waiting for a pick, or -1. Older tiers always come first. */
  pending(level: number): number {
    return this.tiers.findIndex((tier, index) => tier.level <= level && this.chosen[index] === null);
  }
  pendingCount(level: number): number {
    return this.tiers.filter((tier, index) => tier.level <= level && this.chosen[index] === null).length;
  }

  /** Pick an option of the oldest waiting tier. Returns the talent, or null if that pick isn't open. */
  choose(tier: number, option: number, level: number): TierTalent | null {
    if (tier !== this.pending(level)) return null;
    const talent = this.tiers[tier].options[option];
    if (!talent) return null;
    this.chosen[tier] = option;
    for (const effect of talent.effects) this.effects.add(effect);
    return talent;
  }

  /** Count a kill toward every unfinished quest. Returns the quests this kill completed. */
  recordKill(kill: TalentKill): TierTalent[] {
    const completed: TierTalent[] = [];
    for (const state of this.quests) {
      if (state.done || !state.quest.counts(kill)) continue;
      const count = state.count + 1;
      this.counts.set(state.talent.id, count);
      if (count >= state.quest.goal) {
        for (const effect of state.quest.reward) this.effects.add(effect);
        completed.push(state.talent);
      }
    }
    return completed;
  }

  /** Quests of the chosen talents, in tier order. */
  get quests(): QuestState[] {
    const states: QuestState[] = [];
    for (let tier = 0; tier < this.tiers.length; tier++) {
      const talent = this.choice(tier);
      if (!talent?.quest) continue;
      const count = Math.min(talent.quest.goal, this.counts.get(talent.id) ?? 0);
      states.push({ talent, quest: talent.quest, count, done: count >= talent.quest.goal });
    }
    return states;
  }

  reset(): void {
    this.chosen.fill(null);
    this.effects.clear();
    this.counts.clear();
  }
}
