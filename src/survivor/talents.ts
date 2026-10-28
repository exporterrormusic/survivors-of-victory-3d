import type { TalentDefinition, TalentTreeId } from '../characters/talent-types';
import { ABILITY_RANK_COSTS, ABILITY_TRACKS, type AbilityTrack } from './ability-ranks';

/** Per-run ability ranks expose the existing effect flags to combat code. */
export class RunTalents {
  private readonly effects = new Set<string>();
  private readonly levels = new Map<TalentTreeId, number>();
  /** Other effect owners, such as talent tiers, that combat reads through has(). */
  private readonly sources: { has(id: string): boolean }[] = [];

  constructor(readonly definitions: readonly TalentDefinition[], readonly tracks: readonly AbilityTrack[] = ABILITY_TRACKS, readonly selectedCapstone: TalentTreeId | null = null) {
    for (const track of tracks) {
      this.levels.set(track.id, 1);
      for (const id of track.ranks[0].effects) this.effects.add(id);
    }
  }

  get activeCapstone(): TalentTreeId | null {
    const track = this.tracks.find(item => item.id === this.selectedCapstone);
    return track && this.abilityRank(track.id) === track.ranks.length ? track.id : null;
  }

  /** SP still needed to buy every remaining rank on every track. */
  get pointsToMax(): number {
    let points = 0;
    for (const track of this.tracks) for (let rank = this.abilityRank(track.id) + 1; rank <= track.ranks.length; rank++) points += ABILITY_RANK_COSTS[rank - 1];
    return points;
  }

  rank(id: string): number { return this.has(id) ? 1 : 0; }
  has(id: string): boolean { return this.effects.has(id) || this.sources.some((source) => source.has(id)); }
  addSource(source: { has(id: string): boolean }): void { this.sources.push(source); }
  abilityRank(tree: TalentTreeId): number { return this.levels.get(tree) ?? 0; }

  unavailable(tree: TalentTreeId, rank: number, points: number): string | null {
    const track = this.tracks.find((item) => item.id === tree);
    if (!track || !Number.isInteger(rank) || rank < 2 || rank > track.ranks.length) return 'Invalid rank.';
    const current = this.abilityRank(tree);
    if (rank <= current) return 'Unlocked';
    if (rank !== current + 1) return `Requires ${track.name} Rank ${rank - 1}.`;
    const cost = ABILITY_RANK_COSTS[rank - 1];
    if (!Number.isFinite(points) || points < cost) return `Need ${Number.isFinite(points) ? cost - points : cost} more SP. Earn SP by leveling up.`;
    return null;
  }

  purchase(tree: TalentTreeId, rank: number, wallet: { skillPoints: number }): boolean {
    if (this.unavailable(tree, rank, wallet.skillPoints) !== null) return false;
    const track = this.tracks.find((item) => item.id === tree)!;
    wallet.skillPoints -= ABILITY_RANK_COSTS[rank - 1];
    this.levels.set(tree, rank);
    for (const id of track.ranks[rank - 1].effects) this.effects.add(id);
    if (rank === track.ranks.length && this.selectedCapstone === tree) {
      for (const id of track.capstone.effects) this.effects.add(id);
    }
    return true;
  }
}
