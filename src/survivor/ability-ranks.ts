import type { TalentTreeId } from '../characters/talent-types';

/** Per-purchase costs, separate from XP pacing. Rank 1 is free. */
export const ABILITY_RANK_COSTS = [0, 1, 2, 3, 4] as const;
export interface AbilityStage {
  readonly art: string;
  readonly name: string;
  readonly description: string;
  readonly icon: string;
  readonly effects: readonly string[];
}
export interface AbilityTrack {
  readonly id: TalentTreeId;
  readonly name: string;
  readonly art: string;
  readonly ranks: readonly AbilityStage[];
  readonly capstone: AbilityStage;
}

/** Snow White's authored rank bundles grant the flags already used by combat. */
export const ABILITY_TRACKS: readonly AbilityTrack[] = [
  {
    id: 'attack', name: 'Weapon', art: 'ui/survivor/snow-white-talents/weapon-v1.webp',
    ranks: [
      { name: 'Seven Dwarves: II', icon: 'rifle', art: 'ui/survivor/snow-white-talents/upgrades/basic_attack.webp', effects: ['basic_attack'], description: 'Snow White’s assault rifle, adapted here for long-range semi-automatic fire. Shots pierce every enemy in their path.' },
      { name: 'Marked Rounds', icon: 'rounds', art: 'ui/survivor/snow-white-talents/upgrades/weak_point.webp', effects: ['weak_point', 'explosive_rounds'], description: 'Hits mark enemies to take 4× damage. Bullet kills have a 25% chance to explode for your attack damage.' },
      { name: 'Afterburn', icon: 'flame', art: 'ui/survivor/snow-white-talents/upgrades/afterburn.webp', effects: ['afterburn'], description: 'Shots leave a damaging fire trail along their path.' },
      { name: 'Burning + Slow', icon: 'burn-slow', art: 'ui/survivor/snow-white-talents/upgrades/burning.webp', effects: ['burning', 'inferno'], description: 'Fire applies a burn for 5× your attack damage over 5 seconds and slows enemies inside it by 30%.' },
      { name: 'Charging', icon: 'charged', art: 'ui/survivor/snow-white-talents/upgrades/charging.webp', effects: ['charging'], description: 'Hold fire for up to 3 seconds, then release. The shot and its fire trail become up to 5× wider.' },
    ],
    capstone: { name: 'Unyielding', icon: 'crown', art: 'ui/survivor/snow-white-talents/upgrades/unyielding.webp', effects: ['unyielding'], description: 'Direct bullet kills have a 20% chance to restore 1 HP. Fire and damage-over-time kills do not trigger healing.' },
  },
  {
    id: 'skill', name: 'Special', art: 'ui/survivor/snow-white-talents/launcher-v1.webp',
    ranks: [
      { name: 'Missile Emplacement', icon: 'turret', art: 'ui/survivor/snow-white-talents/upgrades/special.webp', effects: ['special'], description: 'A deployable adaptation of Snow White’s missile launcher. Each auto-targeting turret carries 4 missiles; store 2 charges with an 8-second recharge.' },
      { name: 'Expanded Arsenal', icon: 'arsenal', art: 'ui/survivor/snow-white-talents/upgrades/special_capacity.webp', effects: ['special_capacity', 'special_count'], description: 'Turrets carry 8 missiles instead of 4. Store up to 4 charges and deploy up to 4 turrets.' },
      { name: 'Defensive Line', icon: 'shield', art: 'ui/survivor/snow-white-talents/upgrades/defensive_line.webp', effects: ['defensive_line'], description: 'Turrets project a damaging aura, dealing missile damage every second to enemies inside it.' },
      { name: 'Incendiary Arsenal', icon: 'flame', art: 'ui/survivor/snow-white-talents/upgrades/incendiary_ammo.webp', effects: ['incendiary_ammo', 'armor_piercing'], description: 'Missiles burn enemies for 4× missile damage over 5 seconds and mark them to take 4× damage. The mark stacks with Weak Point.' },
      { name: 'Permanent Emplacement', icon: 'battery', art: 'ui/survivor/snow-white-talents/upgrades/permanent_emplacement.webp', effects: ['permanent_emplacement'], description: 'Empty turrets reload in about 6 seconds instead of expiring. Deploying at the cap retires the oldest turret.' },
    ],
    capstone: { name: 'Detonation', icon: 'blast', art: 'ui/survivor/snow-white-talents/upgrades/detonation.webp', effects: ['detonation'], description: 'Destroyed or retired turrets explode for 3× missile damage in 3× the normal blast radius, applying missile debuffs.' },
  },
  {
    id: 'burst', name: 'Burst', art: 'ui/survivor/snow-white-talents/burst-v1.webp',
    ranks: [
      { name: 'Seven Dwarves: I', icon: 'anti-ship', art: 'ui/survivor/snow-white-talents/upgrades/burst.webp', effects: ['burst'], description: 'Snow White’s anti-ship rifle, adapted here as a long-range 90° blast. Deals heavy damage scaled from your attack. Requires a full Burst gauge.' },
      { name: 'Fully Active', icon: 'chevrons', art: 'ui/survivor/snow-white-talents/upgrades/burst_burn.webp', effects: ['burst_burn', 'burst_gauge'], description: 'The blast burns targets for 20% of their maximum HP per second for 3 seconds. Direct Burst kills have a 50% chance to recover gauge.' },
      { name: 'Focused Fire', icon: 'focus', art: 'ui/survivor/snow-white-talents/upgrades/focused_fire.webp', effects: ['focused_fire'], description: 'Hold Burst for up to 2.5 seconds. The cone narrows from 90° to 15° and deals up to 6× damage.' },
      { name: 'Pierce + Stun', icon: 'stun', art: 'ui/survivor/snow-white-talents/upgrades/pierce_through.webp', effects: ['pierce_through', 'burst_stun'], description: 'The blast applies Weak Point, making survivors take 4× damage, and stuns them for 5 seconds.' },
      { name: 'A Century of Prep Time', icon: 'battery-ring', art: 'ui/survivor/snow-white-talents/upgrades/century_prep.webp', effects: ['century_prep'], description: 'Using Burst also deploys four turrets around the camera perimeter.' },
    ],
    capstone: { name: 'A Goddess Who Cannot Yield', icon: 'goddess', art: 'ui/survivor/snow-white-talents/upgrades/goddess_no_yield.webp', effects: ['goddess_no_yield'], description: 'On Burst: a 25% chance to keep all gauge, a 25% chance to keep half, and a 50% chance to spend it all.' },
  },
];
