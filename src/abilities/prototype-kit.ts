// The feel-test kit every character used before kits existed. Characters without a kit.ts of
// their own still get it (src/characters/index.ts, kitOf). Numbers are placeholders.
import type { Kit } from './types';

export const PROTOTYPE_KIT: Kit = {
  stats: { hp: 1500, moveSpeed: 5.5, resource: { kind: 'mana', max: 500, regen: 3 } },
  basic: { weapon: { kind: 'assault', speed: 36 }, windup: 0.05, range: 6.5, period: 0.2, damage: 6, aimedRange: 11, magazine: { size: 30, reload: 2 } },
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
      name: 'Combat Dash', icon: 'ui/textures/snow-drift.webp', cooldown: 8, cost: 50, aim: 'dash', range: 6, width: 1.2,
      desc: 'Dash toward the target point, up to 6 range.',
      cast: { kind: 'dash', time: 0.22 }, sound: 'dash', effects: [],
    },
    E: {
      name: 'Frag Grenade', icon: 'ui/textures/frag-grenade.webp', cooldown: 7, cost: 60, aim: 'circle', range: 10, radius: 2.5,
      desc: 'Lob a grenade that explodes on landing, dealing 35 damage to enemies in the area.',
      cast: { kind: 'shot' }, sound: 'none',
      effects: [{ kind: 'lob', damage: 35, radius: 2.5 }],
    },
  },
  heroics: [
    {
      name: 'Full Burst', icon: 'ui/textures/seven-dwarves.webp', cooldown: 12, cost: 100, aim: 'line', range: 34, width: 1.4,
      desc: 'Heroic. Channel a massive beam for 1.6 seconds, dealing 160 damage per second to enemies in a line.',
      cast: { kind: 'channel', time: 1.6 }, sound: 'beam',
      effects: [{ kind: 'beam', dps: 160, width: 1.4, length: 34 }],
    },
  ],
};
