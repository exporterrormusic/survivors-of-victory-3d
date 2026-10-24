// Scarlet: melee assassin. Fast sword strikes, the Dash Slash wave (her Survivors special), a
// frenzy, a blink strike and Scarlet Flash. Abilities cost health (Blood Price), as in Survivors.
// First-pass numbers; see docs/KIT_PLAN.md.
import type { Kit } from '../../abilities/types';
import { characterBurstArt } from '../assets';

const CRIMSON = '#ff3b55';

export const kit: Kit = {
  stats: { hp: 1550, moveSpeed: 5.8, resource: { kind: 'health' } },
  basic: { weapon: { kind: 'sword', angle: Math.PI * 0.78 }, windup: 0.08, range: 2.2, period: 0.3, damage: 10, aimedRange: 2.2, tint: CRIMSON },
  trait: {
    name: 'Blood Price',
    desc: 'Trait. Abilities cost health instead of mana. Scarlet deals up to 60% more damage as her health falls.',
    rage: { maxBonus: 0.6 },
  },
  abilities: {
    Q: {
      name: 'Dash Slash', cooldown: 6, cost: 45, aim: 'dash', range: 6, width: 1.2,
      desc: 'Dash up to 6 range, then release a piercing wave that deals 45 damage to every enemy in its path.',
      cast: { kind: 'dash', time: 0.2 }, sound: 'special',
      effects: [{ kind: 'bolt', damage: 45, range: 7, pierce: true, size: 2.2, tint: CRIMSON }],
    },
    W: {
      name: 'Bloodlust', cooldown: 12, cost: 30, aim: 'none', range: 0,
      desc: 'Gain 50% attack speed and 20% movement speed for 4 seconds.',
      cast: { kind: 'shot' }, sound: 'special',
      effects: [
        { kind: 'self', status: { kind: 'frenzy', duration: 4, amount: 0.5 } },
        { kind: 'self', status: { kind: 'haste', duration: 4, amount: 0.2 } },
      ],
    },
    E: {
      name: 'Flash Step', cooldown: 9, cost: 40, aim: 'dash', range: 4.5, width: 1,
      desc: 'Blink up to 4.5 range and strike on arrival, dealing 60 damage to enemies within 2.2.',
      cast: { kind: 'dash', time: 0.12, invulnerable: true }, sound: 'dash',
      effects: [{ kind: 'nova', at: 'self', radius: 2.2, tint: CRIMSON, damage: 60 }],
    },
  },
  heroics: [
    {
      name: 'Scarlet Flash', icon: characterBurstArt('scarlet'), cooldown: 20, cost: 380, aim: 'none', range: 0,
      desc: 'Heroic. Pay a quarter of her health to cut through everything around Scarlet, dealing 220 damage to enemies within 8.',
      cast: { kind: 'channel', time: 0.5 }, sound: 'special',
      effects: [{ kind: 'nova', at: 'self', radius: 8, tint: CRIMSON, damage: 220 }],
    },
    {
      name: 'Black Shadow', cooldown: 30, cost: 300, aim: 'dash', range: 7, width: 1.2,
      desc: 'Heroic. Become a shadow: blink up to 7 range, untouchable, and execute enemies within 2 for 320 damage.',
      cast: { kind: 'dash', time: 0.15, invulnerable: true }, sound: 'special',
      effects: [{ kind: 'nova', at: 'self', radius: 2, tint: '#2a0f1a', damage: 320 }],
    },
  ],
};
