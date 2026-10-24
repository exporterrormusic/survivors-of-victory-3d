// Sin: specialist. Dual-SMG bursts that wear enemies down, Heavy Talker charming minions (her
// Survivors special), a slowing spread, a slip and Words Can Kill. First-pass numbers; see docs/KIT_PLAN.md.
import type { Kit } from '../../abilities/types';
import { characterBurstArt } from '../assets';

const SILVER = '#ff7ad9';

export const kit: Kit = {
  stats: { hp: 1450, moveSpeed: 5.7, resource: { kind: 'mana', max: 500, regen: 3 } },
  basic: { weapon: { kind: 'smg', speed: 36, separation: 0.36 }, windup: 0.02, range: 5.5, period: 0.08, damage: 2, aimedRange: 8, tint: SILVER, magazine: { size: 30, reload: 2 } },
  trait: {
    name: 'Silver Tongue',
    desc: 'Trait. Basic attacks make enemies burn for 4 damage per second for 3 seconds.',
    onHit: { kind: 'burn', duration: 3, amount: 4 },
  },
  abilities: {
    Q: {
      name: 'Heavy Talker', cooldown: 14, cost: 70, aim: 'circle', range: 9, radius: 3.5,
      desc: 'Charm up to three enemy minions in the area into fighting for Sin for 8 seconds.',
      cast: { kind: 'shot' }, sound: 'summon',
      effects: [{ kind: 'convert', at: 'aim', radius: 3.5, duration: 8, tint: SILVER, limit: 3 }],
    },
    W: {
      name: 'Pressure', cooldown: 6, cost: 40, aim: 'cone', range: 7, angle: 1.2,
      desc: 'Sweep a cone in front of Sin with fire, dealing 30 damage and slowing enemies by 35% for 2 seconds.',
      cast: { kind: 'shot' }, sound: 'weapon',
      effects: [{ kind: 'cone', range: 7, angle: 1.2, tint: SILVER, damage: 30, status: { kind: 'slow', duration: 2, amount: 0.35 } }],
    },
    E: {
      name: 'Slip Away', cooldown: 9, cost: 40, aim: 'dash', range: 5, width: 1,
      desc: 'Slip up to 5 range, then gain 30% movement speed for 2 seconds.',
      cast: { kind: 'dash', time: 0.18 }, sound: 'dash',
      effects: [{ kind: 'self', status: { kind: 'haste', duration: 2, amount: 0.3 } }],
    },
  },
  heroics: [
    {
      name: 'Words Can Kill', icon: characterBurstArt('sin'), cooldown: 20, cost: 100, aim: 'none', range: 0,
      desc: 'Heroic. Enemies within 8 burn for 25 damage per second for 8 seconds, and Sin heals 15% of her maximum health.',
      cast: { kind: 'channel', time: 0.5 }, sound: 'special',
      effects: [
        { kind: 'nova', at: 'self', radius: 8, tint: '#ff3fa4', status: { kind: 'burn', duration: 8, amount: 25 } },
        { kind: 'self', heal: { percent: 0.15 } },
      ],
    },
    {
      name: 'Swift Bunny', cooldown: 30, cost: 100, aim: 'none', range: 0,
      desc: 'Heroic. Bunny form: 50% more movement speed and 60% more attack speed for 6 seconds.',
      cast: { kind: 'channel', time: 0.3 }, sound: 'special',
      effects: [
        { kind: 'self', status: { kind: 'haste', duration: 6, amount: 0.5 } },
        { kind: 'self', status: { kind: 'frenzy', duration: 6, amount: 0.6 } },
      ],
    },
  ],
};
