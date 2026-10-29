// Every Nikke the game knows, in Character Select order. Each has a folder beside this file.
export const CHARACTER_IDS = [
  'snow-white',
  'scarlet',
  'rapunzel',
  'dorothy',
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

/** Shelved characters keep their ids and assets for save compatibility. */
export const ACTIVE_CHARACTER_IDS = CHARACTER_IDS.filter(id => id !== 'commander');

const CHARACTER_ID_SET: ReadonlySet<string> = new Set(CHARACTER_IDS);

export function isCharacterId(value: unknown): value is CharacterId {
  return typeof value === 'string' && CHARACTER_ID_SET.has(value);
}
