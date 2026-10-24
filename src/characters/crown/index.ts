import type { CharacterModule } from '../types';
import { profile } from './profile';
import { talents } from './talents';
import { kit } from './kit';

export const character: CharacterModule = {
  id: 'crown',
  name: 'Crown',
  profile,
  talents,
  model: { variant: 'c330_00', aim: 'weapon' },
  weapon: 'minigun',
  voices: [{ file: 'burst.wav', offsetDb: 0.2, weight: 1 }],
  kit,
};
