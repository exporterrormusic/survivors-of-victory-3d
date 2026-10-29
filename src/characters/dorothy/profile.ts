import { characterPortrait } from '../assets';
import type { CharacterProfile } from '../types';

export const profile: CharacterProfile = {
  id: 'dorothy', name: 'DOROTHY', squad: 'INHERIT', accent: 0xf193cc,
  weapon: 'ASSAULT RIFLE', weaponTag: 'AR',
  portraitPath: characterPortrait('dorothy'),
  description: 'Eden’s angel. Fly, expose, and condemn.',
  attack: 3, hp: 60, speed: 68, crit: 15, unlockCost: 0,
  basicAttackDescription: 'Ungrateful OZ fires rapid pink energy beams.',
  normalAttackDescription: 'Automatic pink pulse rifle. Prototype tuning: 60 rounds, 1-second reload.',
  specialName: 'Angel’s Flight',
  specialDescription: 'Fly invulnerably to the cursor. Land with a blast that knocks back and exposes enemies.',
  burstName: 'Paradise Lost',
  burstDescription: 'Gain piercing fire for 8s. Brand nearby enemies, then detonate each for their pooled damage.',
};
