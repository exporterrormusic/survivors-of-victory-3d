import type { CharacterModule } from '../types';
import { profile } from './profile';
import { talents } from './talents';

// No chibi exists for the Commander.
export const character: CharacterModule = {
  id: 'commander',
  name: 'Commander',
  profile,
  talents,
  model: null,
  lockedReason: 'NO FIELD MODEL',
  weapon: 'assault',
  voices: [{ file: 'burst-1.mp3', offsetDb: 7.7, weight: 1 }, { file: 'burst-2.mp3', offsetDb: 7.6, weight: 1 }],
};
