// Character registry. To add a Nikke: create src/characters/<id>/ (profile, talents, index, and
// kit once they have abilities), add the id to ids.ts and import it here. Menus, the match
// loader, the HUD and audio pick it up.
import { PROTOTYPE_KIT } from '../abilities/prototype-kit';
import type { Kit } from '../abilities/types';
import { ACTIVE_CHARACTER_IDS, type CharacterId } from './ids';
import type { CharacterModule } from './types';
import { character as snowWhite } from './snow-white';
import { character as scarlet } from './scarlet';
import { character as rapunzel } from './rapunzel';
import { character as nayuta } from './nayuta';
import { character as dorothy } from './dorothy';
import { character as commander } from './commander';
import { character as marian } from './marian';
import { character as crown } from './crown';
import { character as kilo } from './kilo';
import { character as cecil } from './cecil';
import { character as sin } from './sin';
import { character as wells } from './wells';

export * from './ids';
export type * from './types';

export const CHARACTER_MODULES: Readonly<Record<CharacterId, CharacterModule>> = {
  'snow-white': snowWhite,
  scarlet,
  rapunzel,
  nayuta,
  dorothy,
  commander,
  marian,
  crown,
  kilo,
  cecil,
  sin,
  wells,
};

export const DEFAULT_CHARACTER: CharacterId = 'snow-white';

/** The character's MOBA kit, or the shared prototype kit until they have one. */
export const kitOf = (character: CharacterModule): Kit => character.kit ?? PROTOTYPE_KIT;

/** Characters with a field model can be deployed; the rest stay locked. */
export const isPlayable = (id: CharacterId): boolean => CHARACTER_MODULES[id].model !== null;

export const PLAYABLE_CHARACTER_IDS: readonly CharacterId[] = ACTIVE_CHARACTER_IDS.filter(isPlayable);

export interface HeroVariant {
  readonly character: CharacterModule;
  /** NKAS model id */
  readonly variant: string;
  /** in-match name */
  readonly name: string;
  readonly aim: 'weapon' | 'head';
  readonly muzzle: 'weapon' | 'body';
}

/** Every deployable model, base outfits first, then skins (the F10 outfit list). */
export const HERO_VARIANTS: readonly HeroVariant[] = [
  ...PLAYABLE_CHARACTER_IDS.map((id) => {
    const character = CHARACTER_MODULES[id], model = character.model!;
    return { character, variant: model.variant, name: character.name, aim: model.aim, muzzle: model.muzzle ?? 'weapon' };
  }),
  ...PLAYABLE_CHARACTER_IDS.flatMap((id) => {
    const character = CHARACTER_MODULES[id], model = character.model!;
    return (model.skins ?? []).map((skin) => ({
      character, variant: skin.variant, name: skin.name, aim: model.aim, muzzle: model.muzzle ?? 'weapon',
    }));
  }),
];

/** Resolve a match's hero from the URL: ?hero=<character id> and/or ?v=<model id>. */
export function heroFromQuery(params: URLSearchParams): HeroVariant {
  const hero = params.get('hero'), variant = params.get('v');
  return HERO_VARIANTS.find((h) => h.character.id === hero && (!variant || h.variant === variant))
    ?? HERO_VARIANTS.find((h) => h.variant === variant)
    ?? HERO_VARIANTS.find((h) => h.character.id === hero)
    ?? HERO_VARIANTS[0];
}
