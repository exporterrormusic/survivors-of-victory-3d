// Crown: tank. Minigun suppression, a slowing volley, the Trombe charge (her Survivors special),
// a stunning stand and Last Kingdom, behind a regenerating Royal Guard shield. First-pass numbers; see docs/KIT_PLAN.md.
import type { Kit } from '../../abilities/types';
import { characterBurstArt } from '../assets';

const GOLD = '#ffd26b';

export const kit: Kit = {
  stats: { hp: 1900, moveSpeed: 5.2, resource: { kind: 'mana', max: 480, regen: 3 } },
  basic: { weapon: { kind: 'minigun', speed: 44 }, windup: 0.04, range: 6, period: 0.06, damage: 2, aimedRange: 10, tint: GOLD, magazine: { size: 100, reload: 3.5 } },
  trait: {
    name: 'Royal Guard',
    desc: 'Trait. Crown carries a 220 shield that refills after 4 seconds without taking damage. Basic attacks slow enemies by 10% for 0.8 seconds.',
    guard: { amount: 220, delay: 4 },
    onHit: { kind: 'slow', duration: 0.8, amount: 0.1 },
  },
  abilities: {
    Q: {
      name: 'Volley', cooldown: 6, cost: 45, aim: 'line', range: 9, width: 2.6,
      desc: 'Sweep a cone with five rounds, each dealing 22 damage and slowing by 25% for 1.5 seconds.',
      cast: { kind: 'shot' }, sound: 'special',
      effects: [{ kind: 'bolt', damage: 22, range: 9, size: 1.1, tint: GOLD, count: 5, spread: 0.6, status: { kind: 'slow', duration: 1.5, amount: 0.25 } }],
    },
    W: {
      name: 'Summon Trombe', cooldown: 12, cost: 60, aim: 'dash', range: 9, width: 1.6,
      desc: 'Charge up to 9 range on Trombe, invulnerable while charging. On arrival, deal 40 damage and stun enemies within 2.5 for 0.5 seconds.',
      cast: { kind: 'dash', time: 0.45, invulnerable: true }, sound: 'dash',
      effects: [{ kind: 'nova', at: 'self', radius: 2.5, tint: GOLD, damage: 40, status: { kind: 'stun', duration: 0.5 } }],
    },
    E: {
      name: 'Hold the Line', cooldown: 11, cost: 60, aim: 'none', range: 0,
      desc: 'Gain a 250 shield for 4 seconds. Enemies within 4 take 30 damage, are knocked back and stunned for 0.75 seconds.',
      cast: { kind: 'shot' }, sound: 'special',
      effects: [
        { kind: 'self', status: { kind: 'shield', duration: 4, amount: 250 } },
        { kind: 'nova', at: 'self', radius: 4, tint: GOLD, damage: 30, status: { kind: 'stun', duration: 0.75 }, knockback: 2.5 },
      ],
    },
  },
  heroics: [
    {
      name: 'Last Kingdom', icon: characterBurstArt('crown'), cooldown: 20, cost: 100, aim: 'circle', range: 10, radius: 6.5,
      desc: 'Heroic. A golden nova erupts at the target area, dealing 260 damage to enemies inside.',
      cast: { kind: 'channel', time: 0.8 }, sound: 'special',
      effects: [{ kind: 'nova', at: 'aim', radius: 6.5, tint: GOLD, damage: 260 }],
    },
    {
      name: "Kingdom's Shield", cooldown: 30, cost: 100, aim: 'none', range: 0,
      desc: 'Heroic. Allies within 10 take 40% less damage for 5 seconds.',
      cast: { kind: 'channel', time: 0.5 }, sound: 'special',
      effects: [{ kind: 'nova', at: 'self', radius: 10, tint: GOLD, allyStatus: { kind: 'fortify', duration: 5, amount: 0.4 } }],
    },
  ],
};
