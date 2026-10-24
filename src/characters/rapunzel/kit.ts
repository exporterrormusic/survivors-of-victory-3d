// Rapunzel: healer. Splashing rockets, a heavy rocket, the Divine Blessing healing zone (her
// Survivors special), a healing flash and Garden of Shangri-La. First-pass numbers; see docs/KIT_PLAN.md.
import type { Kit } from '../../abilities/types';
import { characterBurstArt } from '../assets';

export const kit: Kit = {
  stats: { hp: 1350, moveSpeed: 5.3, resource: { kind: 'mana', max: 520, regen: 3.2 } },
  basic: { weapon: { kind: 'rocket', speed: 12, radius: 1.8 }, windup: 0.12, range: 6, period: 0.5, damage: 15, aimedRange: 10, tint: '#ffd94d', magazine: { size: 4, reload: 3 } },
  trait: {
    name: 'Divine Grace',
    desc: 'Trait. Rocket basic attacks explode, dealing 50% of their damage to other enemies within 1.8 of the target.',
    splash: { radius: 1.8, fraction: 0.5 },
  },
  abilities: {
    Q: {
      name: 'Rocket Barrage', cooldown: 6, cost: 50, aim: 'circle', range: 11, radius: 2.6,
      desc: 'Launch a heavy rocket that deals 55 damage to enemies in the area.',
      cast: { kind: 'shot' }, sound: 'special',
      effects: [{ kind: 'lob', damage: 55, radius: 2.6, flight: 0.6, tint: '#ffd94d' }],
    },
    W: {
      name: 'Divine Blessing', cooldown: 14, cost: 70, aim: 'circle', range: 8, radius: 3.2,
      desc: 'Bless an area for 6 seconds. Allies inside, Rapunzel included, restore 3% of their maximum health per second.',
      cast: { kind: 'shot' }, sound: 'heal',
      effects: [{ kind: 'zone', at: 'aim', zone: { radius: 3.2, duration: 6, tint: '#7dffb0', heal: { percent: 0.03 } } }],
    },
    E: {
      name: 'Guiding Light', cooldown: 10, cost: 60, aim: 'none', range: 0,
      desc: 'Release a flash of light. Allies within 4.5 heal 120 plus 4% of their maximum health; enemies are slowed by 40% for 2 seconds.',
      cast: { kind: 'shot' }, sound: 'heal',
      effects: [{
        kind: 'nova', at: 'self', radius: 4.5, tint: '#fff3a8',
        heal: { flat: 120, percent: 0.04 }, status: { kind: 'slow', duration: 2, amount: 0.4 },
      }],
    },
  },
  heroics: [
    {
      name: 'Garden of Shangri-La', icon: characterBurstArt('rapunzel'), cooldown: 20, cost: 100, aim: 'none', range: 0,
      desc: 'Heroic. Allies within 7 heal 25% of their maximum health and are invulnerable for 2 seconds. Enemies in range are stunned for 1.5 seconds.',
      cast: { kind: 'channel', time: 0.6 }, sound: 'heal',
      effects: [{
        kind: 'nova', at: 'self', radius: 7, tint: '#ffe36b',
        heal: { percent: 0.25 }, allyStatus: { kind: 'invulnerable', duration: 2 }, status: { kind: 'stun', duration: 1.5 },
      }],
    },
    {
      name: 'Pure Grace', cooldown: 30, cost: 100, aim: 'none', range: 0,
      desc: 'Heroic. Allies within 9 gain a 400 shield for 6 seconds and heal 10% of their maximum health.',
      cast: { kind: 'channel', time: 0.5 }, sound: 'heal',
      effects: [{
        kind: 'nova', at: 'self', radius: 9, tint: '#bff6ff',
        heal: { percent: 0.1 }, allyStatus: { kind: 'shield', duration: 6, amount: 400 },
      }],
    },
  ],
};
