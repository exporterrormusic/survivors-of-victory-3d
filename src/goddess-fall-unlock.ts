// Goddess Fall Mode unlock flag, shared by the forest easter egg and Stage Select. Kept free of
// game imports so the front end can read it without loading the survivor runtime.
export const GODDESS_FALL_KEY = 'goddess-fall-mode';
const STORAGE_KEY = `nikke-moba.${GODDESS_FALL_KEY}`;
export function goddessFallUnlocked(): boolean {
  try { return localStorage.getItem(STORAGE_KEY) === 'unlocked'; } catch { return false; }
}
