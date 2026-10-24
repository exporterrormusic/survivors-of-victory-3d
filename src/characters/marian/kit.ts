// Marian: specialist. Rapid energy fire, Queen's Signal turning nearby Raptures (her Survivors
// special), a particle lance, a scorching step and Queen Ascendant. First-pass numbers; see docs/KIT_PLAN.md.
import type { Kit } from '../../abilities/types';
import { characterBurstArt } from '../assets';

const HERETIC = '#c060ff';

export const kit: Kit = {
  stats: { hp: 1500, moveSpeed: 5.3, resource: { kind: 'mana', max: 520, regen: 3.2 } },
  basic: { weapon: { kind: 'beam', width: 0.85 }, windup: 0.4, range: 7, period: 0.06, damage: 2, aimedRange: 12, tint: HERETIC, magazine: { size: 100, reload: 3.5 } },
  trait: {
    name: 'Redirected Energy',
    desc: 'Trait. Half of the damage Marian takes is stored, up to 120, and released with her next basic attack.',
    redirect: { fraction: 0.5, max: 120 },
  },
  abilities: {
    Q: {
      name: "Queen's Signal", cooldown: 14, cost: 70, aim: 'none', range: 0,
      desc: 'Command up to four enemy minions within 6 to fight for Marian for 10 seconds.',
      cast: { kind: 'shot' }, sound: 'summon',
      effects: [{ kind: 'convert', at: 'self', radius: 6, duration: 10, tint: HERETIC, limit: 4 }],
    },
    W: {
      name: 'Particle Lance', cooldown: 6, cost: 45, aim: 'line', range: 14, width: 1,
      desc: 'Fire a lance of energy that pierces every enemy in a line for 50 damage.',
      cast: { kind: 'shot' }, sound: 'weapon',
      effects: [{ kind: 'bolt', damage: 50, range: 14, pierce: true, size: 1.8, tint: HERETIC }],
    },
    E: {
      name: 'Heretic Step', cooldown: 9, cost: 50, aim: 'dash', range: 5, width: 1,
      desc: 'Step up to 5 range and scorch the ground for 3 seconds, burning enemies inside for 30 damage per second.',
      cast: { kind: 'dash', time: 0.2 }, sound: 'dash',
      effects: [{ kind: 'zone', at: 'self', zone: { radius: 2.2, duration: 3, tint: '#9b30ff', damage: 30 } }],
    },
  },
  heroics: [
    {
      name: 'Queen Ascendant', icon: characterBurstArt('marian'), cooldown: 20, cost: 100, aim: 'line', range: 30, width: 1.8,
      desc: 'Heroic. Gain a 300 shield and channel the particle cannon for 2 seconds, dealing 190 damage per second in a line.',
      cast: { kind: 'channel', time: 2 }, sound: 'beam',
      effects: [
        { kind: 'self', status: { kind: 'shield', duration: 4, amount: 300 } },
        { kind: 'beam', dps: 190, width: 1.8, length: 30, tint: HERETIC },
      ],
    },
    {
      name: 'Brood Call', cooldown: 30, cost: 100, aim: 'none', range: 0,
      desc: 'Heroic. Call three Lure Raptures to fight for Marian for 15 seconds.',
      cast: { kind: 'channel', time: 0.6 }, sound: 'summon',
      effects: [{
        kind: 'summon', at: 'self', count: 3,
        unit: {
          name: 'Brood Lure', model: { rapture: 'lure' }, hp: 320, damage: 26, range: 6.5, cooldown: 1.6,
          lifetime: 15, behaviour: 'follow', speed: 4.5, limit: 3, tint: [1.2, 0.85, 1.5],
        },
      }],
    },
  ],
};
