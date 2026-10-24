// Every Nikke the game knows, in Character Select order. Each has a folder beside this file.
export const CHARACTER_IDS = [
  'snow-white',
  'scarlet',
  'rapunzel',
  'nayuta',
  'commander',
  'marian',
  'crown',
  'kilo',
  'cecil',
  'sin',
  'wells',
] as const;

export type CharacterId = (typeof CHARACTER_IDS)[number];

const CHARACTER_ID_SET: ReadonlySet<string> = new Set(CHARACTER_IDS);

export function isCharacterId(value: unknown): value is CharacterId {
  return typeof value === 'string' && CHARACTER_ID_SET.has(value);
}
