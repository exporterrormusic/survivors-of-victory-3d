// Snow White: ranged assassin. Long-range sniper attacks, a deployable turret (her Survivors
// special), a marking shot, and Seven Dwarves (her burst) or the Heavy Arms beam. First-pass numbers; see docs/KIT_PLAN.md.
import type { Kit } from '../../abilities/types';
import { characterBurstArt } from '../assets';

export const kit: Kit = {
  stats: { hp: 1450, moveSpeed: 5.5, resource: { kind: 'mana', max: 500, regen: 3 } },
  basic: { weapon: { kind: 'sniper', speed: 66 }, windup: 0.12, range: 7.5, period: 0.35, damage: 7, aimedRange: 14, tint: '#bcecff', magazine: { size: 7, reload: 1.5 } },
  trait: {
    name: 'Equipment Gathering', icon: 'ui/textures/equipment.webp',
    desc: 'Trait. Every third basic attack is a charged shot that deals double damage.',
    chargedShot: { every: 3, multiplier: 2 },
  },
  abilities: {
    Q: {
      name: 'Piercing Shot', icon: 'ui/textures/piercing-shot.webp', cooldown: 5, cost: 40, aim: 'line', range: 16, width: 0.8,
      desc: 'Fire a round that pierces through every enemy in a line, dealing 40 damage to each.',
      cast: { kind: 'shot' }, sound: 'weapon',
      effects: [{ kind: 'bolt', damage: 40, range: 16, pierce: true }],
    },
    W: {
      name: 'Auto-Turret', cooldown: 10, cost: 60, aim: 'circle', range: 6, radius: 0.8,
      desc: 'Deploy a missile turret for 12 seconds. It fires at enemies within 7.5 range for 18 damage. Up to two turrets at once.',
      cast: { kind: 'shot' }, sound: 'summon',
      effects: [{
        kind: 'summon', at: 'aim',
        unit: {
          name: 'Auto-Turret', model: 'turret', hp: 240, damage: 18, range: 7.5, cooldown: 0.9,
          lifetime: 12, behaviour: 'guard', speed: 0, limit: 2,
        },
      }],
    },
    E: {
      name: 'Weak Point', cooldown: 8, cost: 50, aim: 'line', range: 14, width: 0.7,
      desc: 'Fire a marking round. The first enemy hit takes 30 damage, then 25% more damage from all sources for 4 seconds.',
      cast: { kind: 'shot' }, sound: 'weapon',
      effects: [{ kind: 'bolt', damage: 30, range: 14, size: 1.2, tint: '#ff6f6f', status: { kind: 'vulnerable', duration: 4, amount: 0.25 } }],
    },
  },
  heroics: [
    {
      name: 'Seven Dwarves', icon: 'ui/textures/seven-dwarves.webp', cooldown: 20, cost: 100, aim: 'cone', range: 15, angle: Math.PI / 2,
      desc: 'Heroic. Fire the Seven Dwarves in a 90° blast, dealing 260 damage to enemies within 15 and knocking them back.',
      cast: { kind: 'channel', time: 0.6 }, sound: 'beam',
      effects: [{ kind: 'cone', range: 15, angle: Math.PI / 2, tint: '#ffb070', damage: 260, knockback: 2 }],
    },
    {
      name: 'Heavy Arms', icon: characterBurstArt('snow-white'), cooldown: 12, cost: 100, aim: 'line', range: 34, width: 1.4,
      desc: 'Heroic. Channel a massive beam for 1.6 seconds, dealing 160 damage per second to enemies in a line.',
      cast: { kind: 'channel', time: 1.6 }, sound: 'beam',
      effects: [{ kind: 'beam', dps: 160, width: 1.4, length: 34 }],
    },
  ],
};
