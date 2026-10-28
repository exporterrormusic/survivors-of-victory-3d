// Rapunzel's talent tiers: one Holy Grace, Divine Blessing and Burst option per tier, the level-10
// Burst form, and the level-20 storm tier. The halo barrage is the level-10 form 6,000? Really?;
// Extra Stuffed and Incendiary Rockets upgrade it. Numbers live in rapunzel/index.ts.
import type { TalentSet, TalentTier, TierTalent } from '../talent-tiers';

const talent = (t: TierTalent) => t;

const TIERS: readonly TalentTier[] = [
  { level: 1, label: 'Quest', options: [
    talent({ id: 'burning_desire', name: 'Burning Desire', ability: 'weapon', icon: 'flame', effects: ['burning_desire'],
      description: 'Halos leave golden fire on the ground for 5 s, damaging enemies inside it.',
      quest: { goal: 120, label: 'Halo kills', counts: (kill) => kill.source === 'attack', reward: ['spread_love'],
        rewardName: 'Spread the Love', rewardText: 'Your ground fire covers twice the radius.' } }),
    talent({ id: 'burning_sensation', name: 'A Burning Sensation', ability: 'special', icon: 'flame', effects: ['burning_sensation'],
      description: 'Divine Blessing also deals 10 damage per second to enemies inside it.',
      quest: { goal: 80, label: 'Blessing kills', counts: (kill) => kill.source === 'special', reward: ['more_more'],
        rewardName: 'More, more!', rewardText: 'Divine Blessing deals 4× as much damage.' } }),
    talent({ id: 'blinding_radiance', name: 'Blinding Radiance', ability: 'burst', icon: 'stun', effects: ['burst_stun'],
      description: 'Burst burns every enemy for 15 damage per second for 4 s.',
      quest: { goal: 60, label: 'Burst kills', counts: (kill) => kill.source === 'burst', reward: ['burst_gauge'],
        rewardName: 'Answered Prayer', rewardText: 'Each Burst kill refunds 3 gauge, up to 30 per Burst.' } }),
  ] },
  { level: 4, label: 'Grace', options: [
    talent({ id: 'concussive_blast', name: 'Concussive Blast', ability: 'weapon', icon: 'stun', effects: ['concussive_blast'],
      description: 'Halo impacts knock enemies away. Heavies and bosses hold their ground.' }),
    talent({ id: 'expanding_aura', name: 'Expanding Aura', ability: 'special', icon: 'shield', effects: ['special_size'],
      description: 'Divine Blessing covers twice the radius.' }),
    talent({ id: 'extra_stuffed', name: 'Holy Shockwave', ability: 'burst', icon: 'blast', effects: ['extra_stuffed'],
      description: 'Burst blasts nearby enemies away and stuns for 8 s instead of 4 s.' }),
  ] },
  { level: 7, label: 'Devotion', options: [
    talent({ id: 'anti_armor', name: 'Anti-Armor Munitions', ability: 'weapon', icon: 'focus', effects: ['anti_armor'],
      description: 'Your halo shots deal double damage to specialists, heavies and bosses.' }),
    talent({ id: 'oooh_ahhhh', name: 'Oooh, Ahhhh', ability: 'special', icon: 'stun', effects: ['oooh_ahhhh'],
      description: 'Enemies are stunned for 1 s the first time they enter a Divine Blessing. Bosses are not stunned.' }),
    talent({ id: 'consecration', name: 'Consecration', ability: 'burst', icon: 'flame', effects: ['consecration'],
      description: 'Burst leaves a wide circle of golden fire around you for 6 s that burns enemies inside it.' }),
  ] },
  { level: 10, label: 'Burst form', options: [
    talent({ id: 'burst_turrets', name: '6,000? Really?', ability: 'burst', icon: 'turret', effects: ['burst_turrets'],
      description: 'Burst also raises 10 halo launchers behind you that bombard the nearest enemies.' }),
    talent({ id: 'lingering_light', name: 'Lingering Light', ability: 'burst', icon: 'goddess', effects: ['lingering_light'],
      description: 'Burst leaves a large halo that follows you for 8 s, dealing 40 damage per second to enemies inside. You take 30% less damage while it lasts.' }),
  ] },
  { level: 13, label: 'Zeal', options: [
    talent({ id: 'it_burns', name: 'It Burns', ability: 'weapon', icon: 'flame', effects: ['it_burns'],
      description: 'Halo impacts burn enemies for 12 damage per second for 5 s, as does your ground fire.' }),
    talent({ id: 'rejuvenation', name: 'Rejuvenation', ability: 'special', icon: 'goddess', effects: ['special_power'],
      description: 'Divine Blessing heals 10% max HP per second instead of 3%.' }),
    talent({ id: 'judgement', name: 'Judgement', ability: 'burst', icon: 'chevrons', effects: ['judgement'],
      description: 'Burst slows every enemy, including heavies and bosses, by 50% for 10 s.' }),
  ] },
  { level: 16, label: 'Fervor', options: [
    talent({ id: 'swift_benediction', name: 'Swift Benediction', ability: 'weapon', icon: 'chevrons', effects: ['quick_hands'],
      description: 'Reload 30% faster. A halo that kills puts a round back in the magazine.' }),
    talent({ id: 'personal_toy', name: 'Personal Toy', ability: 'special', icon: 'goddess', effects: ['personal_toy'],
      description: 'While no Divine Blessing is placed, a Blessing follows you around.' }),
    talent({ id: 'holy_ordnance', name: 'Holy Ordnance', ability: 'burst', icon: 'blast', effects: ['holy_ordnance'],
      description: 'Your level 10 Burst form deals double damage: the 6,000? Really? halos or the Lingering Light halo.' }),
  ] },
  { level: 20, label: 'Storm', options: [
    talent({ id: 'endless_desire', name: 'Endless Desire', ability: 'weapon', icon: 'flame', effects: ['endless_desire'],
      description: 'Halo hits apply burns that never expire and stack on each hit, up to 5 stacks of 12 damage per second.' }),
    talent({ id: 'all_the_toys', name: 'All the Toys', ability: 'special', icon: 'goddess', effects: ['all_the_toys'],
      description: 'Divine Blessing stores 2 charges. With Personal Toy, your following Blessing stays out too.' }),
    talent({ id: 'goddess', name: 'A Goddess Who Cannot Yield', ability: 'burst', icon: 'goddess', effects: ['goddess_no_yield'],
      description: 'Each Burst has a 25% chance to keep the whole gauge and a 25% chance to keep half.' }),
  ] },
];

export const RAPUNZEL_TALENTS: TalentSet = { abilities: { weapon: 'Holy Grace', special: 'Blessing', burst: 'Burst', utility: 'Utility' }, tiers: TIERS };
