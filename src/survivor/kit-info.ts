// Plain-language base kits for the talent board's Kit strip and Character Select. Passive numbers
// come straight from src/survivor/passives.ts so the text stays true when they are retuned.

import { DRINK_DELAY, DRINK_HEAL, DRINK_TIME, FOCUS_MAX, FOCUS_RATE, PASSIVE_DELAY, ZONE_BONUS, ZONE_GROW, ZONE_MAX } from './passives';

export type KitSlot = 'weapon' | 'special' | 'burst' | 'passive';
export interface KitEntry { slot: KitSlot; name: string; text: string }
export interface KitInfo { passiveName: string; passiveSummary: string; icons: { weapon: string; special: string }; entries: KitEntry[] }

const pct = (n: number) => `${Math.round(n * 1000) / 10}%`;

export const KIT_INFO: Record<'snow-white' | 'scarlet' | 'rapunzel', KitInfo> = {
  scarlet: {
    passiveName: 'Drinking',
    passiveSummary: `Hold completely still for ${DRINK_DELAY} s to drink and slowly heal.`,
    icons: { weapon: 'sword', special: 'wave' },
    entries: [
      { slot: 'weapon', name: 'Sword', text: 'Wide melee slash, no reload. Each swing costs 3% max HP, never below half health.' },
      { slot: 'special', name: 'Dash Slash', text: 'Sends a cutting wave forward. Her dash passes through enemies; her blade parries shots.' },
      { slot: 'burst', name: 'Scarlet Flash', text: 'Costs half her current HP, then strikes every enemy on screen, biggest first.' },
      { slot: 'passive', name: 'Drinking', text: `After ${DRINK_DELAY} s with no action, she drinks: ${pct(DRINK_HEAL)} max HP per ${DRINK_TIME} s. Any action stops it.` },
    ],
  },
  'snow-white': {
    passiveName: 'Focus',
    passiveSummary: `Standing still sharpens her aim: up to +${pct(FOCUS_MAX)} damage.`,
    icons: { weapon: 'rifle', special: 'turret' },
    entries: [
      { slot: 'weapon', name: 'Sniper Rifle', text: '7-round semi-automatic rifle whose shots pierce through enemies. 1.5 s reload.' },
      { slot: 'special', name: 'Auto-Turret', text: 'Deploys a turret that fires at nearby enemies on its own.' },
      { slot: 'burst', name: 'Seven Dwarves', text: 'A wide 90° cone of cold fire along her aim, dealing 10× her base damage.' },
      { slot: 'passive', name: 'Focus', text: `After ${PASSIVE_DELAY} s still, damage rises ${pct(FOCUS_RATE)} per second to +${pct(FOCUS_MAX)}. Moving resets it; shooting doesn't.` },
    ],
  },
  rapunzel: {
    passiveName: 'Sacred Ground',
    passiveSummary: `Standing still consecrates ground: +${pct(ZONE_BONUS)} damage inside it.`,
    icons: { weapon: 'halo', special: 'goddess' },
    entries: [
      { slot: 'weapon', name: 'Holy Rockets', text: '4-round launcher; each halo rocket bursts where it lands. 3 s reload.' },
      { slot: 'special', name: 'Divine Blessing', text: 'Places a blessing circle that heals her while she stands in it.' },
      { slot: 'burst', name: 'Garden of Shangri-La', text: 'Fully heals her and stuns enemies for 4 s.' },
      { slot: 'passive', name: 'Sacred Ground', text: `After ${PASSIVE_DELAY} s still, consecrates ground that grows to ${ZONE_MAX} m by ${ZONE_GROW} s. +${pct(ZONE_BONUS)} damage inside. Lasts until replaced.` },
    ],
  },
};
