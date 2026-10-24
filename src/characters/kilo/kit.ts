// Kilo: bruiser. Close-range shotgun with Explosive Shells (her Survivors special), a slug, a
// breaching charge, a mech dash and Assign Priority. First-pass numbers; see docs/KIT_PLAN.md.
import type { Kit } from '../../abilities/types';
import { characterBurstArt } from '../assets';

const BLAST = '#ff8a3d';

export const kit: Kit = {
  stats: { hp: 1700, moveSpeed: 5.4, resource: { kind: 'mana', max: 500, regen: 3 } },
  basic: { weapon: { kind: 'shotgun', speed: 34, pellets: 5, spread: Math.PI / 12 }, windup: 0.06, range: 4.5, period: 0.4, damage: 15, aimedRange: 6, tint: '#ffb347', magazine: { size: 8, reload: 2.5 } },
  trait: {
    name: 'Explosive Shells',
    desc: 'Trait. Basic attacks explode on impact, dealing 40% of their damage to other enemies within 1.6.',
    splash: { radius: 1.6, fraction: 0.4 },
  },
  abilities: {
    Q: {
      name: 'Slug', cooldown: 6, cost: 40, aim: 'line', range: 10, width: 0.9,
      desc: 'Fire a heavy slug that deals 70 damage to the first enemy hit, knocks it back and slows it by 30% for 1 second.',
      cast: { kind: 'shot' }, sound: 'weapon',
      effects: [{ kind: 'bolt', damage: 70, range: 10, size: 1.8, tint: BLAST, status: { kind: 'slow', duration: 1, amount: 0.3 }, knockback: 2.5 }],
    },
    W: {
      name: 'Breaching Charge', cooldown: 8, cost: 55, aim: 'circle', range: 9, radius: 2.8,
      desc: 'Throw a breaching charge that deals 60 damage to enemies in the area.',
      cast: { kind: 'shot' }, sound: 'none',
      effects: [{ kind: 'lob', damage: 60, radius: 2.8, flight: 0.5, tint: BLAST }],
    },
    E: {
      name: 'Mech Dash', cooldown: 9, cost: 45, aim: 'dash', range: 6, width: 1.4,
      desc: 'Boost up to 6 range in her mech and slam down, dealing 35 damage to enemies within 2.4.',
      cast: { kind: 'dash', time: 0.25 }, sound: 'dash',
      effects: [{ kind: 'nova', at: 'self', radius: 2.4, tint: BLAST, damage: 35 }],
    },
  },
  heroics: [
    {
      name: 'Assign Priority', icon: characterBurstArt('kilo'), cooldown: 20, cost: 100, aim: 'none', range: 0,
      desc: 'Heroic. For 5 seconds, Kilo attacks twice as fast and deals 120% more damage.',
      cast: { kind: 'channel', time: 0.3 }, sound: 'special',
      effects: [
        { kind: 'self', status: { kind: 'frenzy', duration: 5, amount: 1 } },
        { kind: 'self', status: { kind: 'empower', duration: 5, amount: 1.2 } },
      ],
    },
    {
      name: 'Overdrive', cooldown: 30, cost: 100, aim: 'none', range: 0,
      desc: 'Heroic. Overdrive the mech: a 400 shield and 40% more movement speed for 6 seconds.',
      cast: { kind: 'channel', time: 0.3 }, sound: 'special',
      effects: [
        { kind: 'self', status: { kind: 'shield', duration: 6, amount: 400 } },
        { kind: 'self', status: { kind: 'haste', duration: 6, amount: 0.4 } },
      ],
    },
  ],
};
