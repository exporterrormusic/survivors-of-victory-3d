import type { CharacterModule } from '../types';
import { profile } from './profile';
import { talents } from './talents';
import { kit } from './kit';

export const character: CharacterModule = {
  id: 'rapunzel',
  name: 'Rapunzel',
  profile,
  talents,
  model: { variant: 'c221_00', aim: 'head', muzzle: 'body' }, // launcher carried sideways
  weapon: 'rocket',
  voices: [{ file: 'burst.wav', offsetDb: -0.3, weight: 1 }],
  kit,
  theme: 'rapunzel',
};
