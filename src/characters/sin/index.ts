import type { CharacterModule } from '../types';
import { profile } from './profile';
import { talents } from './talents';
import { kit } from './kit';

export const character: CharacterModule = {
  id: 'sin',
  name: 'Sin',
  profile,
  talents,
  model: {
    variant: 'c401_00', aim: 'weapon',
    skins: [
      { variant: 'c401_01', name: 'Sin: Backstreet Dream' },
      { variant: 'c405_00', name: 'Sin: Swift Bunny' },
    ],
  },
  weapon: 'smg',
  voices: [{ file: 'burst.wav', offsetDb: 1.8, weight: 1 }],
  theme: 'sin',
  kit,
};
