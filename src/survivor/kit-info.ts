// Plain-language base kits for the talent board's Kit strip and Character Select. Passive numbers
// come straight from src/survivor/passives.ts so the text stays true when they are retuned.

import { DRINK_DELAY, DRINK_HEAL, DRINK_TIME, FOCUS_MAX, FOCUS_RATE, PASSIVE_DELAY, ZONE_BONUS, ZONE_GROW, ZONE_MAX } from './passives';

export type KitSlot = 'weapon' | 'special' | 'burst' | 'passive';
export interface KitEntry { slot: KitSlot; name: string; text: string }
export interface KitInfo { passiveName: string; passiveSummary: string; icons: { weapon: string; special: string }; entries: KitEntry[] }

const pct = (n: number) => `${Math.round(n * 1000) / 10}%`;

export const KIT_INFO: Record<'snow-white' | 'scarlet' | 'rapunzel' | 'nayuta' | 'dorothy', KitInfo> = {
  dorothy: {
    passiveName: 'Exposed', passiveSummary: 'Flight opens enemies to stronger rifle fire.',
    icons: { weapon: 'rifle', special: 'wings' },
    entries: [
      { slot: 'weapon', name: 'Ungrateful OZ', text: 'Automatic pink pulse rifle: 60 rounds, 1-second reload. Prototype balance.' },
      { slot: 'special', name: 'Angel’s Flight', text: 'RMB: fly invulnerably to the clicked cursor position, firing freely. Landing releases a 4m pink blast: 30 damage, outward knockback, and Exposed for 4s. No contact damage during flight. 8s cooldown; walls stop flight.' },
      { slot: 'burst', name: 'Paradise Lost', text: 'E at full gauge: deploy wing armor and pierce enemies for 8s. Brand a visible enemy nearest your aim, or your next hit if none is available. Store Dorothy’s damage to it (cap 180); on death or expiry, explode within 5m for 18 + 65% stored damage. Cover and shields block the blast.' },
      { slot: 'passive', name: 'Exposed', text: 'The landing blast makes enemies take 35% more damage from Dorothy’s rifle for 4s. Landing damage and empowered rifle hits feed her Brand. Separate passive and talents remain unassigned.' },
    ],
  },
  nayuta: {
    passiveName: 'Stillness of Many', passiveSummary: 'Meditate while your clones fight; retrieve them for Insight.',
    icons: { weapon: 'halo', special: 'clone' },
    entries: [
      { slot: 'weapon', name: 'Nirvana', text: 'Paired gold shots direct clones to your target. Each Insight grants Nayuta and her clones 25% damage, plus 7.5% movement speed to Nayuta: up to +100% damage and +30% speed.' },
      { slot: 'special', name: 'Manifestation / Return', text: 'Tap RMB to summon a regular gold clone (3 charges, 6 s recharge, cap 4). At cap, tap to reposition. Hold RMB to retrieve the weakest clone. Regular clones grant 0.5 Insight when fresh, rising to 1 when mature; silver clones grant 0.25. No baseline healing.' },
      { slot: 'burst', name: 'White Procession', text: 'Summon 8 silver-white clones that charge toward your cursor and fight for 8 s, independently of regular clones. Keep shooting to focus their attacks, or retrieve them for Insight. Death and natural expiration grant nothing.' },
      { slot: 'passive', name: 'Stillness of Many', text: 'After 1.5 s without moving or shooting, meditate: regular clones mature twice as fast, summon recharge is 50% faster, and Insight duration pauses. Insight caps at 4. The first return starts 10 s. Later returns add 1/3 of the maximum duration when fresh, rising to 2/3 when mature, capped at the maximum. Moving, shooting or reloading ends meditation; clone commands preserve it.' },
    ],
  },
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
