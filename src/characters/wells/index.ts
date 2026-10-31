import type { CharacterModule } from '../types';
import { profile } from './profile';
import { talents } from './talents';
import { kit } from './kit';

// Research uniform is a separate skinned derivative of Product 08.
export const character: CharacterModule = {
  id: 'wells',
  name: 'Wells',
  profile,
  talents,
  model: {
    variant: 'wells_research', aim: 'weapon',
    skins: [
      { variant: 'c302_00', name: 'Wells: Product 08' },
      { variant: 'aya', name: 'Wells: Ayamari Yushutsu' },
    ],
  },
  weapon: 'sniper',
  voices: [{ file: 'burst-1.mp3', offsetDb: 3, weight: 0.6 }, { file: 'burst-2.mp3', offsetDb: 1.7, weight: 0.4 }],
  kit,
};
