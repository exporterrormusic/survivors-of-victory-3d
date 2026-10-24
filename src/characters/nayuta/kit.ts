// Nayuta: summoner. Slowing ring attacks, a clone of herself (her Survivors special), a galaxy
// orb, a blink and the Asceticism explosion. First-pass numbers; see docs/KIT_PLAN.md.
import type { Kit } from '../../abilities/types';
import { characterBurstArt } from '../assets';

const GALAXY = '#a98bff';

export const kit: Kit = {
  stats: { hp: 1400, moveSpeed: 5.5, resource: { kind: 'mana', max: 500, regen: 3 } },
  basic: { weapon: { kind: 'smg', speed: 36, separation: 0.36 }, windup: 0.02, range: 6.5, period: 0.08, damage: 2, aimedRange: 9, tint: '#c9a8ff', magazine: { size: 30, reload: 2 } },
  trait: {
    name: 'Wu Wei',
    desc: 'Trait. Basic attacks slow enemies by 15% for 1 second.',
    onHit: { kind: 'slow', duration: 1, amount: 0.15 },
  },
  abilities: {
    Q: {
      name: 'Summon Clone', cooldown: 12, cost: 60, aim: 'none', range: 0,
      desc: 'Summon a clone of Nayuta that follows her and fights for 15 seconds. It has 350 health and deals 13 damage per attack.',
      cast: { kind: 'shot' }, sound: 'summon',
      effects: [{
        kind: 'summon', at: 'self',
        unit: {
          name: 'Nayuta (Clone)', model: 'caster', hp: 350, damage: 13, range: 6.5, cooldown: 1.1,
          lifetime: 15, behaviour: 'follow', speed: 5.5, limit: 1, tint: [0.9, 0.8, 1.5],
        },
      }],
    },
    W: {
      name: 'Galaxy Orb', cooldown: 7, cost: 50, aim: 'circle', range: 10, radius: 2.4,
      desc: 'Hurl an orb that deals 30 damage and leaves a field for 2.5 seconds that slows enemies by 35%.',
      cast: { kind: 'shot' }, sound: 'weapon',
      effects: [{
        kind: 'lob', damage: 30, radius: 2.4, flight: 0.55, tint: GALAXY,
        zone: { radius: 2.4, duration: 2.5, tint: GALAXY, status: { kind: 'slow', duration: 0.5, amount: 0.35 } },
      }],
    },
    E: {
      name: 'Detachment', cooldown: 9, cost: 40, aim: 'dash', range: 5, width: 1,
      desc: 'Glide up to 5 range. On arrival, enemies within 2.5 are slowed by 40% for 1.5 seconds.',
      cast: { kind: 'dash', time: 0.25 }, sound: 'dash',
      effects: [{ kind: 'nova', at: 'self', radius: 2.5, tint: GALAXY, status: { kind: 'slow', duration: 1.5, amount: 0.4 } }],
    },
  },
  heroics: [
    {
      name: 'Asceticism', icon: characterBurstArt('nayuta'), cooldown: 20, cost: 100, aim: 'circle', range: 12, radius: 4.5,
      desc: 'Heroic. Call down a galaxy explosion that deals 180 damage to enemies in the area and stuns them for 1 second.',
      cast: { kind: 'channel', time: 0.7 }, sound: 'special',
      effects: [{ kind: 'lob', damage: 180, radius: 4.5, flight: 0.9, tint: GALAXY, status: { kind: 'stun', duration: 1 } }],
    },
    {
      name: 'Duality', cooldown: 30, cost: 100, aim: 'none', range: 0,
      desc: 'Heroic. Split into two clones that fight beside Nayuta for 10 seconds. Each has 450 health and deals 16 damage per attack.',
      cast: { kind: 'channel', time: 0.5 }, sound: 'summon',
      effects: [{
        kind: 'summon', at: 'self', count: 2,
        unit: {
          name: 'Nayuta (Duality)', model: 'caster', hp: 450, damage: 16, range: 6.5, cooldown: 1,
          lifetime: 10, behaviour: 'follow', speed: 5.5, limit: 2, tint: [1.4, 1.1, 1.6],
        },
      }],
    },
  ],
};
