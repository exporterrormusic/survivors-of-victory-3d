import type { CharacterModule } from '../types';
import { profile } from './profile';
import { talents } from './talents';
import { kit } from './kit';

// Wells has no chibi; she borrows the mass-produced Product 08 model.
export const character: CharacterModule = {
  id: 'wells',
  name: 'Wells',
  profile,
  talents,
  model: { variant: 'c302_00', aim: 'weapon' },
  weapon: 'sniper',
  voices: [{ file: 'burst-1.mp3', offsetDb: 3, weight: 0.6 }, { file: 'burst-2.mp3', offsetDb: 1.7, weight: 0.4 }],
  kit,
};
