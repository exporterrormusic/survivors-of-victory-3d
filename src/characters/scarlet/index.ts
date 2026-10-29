import type { CharacterModule } from '../types';
import { profile } from './profile';
import { talents } from './talents';
import { kit } from './kit';

export const character: CharacterModule = {
  id: 'scarlet',
  name: 'Scarlet',
  profile,
  talents,
  model: {
    variant: 'c222_00', aim: 'head',
    skins: [
      { variant: 'c222_01', name: "Scarlet: Racer's High" },
      { variant: 'c225_00', name: 'Scarlet: Black Shadow' },
      { variant: 'c225_01', name: 'Scarlet: Black Shadow - Longing Flower' },
      { variant: 'c472_00', name: 'Scarlet: Goddeath' },
    ],
  },
  weapon: 'sword',
  voices: [{ file: 'burst.wav', offsetDb: 0.1, weight: 1 }],
  kit,
};
