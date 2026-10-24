import type { CharacterModule } from '../types';
import { profile } from './profile';
import { talents } from './talents';
import { kit } from './kit';

export const character: CharacterModule = {
  id: 'scarlet',
  name: 'Scarlet',
  profile,
  talents,
  model: { variant: 'c222_00', aim: 'head' },
  weapon: 'sword',
  voices: [{ file: 'burst.wav', offsetDb: 0.1, weight: 1 }],
  kit,
};
