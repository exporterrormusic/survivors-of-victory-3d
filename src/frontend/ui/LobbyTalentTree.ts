import { TalentBoard } from '../../survivor/talent-picker';
import { Run } from '../../survivor/run';
import { characterPortrait } from '../../characters/assets';

const BOARD_WIDTH = 1640, BOARD_HEIGHT = 980;

/** The in-run Heroes of the Storm-style talent board, read-only, for the lobby and shop. */
export function openLobbyTalentTree(character: 'snow-white' | 'scarlet' | 'rapunzel' | 'nayuta' | 'dorothy' = 'snow-white'): HTMLDialogElement {
  const run = new Run(character);
  if (!run.tiers) throw new Error(`${character} has no talent tiers`);
  const board = new TalentBoard(run as Run & { tiers: NonNullable<Run['tiers']> }, characterPortrait(character), () => board.destroy(), () => {}, true);
  const dialog = board.element;
  // Out of a run there is no game-area container for the board's cqh units, so it would size to the
  // whole window and its font floors would push the rows out of the frame. Lay it out at full size
  // and zoom it to fit the Phaser canvas instead, like the scene behind it.
  dialog.style.setProperty('--tt-k', '1px');
  dialog.style.width = `${BOARD_WIDTH}px`; dialog.style.height = `${BOARD_HEIGHT}px`;
  const fit = () => {
    const bounds = document.querySelector('#front-end canvas')?.getBoundingClientRect();
    const width = bounds?.width || innerWidth, height = bounds?.height || innerHeight;
    dialog.style.zoom = String(Math.min(width * 0.96 / BOARD_WIDTH, height * 0.96 / BOARD_HEIGHT));
  };
  fit(); addEventListener('resize', fit);
  dialog.addEventListener('close', () => removeEventListener('resize', fit), { once: true });
  board.open();
  return dialog;
}
