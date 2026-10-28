import type { TalentTreeId } from '../characters/talent-types';

const key = (character: string) => `nikke-moba.${character}-capstone`;
export function loadCapstone(character = 'snow-white'): TalentTreeId | null {
  try {
    const value = localStorage.getItem(key(character));
    return value === 'attack' || value === 'skill' || value === 'burst' ? value : null;
  } catch { return null; }
}
/** Called by the lobby only; active runs keep their own immutable selection. */
export function saveCapstone(value: TalentTreeId | null, character = 'snow-white'): void {
  try {
    if (value === null) localStorage.removeItem(key(character));
    else localStorage.setItem(key(character), value);
  } catch { /* Storage can be unavailable in private sessions. */ }
}
