import type { CharacterModule } from '../types';
import { profile } from './profile';
import { talents } from './talents';
import { kit } from './kit';

export const character: CharacterModule = {
  id: 'nayuta',
  name: 'Nayuta',
  profile,
  talents,
  model: { variant: 'c223_00', aim: 'head', muzzle: 'body' }, // ring weapon: no barrel, and it floats behind her
  weapon: 'smg',
  voices: [{ file: 'burst.wav', offsetDb: -3.3, weight: 1 }],
  kit,
  theme: 'nayuta',
};
