// Slots every hero shares (mount, hearthstone, emote) and the one lookup the HUD, targeting
// and cast checks use for any slot of any kit.
import type { AbilityDefinition, Kit, KitSlot, Slot, SlotInfo } from './types';

/** Big buttons on the ability bar; Z and B sit at its ends as small buttons. */
export const BAR: readonly Slot[] = ['Q', 'W', 'E', 'R', 'D'];

export const MOUNT = { castTime: 1, speedBonus: 0.3 };
export const HEARTH = { channel: 6 };
export const EMOTE_COOLDOWN = 1;

const SHARED: Readonly<Record<'Z' | 'B' | 'T', SlotInfo>> = {
  Z: {
    name: 'Hoverboard', icon: 'ui/textures/hoverboard.webp', glyph: '⇡', cooldown: 0, cost: 0, aim: 'none', range: 0, passive: false,
    desc: 'Mount up after 1 second. Increases movement speed by 30%. Attacking or using an ability dismounts.',
  },
  B: {
    name: 'Hearthstone', icon: 'ui/textures/recall.webp', glyph: '⌂', cooldown: 0, cost: 0, aim: 'none', range: 0, passive: false,
    desc: 'After channeling for 6 seconds, return to your base.',
  },
  T: { name: 'Emote', glyph: '♪', cooldown: EMOTE_COOLDOWN, cost: 0, aim: 'none', range: 0, passive: false, desc: 'Strike a pose.' },
};

/** HotS heroics unlock at this team level (unless the match allows them from the start). */
export const HEROIC_LEVEL = 10;

const UNCHOSEN_HEROIC: SlotInfo = {
  name: 'Heroic', glyph: '?', cooldown: 0, cost: 0, aim: 'none', range: 0, passive: false,
  desc: `Choose one of two heroic abilities when they unlock (team level ${HEROIC_LEVEL}, or from the start in practice).`,
};

/** The ability in `slot`; R is heroic number `heroic`. */
export function abilityOf(kit: Kit, slot: KitSlot, heroic: number): AbilityDefinition {
  return slot === 'R' ? kit.heroics[heroic] ?? kit.heroics[0] : kit.abilities[slot];
}

/** What any slot shows and costs. `heroic` is the chosen R, or null before the choice. */
export function slotInfo(kit: Kit, slot: Slot, heroic: number | null): SlotInfo {
  if (slot === 'Z' || slot === 'B' || slot === 'T') return SHARED[slot];
  if (slot === 'D') {
    const t = kit.trait;
    return { name: t.name, desc: t.desc, icon: t.icon, glyph: '◆', cooldown: 0, cost: 0, aim: 'none', range: 0, passive: true };
  }
  if (slot === 'R' && heroic === null) return UNCHOSEN_HEROIC;
  return abilityInfo(abilityOf(kit, slot, heroic ?? 0));
}

export function abilityInfo(a: AbilityDefinition): SlotInfo {
  return {
    name: a.name, desc: a.desc, icon: a.icon, glyph: glyphFor(a), cooldown: a.cooldown, cost: a.cost,
    aim: a.aim, range: a.range, width: a.width, radius: a.radius, angle: a.angle, passive: false,
  };
}

/** Placeholder art from what the ability does, until it has a painted icon. */
function glyphFor(a: AbilityDefinition): string {
  if (a.cast.kind === 'dash') return '➟';
  const kinds = new Set(a.effects.map((e) => e.kind));
  if (kinds.has('summon')) return '✦';
  if (kinds.has('convert')) return '♥';
  if (kinds.has('beam')) return '≡';
  if (a.effects.some((e) => (e.kind === 'zone' || e.kind === 'nova') && (e.kind === 'zone' ? e.zone.heal : e.heal))) return '✚';
  if (kinds.has('zone')) return '◎';
  if (kinds.has('nova')) return '✺';
  if (kinds.has('cone')) return '◢';
  if (kinds.has('lob')) return '✸';
  if (kinds.has('self')) return '▲';
  return '➤';
}
