import type { CharacterModule } from '../types';
import { profile } from './profile';

export const character: CharacterModule = {
  id: 'dorothy', name: 'Dorothy', profile, talents: [],
  model: {
    variant: 'c233_00', aim: 'weapon',
    skins: [
      { variant: 'c233_01', name: 'Dorothy: Nostalgia' },
      { variant: 'c233_02', name: 'Dorothy: Luna Light' },
      { variant: 'c234_00', name: 'Dorothy: Serendipity' },
    ],
  },
  weapon: 'pulse-rifle', voices: [{ file: 'burst.mp3', offsetDb: 0, weight: 1 }],
};
