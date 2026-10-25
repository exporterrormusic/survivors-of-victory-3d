// Seeded random numbers for the game mode, so spawns, loot and layouts can be replayed in tests.

export type Random = () => number;

/** mulberry32: small, fast and good enough for gameplay rolls. Returns values in [0, 1). */
export function seededRandom(seed: number): Random {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const randomInt = (random: Random, min: number, max: number): number =>
  min + Math.floor(random() * (max - min + 1));

/** Pick by weight; returns undefined when nothing has a positive weight. */
export function weightedPick<T>(random: Random, items: readonly T[], weight: (item: T) => number): T | undefined {
  let total = 0;
  for (const item of items) total += Math.max(0, weight(item));
  if (total <= 0) return undefined;
  let roll = random() * total;
  for (const item of items) {
    roll -= Math.max(0, weight(item));
    if (roll < 0) return item;
  }
  return items[items.length - 1];
}
