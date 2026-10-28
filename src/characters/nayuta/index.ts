import type { CharacterModule } from '../types';
import { profile } from './profile';
import { talents } from './talents';
import { kit } from './kit';

export const character: CharacterModule = {
  id: 'nayuta',
  name: 'Nayuta',
  profile,
  talents,
  model: {
    variant: 'c223_00', aim: 'head', muzzle: 'body', // ring weapon floats behind her
    skins: [{ variant: 'c223_01', name: 'Nayuta: Wu Wei' }],
  },
  weapon: 'smg',
  voices: [{ file: 'burst.wav', offsetDb: -3.3, weight: 1 }],
  kit,
  theme: 'nayuta',
};
