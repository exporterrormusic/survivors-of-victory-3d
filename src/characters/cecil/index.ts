import type { CharacterModule } from '../types';
import { profile } from './profile';
import { talents } from './talents';

// Locked for now. NKAS lists c929_00 for Cecil; it has not been imported or checked.
export const character: CharacterModule = {
  id: 'cecil',
  name: 'Cecil',
  profile,
  talents,
  model: null,
  lockedReason: 'FIELD MODEL PENDING',
  weapon: 'smg',
  voices: [{ file: 'WISH.mp3', offsetDb: 6.9, weight: 1 }],
};
