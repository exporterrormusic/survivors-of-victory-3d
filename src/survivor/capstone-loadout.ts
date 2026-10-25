import type { TalentTreeId } from '../characters/talent-types';

const KEY = 'nikke-moba.snow-white-capstone';
export function loadCapstone(): TalentTreeId | null {
  try {
    const value = localStorage.getItem(KEY);
    return value === 'attack' || value === 'skill' || value === 'burst' ? value : null;
  } catch { return null; }
}
/** Called by the lobby only; active runs keep their own immutable selection. */
export function saveCapstone(value: TalentTreeId | null): void {
  try {
    if (value === null) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, value);
  } catch { /* Storage can be unavailable in private sessions. */ }
}
