import type { CharacterModule } from '../types';
import { profile } from './profile';
import { talents } from './talents';
import { kit } from './kit';

export const character: CharacterModule = {
  id: 'marian',
  name: 'Marian',
  profile,
  talents,
  // Modernia: Second Affection is her default look; Marian's own model stays as an outfit
  // (and Wells' Echoes of Hope still calls in Marian).
  model: {
    variant: 'c260_02',
    aim: 'weapon',
    skins: [
      { variant: 'c260_00', name: 'Marian: Modernia' },
      { variant: 'c260_01', name: 'Marian: Modernia (First Affection)' },
      { variant: 'c013_00', name: 'Marian: Original' },
    ],
  },
  weapon: 'beam',
  voices: [{ file: 'burst.wav', offsetDb: -0.1, weight: 1 }],
  kit,
};
