import type { CharacterModule } from '../types';
import { profile } from './profile';
import { talents } from './talents';
import { kit } from './kit';

export const character: CharacterModule = {
  id: 'snow-white',
  name: 'Snow White',
  profile,
  talents,
  model: {
    variant: 'c220_00',
    aim: 'weapon',
    skins: [
      { variant: 'c220_01', name: 'Snow White: White Knight' },
      { variant: 'c224_00', name: 'Snow White: Innocent Days' },
      { variant: 'c471_00', name: 'Snow White: Heavy Arms' },
    ],
  },
  weapon: 'sniper',
  voices: [{ file: 'burst.wav', offsetDb: 1.1, weight: 1 }],
  kit,
  theme: 'snow',
};
