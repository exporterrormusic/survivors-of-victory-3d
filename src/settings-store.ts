// Player preferences shared by the survivor run and the archived MOBA match (camera, visuals,
// weather...). Stored under `nikke-moba.<key>`; private windows simply don't keep them.

const PREFIX = 'nikke-moba.';

/** The saved value of `key` if it is one of `allowed`, else `fallback`. */
export function loadSetting<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const v = localStorage.getItem(PREFIX + key) as T | null;
    return v && allowed.includes(v) ? v : fallback;
  } catch {
    return fallback;
  }
}

export function saveSetting(key: string, value: string): void {
  try { localStorage.setItem(PREFIX + key, value); } catch { /* private mode: the setting won't stick */ }
}
