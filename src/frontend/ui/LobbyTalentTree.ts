import { TalentBoard } from '../../survivor/talent-picker';
import { Run } from '../../survivor/run';
import { characterPortrait } from '../../characters/assets';

/** The in-run Heroes of the Storm-style talent board, read-only, for the lobby and shop. */
export function openLobbyTalentTree(character: 'snow-white' | 'scarlet' | 'rapunzel' = 'snow-white'): HTMLDialogElement {
  const run = new Run(character);
  if (!run.tiers) throw new Error(`${character} has no talent tiers`);
  const board = new TalentBoard(run as Run & { tiers: NonNullable<Run['tiers']> }, characterPortrait(character), () => board.destroy(), () => {}, true);
  board.open();
  return board.element;
}
