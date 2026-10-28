import type { CharacterModule } from '../types';
import { profile } from './profile';
import { talents } from './talents';
import { kit } from './kit';

export const character: CharacterModule = {
  id: 'crown',
  name: 'Crown',
  profile,
  talents,
  model: {
    variant: 'c330_00', aim: 'weapon',
    skins: [
      { variant: 'c330_01', name: 'Crown: Naked King' },
      { variant: 'c330_02', name: 'Crown: Glorious King' },
    ],
  },
  weapon: 'minigun',
  voices: [{ file: 'burst.wav', offsetDb: 0.2, weight: 1 }],
  kit,
};
