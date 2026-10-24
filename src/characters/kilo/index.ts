import type { CharacterModule } from '../types';
import { profile } from './profile';
import { talents } from './talents';
import { kit } from './kit';

export const character: CharacterModule = {
  id: 'kilo',
  name: 'Kilo',
  profile,
  talents,
  model: { variant: 'c361_00', aim: 'weapon' },
  weapon: 'shotgun',
  voices: [{ file: 'burst.wav', offsetDb: 0.3, weight: 1 }],
  kit,
};
