// Snow White's talent tiers: one rifle, turret and Burst/utility option per tier, the level-10
// Burst form, and the level-20 storm tier. Numbers follow the balance pass in
// docs/SNOW_WHITE_TALENT_TIERS.md; the combat files hold the matching values.
import type { TalentSet, TalentTier, TierTalent } from '../talent-tiers';

const talent = (t: TierTalent) => t;

const TIERS: readonly TalentTier[] = [
  { level: 1, label: 'Quest', options: [
    talent({ id: 'marked_rounds', name: 'Marked Rounds', ability: 'weapon', icon: 'rounds', effects: ['weak_point'],
      description: 'Bullet hits mark enemies with Weak Point: +50% damage taken from everything for 4 s.',
      quest: { goal: 150, label: 'Rifle kills', counts: (kill) => kill.source === 'attack' || kill.marked, reward: ['explosive_rounds'],
        rewardName: 'Explosive Rounds', rewardText: '25% of bullet kills explode, hitting enemies within 2 m.' } }),
    talent({ id: 'expanded_arsenal', name: 'Expanded Arsenal', ability: 'special', icon: 'turret', effects: ['special_capacity'],
      description: 'Each turret carries 8 missiles instead of 4.',
      quest: { goal: 100, label: 'Turret kills', counts: (kill) => kill.source === 'special', reward: ['special_count'],
        rewardName: 'Full Battery', rewardText: 'Store 4 turret charges and keep up to 4 turrets deployed.' } }),
    talent({ id: 'fully_active', name: 'Fully Active', ability: 'burst', icon: 'chevrons', effects: ['burst_burn'],
      description: 'Burst sets enemies burning for 30% of its damage per second for 3 s.',
      quest: { goal: 40, label: 'Burst kills', counts: (kill) => kill.source === 'burst', reward: ['burst_gauge'],
        rewardName: 'Second Wind', rewardText: 'Each Burst kill refunds 3 gauge, up to 30 per Burst.' } }),
  ] },
  { level: 4, label: 'Fire', options: [
    talent({ id: 'afterburn', name: 'Afterburn', ability: 'weapon', icon: 'flame', effects: ['afterburn'],
      description: 'Shots leave a strip of blue fire that damages enemies inside it for 3 s.' }),
    talent({ id: 'incendiary_arsenal', name: 'Incendiary Arsenal', ability: 'special', icon: 'flame', effects: ['incendiary_ammo'],
      description: 'Missiles set enemies burning for 4× missile damage over 5 s.' }),
    talent({ id: 'cold_focus', name: 'Cold Focus', ability: 'utility', icon: 'focus', effects: ['cold_focus'],
      description: 'Focus starts after 1 s instead of 3 s, and holds for 1.5 s after you move.' }),
  ] },
  { level: 7, label: 'Control', options: [
    talent({ id: 'charging', name: 'Charging', ability: 'weapon', icon: 'focus', effects: ['charging'],
      description: 'Hold fire up to 1.5 s. The released shot deals up to 3× damage and is up to 3× wider.' }),
    talent({ id: 'defensive_line', name: 'Defensive Line', ability: 'special', icon: 'shield', effects: ['defensive_line'],
      description: 'Each turret deals your attack damage every second to enemies close to it.' }),
    talent({ id: 'shock_blast', name: 'Shock Blast', ability: 'burst', icon: 'stun', effects: ['burst_stun'],
      description: 'Burst stuns enemies permanently. Bosses are stunned for 5 s.' }),
  ] },
  { level: 10, label: 'Burst form', options: [
    talent({ id: 'focused_fire', name: 'Focused Fire', ability: 'burst', icon: 'focus', effects: ['focused_fire'],
      description: 'Hold E up to 2.5 s to narrow the Burst to a 15° beam dealing up to 4× damage.' }),
    talent({ id: 'century_prep', name: 'A Century of Prep Time', ability: 'burst', icon: 'battery', effects: ['century_prep'],
      description: 'Using Burst also deploys four turrets around you.' }),
  ] },
  { level: 13, label: 'Mastery', options: [
    talent({ id: 'inferno', name: 'Inferno', ability: 'weapon', icon: 'flame', effects: ['inferno'],
      description: 'Bullets burn enemies for your attack damage per second for 5 s. Anything burning is slowed 30%.' }),
    talent({ id: 'permanent_emplacement', name: 'Permanent Emplacement', ability: 'special', icon: 'battery', effects: ['permanent_emplacement'],
      description: 'Empty turrets reload in 6 s instead of breaking. Deploying past the cap retires the oldest.' }),
    talent({ id: 'unyielding', name: 'Unyielding', ability: 'utility', icon: 'crown', effects: ['unyielding'],
      description: 'Bullet kills heal 1 HP. Every 10 rifle hits on a heavy or boss also heal 1 HP.' }),
  ] },
  { level: 16, label: 'Edge', options: [
    talent({ id: 'quick_hands', name: 'Quick Hands', ability: 'weapon', icon: 'rounds', effects: ['quick_hands'],
      description: 'A bullet kill puts a round back in the magazine, once per shot. Reloads are 30% faster.' }),
    talent({ id: 'armor_break', name: 'Armor Break', ability: 'special', icon: 'shield', effects: ['armor_piercing'],
      description: 'Missiles mark enemies with Armor Break: +75% damage taken for 6 s. Stacks with Weak Point.' }),
    talent({ id: 'shatter', name: 'Shatter', ability: 'burst', icon: 'blast', effects: ['shatter'],
      description: 'Burst deals double damage to enemies that are marked or burning.' }),
  ] },
  { level: 20, label: 'Storm', options: [
    talent({ id: 'seventh_dwarf', name: 'Seventh Dwarf', ability: 'weapon', icon: 'anti-ship', effects: ['seventh_dwarf'],
      description: 'Every 7th shot is a wide piercing round that hits as hard as a Burst.' }),
    talent({ id: 'detonation', name: 'Detonation', ability: 'special', icon: 'blast', effects: ['detonation'],
      description: 'The last missile in every turret load is a heavy warhead: 3× damage and 3× blast radius.' }),
    talent({ id: 'goddess', name: 'A Goddess Who Cannot Yield', ability: 'burst', icon: 'goddess', effects: ['goddess_no_yield'],
      description: 'Each Burst has a 25% chance to keep the whole gauge and a 25% chance to keep half.' }),
  ] },
];

export const SNOW_WHITE_TALENTS: TalentSet = { abilities: { weapon: 'Rifle', special: 'Turret', burst: 'Burst', utility: 'Utility' }, tiers: TIERS };
