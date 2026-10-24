// Wells: ranged specialist (Product 08 model). Precise sniper fire, the Mnemosyne Project time
// field (her Survivors special), a phase step and Echoes of Hope calling in Marian.
// Abilities run on Mnemosyne fuel, which refills quickly after a pause. First-pass numbers; see docs/KIT_PLAN.md.
import type { Kit } from '../../abilities/types';
import { characterBurstArt } from '../assets';

const CHRONO = '#7de8ff';

export const kit: Kit = {
  stats: { hp: 1400, moveSpeed: 5.5, resource: { kind: 'fuel', max: 100, regen: 20, delay: 1.2 } },
  basic: { weapon: { kind: 'sniper', speed: 66 }, windup: 0.12, range: 8, period: 0.35, damage: 7, aimedRange: 15, tint: CHRONO, magazine: { size: 7, reload: 1.5 } },
  trait: {
    name: 'Precision',
    desc: 'Trait. Every fourth basic attack is a charged shot that deals 2.5 times damage.',
    chargedShot: { every: 4, multiplier: 2.5 },
  },
  abilities: {
    Q: {
      name: 'Precise Shot', cooldown: 6, cost: 30, aim: 'line', range: 20, width: 0.7,
      desc: 'Fire a long-range round that pierces every enemy in a line for 55 damage.',
      cast: { kind: 'shot' }, sound: 'weapon',
      effects: [{ kind: 'bolt', damage: 55, range: 20, pierce: true, size: 1.3, tint: CHRONO }],
    },
    W: {
      name: 'Mnemosyne Project', cooldown: 14, cost: 45, aim: 'none', range: 0,
      desc: 'Slow time around Wells for 4 seconds: enemies within 5 are slowed by 50%, and allies inside attack 40% faster.',
      cast: { kind: 'shot' }, sound: 'special',
      effects: [{
        kind: 'zone', at: 'self',
        zone: {
          radius: 5, duration: 4, tint: CHRONO,
          status: { kind: 'slow', duration: 0.5, amount: 0.5 }, allyStatus: { kind: 'frenzy', duration: 0.5, amount: 0.4 },
        },
      }],
    },
    E: {
      name: 'Phase Step', cooldown: 10, cost: 25, aim: 'dash', range: 5, width: 1,
      desc: 'Shift up to 5 range through time, untouchable while moving.',
      cast: { kind: 'dash', time: 0.15, invulnerable: true }, sound: 'dash', effects: [],
    },
  },
  heroics: [
    {
      name: 'Echoes of Hope', icon: characterBurstArt('wells'), cooldown: 25, cost: 50, aim: 'none', range: 0,
      desc: 'Heroic. Call Marian from another time to fight beside Wells for 15 seconds.',
      cast: { kind: 'channel', time: 0.5 }, sound: 'summon',
      effects: [{
        kind: 'summon', at: 'self',
        unit: {
          name: 'Marian (Echo)', model: { variant: 'c013_00', aim: 'weapon' }, hp: 900, damage: 30, range: 8, cooldown: 0.6,
          lifetime: 15, behaviour: 'follow', speed: 5.5, limit: 1, tint: [1.15, 1.1, 1.4],
        },
      }],
    },
    {
      name: 'Time Lock', cooldown: 30, cost: 50, aim: 'line', range: 18, width: 0.8,
      desc: 'Heroic. Fire a round that stops the first enemy hit in time: 120 damage and stunned for 3 seconds.',
      cast: { kind: 'shot' }, sound: 'special',
      effects: [{ kind: 'bolt', damage: 120, range: 18, size: 1.5, tint: '#d8f6ff', status: { kind: 'stun', duration: 3 } }],
    },
  ],
};
