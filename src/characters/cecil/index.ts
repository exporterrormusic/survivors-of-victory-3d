import type { CharacterModule } from '../types';
import { profile } from './profile';
import { talents } from './talents';

// Cecil uses Liliweiss (c5029_00): a nikke-db field NPC, rebuilt with Nayuta's clips by
// tools/nikkedb-chibi.mjs. She fights bare-handed, so no weapon part. NKAS has no c929_00 chibi.
export const character: CharacterModule = {
  id: 'cecil',
  name: 'Cecil',
  profile,
  talents,
  model: { variant: 'c5029_00', aim: 'head', muzzle: 'body' },
  weapon: 'smg',
  voices: [{ file: 'WISH.mp3', offsetDb: 6.9, weight: 1 }],
};
