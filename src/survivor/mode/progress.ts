// Your NIKKE's permanent progress in a sortie (GAME_PLAN §10): the run starts as the saved NIKKE
// (level, XP, unspent SP, ability ranks), and the trip's result is written back when it ends:
// XP, levels and ranks always; loot only on extraction. Leaving the page mid-trip saves nothing.
// The plain test range never calls these, so it stays a sandbox.

import type { CharacterId } from '../../characters/ids';
import type { TalentTreeId } from '../../characters/talent-types';
import { bankDeposit, loadCharacterProgress, saveCharacterProgress } from '../../frontend/profile/PlayerProgress';
import type { Run } from '../run';
import type { SortieResults } from './sortie';

const ABILITIES: readonly TalentTreeId[] = ['attack', 'skill', 'burst'];

/** Start the run as the saved NIKKE. Ranks are replayed as purchases so their effects switch on. */
export function applyProgress(run: Run, id: CharacterId): void {
  const saved = loadCharacterProgress(id);
  run.level = saved.level;
  run.xp = saved.xp;
  run.skillPoints = saved.skillPoints;
  const free = { skillPoints: 1e9 };
  for (const tree of ABILITIES) {
    for (let rank = run.talents.abilityRank(tree) + 1; rank <= saved.ranks[tree]; rank++) run.talents.purchase(tree, rank, free);
  }
}

/** The trip ended: keep XP, levels and ranks either way, and bank the loot only if extracted. */
export function recordTrip(run: Run, id: CharacterId, results: SortieResults): void {
  saveCharacterProgress(id, {
    level: run.level, xp: run.xp, skillPoints: run.skillPoints,
    ranks: { attack: run.talents.abilityRank('attack'), skill: run.talents.abilityRank('skill'), burst: run.talents.abilityRank('burst') },
  });
  if (results.outcome === 'extracted') bankDeposit(results.purse);
}
