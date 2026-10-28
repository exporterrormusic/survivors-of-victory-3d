// Scarlet's talent tiers: one Sword, Dash Slash and Burst option per tier, the level-10 Dash Slash
// form, and the level-20 storm tier (No Hard Feelings upgrades either form). Dodge and Parry are
// part of her base kit. Numbers live in scarlet/index.ts and scarlet/mechanics.ts.
import type { TalentSet, TalentTier, TierTalent } from '../talent-tiers';

const talent = (t: TierTalent) => t;

const TIERS: readonly TalentTier[] = [
  { level: 1, label: 'Quest', options: [
    talent({ id: 'eviscerate', name: 'Eviscerate', ability: 'weapon', icon: 'blood', effects: ['eviscerate'],
      description: 'Slashed enemies bleed for 5× your attack damage over 5 s.',
      quest: { goal: 120, label: 'Sword kills', counts: (kill) => kill.source === 'attack' || kill.burning, reward: ['hemorrhage'],
        rewardName: 'Hemorrhage', rewardText: 'Your bleeds deal double damage.' } }),
    talent({ id: 'vampiric_slash', name: 'Vampiric Slash', ability: 'special', icon: 'blood', effects: ['special_heal'],
      description: 'Each enemy the Dash Slash wave hits heals you for 1.5 HP.',
      quest: { goal: 80, label: 'Dash Slash kills', counts: (kill) => kill.source === 'special', reward: ['special_cd'],
        rewardName: 'Quick Slash', rewardText: 'Dash Slash recharges in 3 s instead of 5 s.' } }),
    talent({ id: 'execution', name: 'Execution', ability: 'burst', icon: 'blood', effects: ['burst_execute'],
      description: 'Burst always kills regular enemies, whatever their health, and heavies below 30%. Each execution gives +20 bonus XP.',
      quest: { goal: 60, label: 'Burst kills', counts: (kill) => kill.source === 'burst', reward: ['burst_gauge'],
        rewardName: 'Fire In My Veins', rewardText: 'Each Burst kill refunds 3 gauge, up to 30 per Burst.' } }),
  ] },
  { level: 4, label: 'Edge', options: [
    talent({ id: 'finishing_blow', name: 'Finishing Blow', ability: 'weapon', icon: 'sword', effects: ['finishing_blow'],
      description: 'Slashes deal double damage to enemies below 30% health.' }),
    talent({ id: 'in_one_strike', name: 'In One Strike', ability: 'special', icon: 'blast', effects: ['in_one_strike'],
      description: 'Enemies killed by the Dash Slash wave explode, hitting everything within 4 m for the wave\'s damage.' }),
    talent({ id: 'drink_to_victory', name: 'Drink to Victory', ability: 'burst', icon: 'blood', effects: ['drink_to_victory'],
      description: 'Each enemy the Burst kills heals you for 2.5 HP, up to 15 HP per Burst.' }),
  ] },
  { level: 7, label: 'Flourish', options: [
    talent({ id: 'roses_core', name: 'Rose\'s Core', ability: 'weapon', icon: 'petal', effects: ['roses_core'],
      description: 'Every slash also throws 5 rose petals that fly forward for half slash damage.' }),
    talent({ id: 'twin_moon', name: 'Twin Moon', ability: 'special', icon: 'wave', effects: ['twin_moon'],
      description: 'Dash Slash releases two extra waves angled to either side, each at 60% damage.' }),
    talent({ id: 'd1_crashout', name: 'D1 Crashout', ability: 'burst', icon: 'stun', effects: ['d1_crashout'],
      description: 'Enemies the Burst hits, and their shots, stay frozen for 3 s afterwards (bosses 5 s).' }),
  ] },
  { level: 10, label: 'Dash Slash form', options: [
    talent({ id: 'nothing_personal', name: 'Nothing Personal, Kid', ability: 'special', icon: 'chevrons', effects: ['nothing_personal', 'surprise'],
      description: 'Press Special again to teleport to the wave and strike around you for 3× damage, stunning survivors for 2 s.' }),
    talent({ id: 'musashi', name: 'Musashi', ability: 'special', icon: 'wave', effects: ['musashi'],
      description: 'Hold Special up to 2 s: the wave grows up to 3× larger and deals up to 3× damage.' }),
  ] },
  { level: 13, label: 'Mastery', options: [
    talent({ id: 'evasion', name: 'Evasion', ability: 'utility', icon: 'shield', effects: ['evasion'],
      description: 'Deflecting a bullet with Parry makes you untouchable for 1 s, and your next sword slash deals 100% more damage.' }),
    talent({ id: 'crimson_edge', name: 'Crimson Edge', ability: 'special', icon: 'blood', effects: ['crimson_edge'],
      description: 'The Dash Slash wave makes everything it hits bleed for 5× the wave\'s damage over 5 s.' }),
    talent({ id: 'expose_weakness', name: 'Expose Weakness', ability: 'burst', icon: 'focus', effects: ['expose_weakness'],
      description: 'Enemies that survive the Burst are marked: +100% damage taken for 6 s.' }),
  ] },
  { level: 16, label: 'Red Line', options: [
    talent({ id: 'retaliation', name: 'Retaliation', ability: 'weapon', icon: 'shield', effects: ['retaliation'],
      description: 'Bullets you deflect with Parry deal 10× their damage instead of 1×.' }),
    talent({ id: 'rising_tide', name: 'Rising Tide', ability: 'special', icon: 'wave', effects: ['rising_tide'],
      description: 'Each enemy the Dash Slash wave hits fills 2 Burst gauge.' }),
    talent({ id: 'scraping_the_bottle', name: 'Scraping the Bottle', ability: 'burst', icon: 'blood', effects: ['low_hp_damage'],
      description: 'Damage rises with missing health, up to +150% at 50% HP or lower. Burst locks in your HP when it starts.' }),
  ] },
  { level: 20, label: 'Storm', options: [
    talent({ id: 'i_am_cheating', name: 'I am cheating', ability: 'weapon', icon: 'sword', effects: ['i_am_cheating'],
      description: 'Each consecutive slash on the same enemy doubles its damage, up to 4×.' }),
    talent({ id: 'no_hard_feelings', name: 'No Hard Feelings', ability: 'special', icon: 'blast', effects: ['no_hard_feelings'],
      description: 'Nothing Personal\'s strike deals 12× instead of 3×; a fully charged Musashi wave deals double.' }),
    talent({ id: 'goddess', name: 'A Goddess Who Cannot Yield', ability: 'burst', icon: 'goddess', effects: ['goddess_no_yield'],
      description: 'Each Burst has a 25% chance to keep the whole gauge and a 25% chance to keep half.' }),
  ] },
];

export const SCARLET_TALENTS: TalentSet = { abilities: { weapon: 'Sword', special: 'Dash Slash', burst: 'Burst', utility: 'Utility' }, tiers: TIERS };
