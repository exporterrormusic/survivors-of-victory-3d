import type { CharacterModule } from '../types';
import { profile } from './profile';
import { talents } from './talents';

// Legendary Commander (c5028_00): a nikke-db field NPC, rebuilt with Snow White's clips and rifle
// by tools/nikkedb-chibi.mjs. NKAS has no Commander chibi.
export const character: CharacterModule = {
  id: 'commander',
  name: 'Commander',
  profile,
  talents,
  model: { variant: 'c5028_00', aim: 'weapon' },
  weapon: 'assault',
  voices: [{ file: 'burst-1.mp3', offsetDb: 7.7, weight: 1 }, { file: 'burst-2.mp3', offsetDb: 7.6, weight: 1 }],
};
