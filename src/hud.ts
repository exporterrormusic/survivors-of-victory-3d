// NIKKE-inspired DOM HUD with MOBA ability slots, illustrated portraits and unit frames.
// Responsive sizing lives in CSS; gameplay labels are limited to keys and resource values.

import type { Combat } from './combat';
import type { Hero } from './hero';
import { BAR, abilityInfo, slotInfo } from './abilities/common';
import type { Kit, Slot, StatusKind } from './abilities/types';
import { BattlegroundHud } from './battleground-hud';
import { mountTopFrames } from './ui/top-frames';

export interface ScreenPoint {
  x: number;
  y: number;
  visible: boolean;
}

type DisplayedStatus = Exclude<StatusKind, 'shield'>;

/** Marker colour beside a minion's health bar. Heroes show statuses as effects on the model, never as text. */
const STATUS_COLORS: Readonly<Record<DisplayedStatus, string>> = {
  stun: '#ffd84a', root: '#c58bff', slow: '#6fb8ff', vulnerable: '#ff6f6f', burn: '#ff9b3d', invulnerable: '#ffffff',
  haste: '#7dffb0', frenzy: '#ffb347', empower: '#ff6ec7', fortify: '#c9d6ff',
};

const RESOURCE_LABELS = { mana: 'Mana', fuel: 'Fuel', health: 'Health' } as const;
type ResourceKind = keyof typeof RESOURCE_LABELS;

/** World height of the hero frame's bottom edge: clear of the tallest chibi's head. */
const HERO_FRAME_HEIGHT = 3.3;

/** The trait button's counter: charged-shot pips, or damage a redirect trait has stored. */
function traitCounter(hero: Hero): string {
  const { chargedShot, redirect } = hero.kit.trait;
  if (chargedShot) return '●'.repeat(hero.traitStacks) + '○'.repeat(chargedShot.every - 1 - hero.traitStacks);
  if (redirect && hero.stored >= 1) return `+${Math.round(hero.stored)}`;
  return '';
}

interface SlotEls {
  root: HTMLElement;
  art: HTMLElement;
  cd: HTMLElement;
  num: HTMLElement;
  key: HTMLElement;
  cooling: boolean;
}

interface UnitFrame {
  root: HTMLElement;
  fill: HTMLElement;
  shieldFill: HTMLElement;
  /** the resource bar under the health bar, HotS style */
  resource: HTMLElement;
  resourceFill: HTMLElement;
  name: string;
  shown: boolean;
  hp: number;
  shield: number;
  resourceKind: ResourceKind | null;
  resourceFraction: number;
}

/** What the floating frame's resource bar shows; null hides it. */
type FrameResource = { kind: ResourceKind; fill: number } | null;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

// Minion bars are drawn on one canvas: hundreds of positioned DOM frames cost several
// milliseconds of style and layout per frame. Only heroes get names.
const MINION_BAR = { ally: '#74cdf4', enemy: '#ef6c69', track: '#060a0f', rim: '#dce9f055' };

export class Hud {
  private readonly battleground = new BattlegroundHud();
  private readonly slots = new Map<Slot, SlotEls>();
  private readonly frames = new Map<object, UnitFrame>();
  private readonly bars = document.createElement('canvas');
  private readonly barsContext = this.bars.getContext('2d')!;
  private readonly tooltip = $('tooltip');
  private readonly resourceBar = $('mana-fill').parentElement!;
  /** magazine pips above the portrait bars, for basic attacks with a magazine */
  private readonly ammo = document.createElement('div');
  private hovered: Slot | null = null;
  private touchInput = false;
  private heroName = '';
  /** the kit and heroic the buttons currently show; repainted when either changes */
  private kit: Kit | null = null;
  private heroic: number | null = null;
  /** heroic choice cards above the ability bar */
  private readonly picker = document.createElement('div');
  private accent = '#16b9ed';
  private readonly reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

  constructor(onSlot: (slot: Slot) => void, private readonly onHeroic: (index: number) => void) {
    mountTopFrames();
    this.picker.id = 'heroic-choice';
    this.picker.className = 'hidden';
    this.picker.setAttribute('role', 'group');
    this.picker.setAttribute('aria-labelledby', 'heroic-choice-title');
    $('ability-dock').before(this.picker);
    this.ammo.id = 'ammo';
    this.ammo.setAttribute('aria-hidden', 'true');
    $('hero-name').after(this.ammo);
    this.bars.id = 'minion-bars';
    this.bars.setAttribute('aria-hidden', 'true');
    $('unit-frames').before(this.bars);
    const bar = $('bar');
    for (const slot of ['Z', ...BAR, 'B'] as Slot[]) {
      const el = this.button(slot, slot === 'Z' || slot === 'B');
      bar.appendChild(el.root);
      this.slots.set(slot, el);
      el.root.addEventListener('click', (e) => {
        e.stopPropagation();
        onSlot(slot);
        // Mouse users return to game hotkeys; keyboard users retain focus.
        if (e.detail > 0) el.root.blur();
        if (this.touchInput) this.hideTooltip();
      });
      el.root.addEventListener('pointerdown', (e) => {
        this.touchInput = e.pointerType === 'touch';
        if (this.touchInput) this.hideTooltip();
      });
      el.root.addEventListener('pointerenter', (e) => {
        if (e.pointerType === 'touch') return;
        this.touchInput = false;
        this.showTooltip(slot, el.root);
      });
      el.root.addEventListener('pointerleave', (e) => {
        if (e.pointerType === 'touch') return;
        const focused = [...this.slots].find(([, button]) => button.root === document.activeElement);
        if (focused) this.showTooltip(focused[0], focused[1].root);
        else this.hideTooltip();
      });
      el.root.addEventListener('focus', () => {
        if (!this.touchInput) this.showTooltip(slot, el.root);
      });
      el.root.addEventListener('blur', () => {
        if (!el.root.matches(':hover')) this.hideTooltip();
      });
    }
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Tab') this.touchInput = false;
      if (e.code === 'Escape' || e.code === 'F10') this.hideTooltip();
    });
    window.addEventListener('resize', () => this.hideTooltip());
  }

  /** Key labels under the buttons, per control scheme. */
  setKeys(labels: Partial<Record<Slot, string>>): void {
    for (const [slot, el] of this.slots) el.key.textContent = labels[slot] ?? slot;
    this.labelSlots();
  }

  /** `accent` tints placeholder ability art (the character's Survivors colour). */
  setHero(name: string, icon: string | null, accent?: number): void {
    this.heroName = name;
    if (accent !== undefined) this.accent = `#${accent.toString(16).padStart(6, '0')}`;
    this.kit = null; // repaint on the next update
    $('hero-name').textContent = name;
    $('hero-name').title = name;
    $('hero-name').classList.toggle('long-name', name.length > 18);
    for (const id of ['top-icon', 'portrait-art']) {
      const img = $<HTMLImageElement>(id);
      img.alt = `${name} portrait`;
      img.onload = () => { img.style.visibility = 'visible'; };
      img.onerror = () => { img.style.visibility = 'hidden'; };
      img.style.visibility = 'hidden';
      if (icon) img.src = icon;
      else img.removeAttribute('src');
    }
  }

  /**
   * `heroicsOpen`: the match lets the hero choose a heroic now (team level, or practice rules).
   */
  update(hero: Hero, combat: Combat, aiming: Slot | 'amove' | null, toScreen: (x: number, y: number, z: number) => ScreenPoint,
    heroicsOpen: boolean): void {
    this.battleground.update(combat);
    if (hero.kit !== this.kit || hero.heroic !== this.heroic) this.showKit(hero.kit, hero.heroic);
    const kit = hero.kit;
    const choosing = !combat.winner && heroicsOpen && hero.heroic === null;
    if (this.picker.classList.contains('hidden') === choosing) this.picker.classList.toggle('hidden', !choosing);
    this.slots.get('R')!.root.classList.toggle('needs-choice', choosing);
    // ability bar
    for (const [slot, el] of this.slots) {
      const spec = slotInfo(kit, slot, hero.heroic);
      const left = hero.cooldowns[slot];
      const frac = spec.cooldown ? left / spec.cooldown : 0;
      const cooling = left > 0;
      if (el.cooling && !cooling && hero.state !== 'dead' && !this.reducedMotion.matches) {
        el.root.animate([{ boxShadow: `0 0 22px ${slot === 'R' ? '#ffba42aa' : '#16b9edaa'}` }, { boxShadow: '0 0 0 transparent' }], { duration: 450 });
      }
      el.cooling = cooling;
      el.root.classList.toggle('cooling', cooling);
      el.root.setAttribute('aria-disabled', String(!hero.canCast(slot)));
      el.root.classList.toggle('burst-ready', slot === 'R' && hero.canCast(slot));
      el.cd.style.background = frac > 0 ? `conic-gradient(rgba(5,8,20,0.78) ${frac * 360}deg, transparent 0)` : 'none';
      el.num.textContent = slot === 'D' ? traitCounter(hero) : left > 0.05 ? left.toFixed(left < 1 ? 1 : 0) : '';
      el.root.classList.toggle('no-mana', !hero.canPay(spec.cost) && left <= 0);
      el.root.classList.toggle('active', (slot === 'Z' && hero.mounted) || aiming === slot);
      el.root.classList.toggle('dead', hero.state === 'dead');
    }

    // portrait bars and team bar
    const hp = hero.hp / hero.maxHp;
    $('hp-fill').style.width = `${hp * 100}%`;
    const shield = Math.ceil(hero.status.shield);
    const shieldWidth = `${Math.min(1, Math.max(0, hero.status.shield / hero.maxHp)) * 100}%`;
    $('hp-shield').style.width = shieldWidth;
    $('top-shield').style.width = shieldWidth;
    $('hp-text').textContent = `${Math.ceil(hero.hp)}/${hero.maxHp}${shield > 0 ? ` +${shield}` : ''}`;
    const resource = this.showResource(hero);
    this.showAmmo(hero);
    $('top-hp').style.width = `${hp * 100}%`;
    $('top-slot').classList.toggle('dead', hero.state === 'dead');
    $('portrait').classList.toggle('dead', hero.state === 'dead');
    $('hud').classList.toggle('taking-damage', hero.damageFlash > 0);
    const t = Math.floor(combat.elapsed);
    $('timer').textContent = `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
    $('timer').title = `Wave ${combat.wave} · next wave in ${Math.ceil(combat.nextWaveIn)}s`;
    for (const side of ['blue', 'red'] as const) {
      const progress = combat[side], xp = $(`xp-${side}`);
      $(`level-${side}`).textContent = String(progress.level);
      xp.querySelector<HTMLElement>('i')!.style.width = `${progress.xp / progress.required * 100}%`;
      xp.setAttribute('aria-valuemax', String(progress.required));
      xp.setAttribute('aria-valuenow', String(progress.xp));
      xp.title = `Team level ${progress.level} · ${progress.xp}/${progress.required} XP`;
    }

    // channel bar
    const ch = hero.channel;
    const chEl = $('channel');
    chEl.classList.toggle('hidden', !ch);
    if (ch) {
      chEl.querySelector('span')!.textContent = ch.label;
      ($('channel-fill')).style.width = `${Math.min(1, ch.progress) * 100}%`;
    }

    // floating unit frames
    this.placeFrame(hero, 'hero', this.heroName, hero.hp, hero.maxHp, hero.state !== 'dead', toScreen(hero.position.x, HERO_FRAME_HEIGHT, hero.position.z), hero.status.shield, resource);
    this.drawMinionBars(combat, toScreen);
  }

  /**
   * The second portrait bar: mana or fuel, or the rage trait's damage bonus when abilities cost health.
   * Returns the same bar for the floating frame; heroes with nothing to show there get none.
   */
  private showResource(hero: Hero): FrameResource {
    const resource = hero.kit.stats.resource;
    const bar = this.resourceBar;
    if (bar.dataset.resource !== resource.kind) {
      bar.dataset.resource = resource.kind;
      bar.setAttribute('aria-label', RESOURCE_LABELS[resource.kind]);
    }
    let fill: number, text: string;
    if (resource.kind === 'health') {
      const rage = hero.kit.trait.rage;
      const bonus = rage ? rage.maxBonus * (1 - hero.hp / hero.maxHp) : 0;
      fill = rage ? bonus / rage.maxBonus : 0;
      text = rage ? `${hero.kit.trait.name} +${Math.round(bonus * 100)}%` : 'Abilities cost health';
    } else {
      fill = hero.energy / resource.max;
      text = `${Math.floor(hero.energy)}/${resource.max}`;
    }
    $('mana-fill').style.width = `${fill * 100}%`;
    $('mana-text').textContent = text;
    return resource.kind === 'health' && !hero.kit.trait.rage ? null : { kind: resource.kind, fill };
  }

  private showAmmo(hero: Hero): void {
    const magazine = hero.kit.basic.magazine;
    $('portrait').classList.toggle('has-ammo', !!magazine);
    if (!magazine) {
      if (this.ammo.childElementCount) this.ammo.replaceChildren();
      return;
    }
    const pips = Math.min(10, magazine.size);
    while (this.ammo.childElementCount < pips) this.ammo.append(document.createElement('i'));
    while (this.ammo.childElementCount > pips) this.ammo.lastElementChild!.remove();
    // while reloading, pips refill in step with the reload
    const reloading = hero.reloading > 0;
    const loaded = reloading ? Math.floor((1 - hero.reloading / magazine.reload) * pips) : Math.ceil(hero.ammo / magazine.size * pips);
    this.ammo.dataset.count = reloading ? `${hero.reloading.toFixed(1)}s` : `${hero.ammo}/${magazine.size}`;
    this.ammo.classList.toggle('reloading', reloading);
    [...this.ammo.children].forEach((pip, i) => pip.classList.toggle('spent', i >= loaded));
  }

  /** Paint every button for `kit` (R as heroic `heroic`), and the heroic choice cards. */
  private showKit(kit: Kit, heroic: number | null): void {
    const kitChanged = kit !== this.kit;
    this.kit = kit;
    this.heroic = heroic;
    for (const [slot, el] of this.slots) {
      const info = slotInfo(kit, slot, heroic);
      el.root.classList.toggle('passive', info.passive);
      this.paintArt(el.art, info.icon, info.glyph);
    }
    if (kitChanged) {
      const title = Object.assign(document.createElement('h2'), {
        id: 'heroic-choice-title', className: 'hc-title', textContent: 'Choose a heroic',
      });
      const options = Object.assign(document.createElement('div'), { className: 'hc-options' });
      this.picker.replaceChildren(title, options);
      kit.heroics.forEach((ability, index) => {
        const info = abilityInfo(ability);
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'hc-option';
        card.innerHTML = `<span class="hc-icon" aria-hidden="true"><span class="skill-art"></span></span><span class="hc-text"><span class="hc-heading"><b></b><kbd></kbd></span><small>Heroic (R)</small><span class="hc-description"></span></span>`;
        card.setAttribute('aria-keyshortcuts', String(index + 1));
        this.paintArt(card.querySelector('.skill-art')!, info.icon, info.glyph);
        card.querySelector('b')!.textContent = info.name;
        card.querySelector('kbd')!.textContent = String(index + 1);
        card.querySelector('.hc-description')!.textContent = info.desc.replace(/^Heroic\. /, '');
        card.addEventListener('click', (e) => {
          e.stopPropagation();
          this.onHeroic(index);
          if (e.detail > 0) card.blur();
        });
        options.append(card);
      });
    }
    this.labelSlots();
  }

  private paintArt(art: HTMLElement, icon: string | undefined, glyph: string): void {
    art.classList.toggle('glyph', !icon);
    art.style.setProperty('--glyph-tint', this.accent);
    if (icon) art.innerHTML = `<img src="${import.meta.env.BASE_URL}${icon}" alt="" draggable="false" />`;
    else art.textContent = glyph;
  }

  private labelSlots(): void {
    if (!this.kit) return;
    for (const [slot, el] of this.slots) {
      const info = slotInfo(this.kit, slot, this.heroic);
      el.root.setAttribute('aria-label', `${info.name} (${info.passive ? 'Passive' : el.key.textContent})`);
    }
    if (this.hovered) this.showTooltip(this.hovered, this.slots.get(this.hovered)!.root);
  }

  private drawMinionBars(combat: Combat, toScreen: (x: number, y: number, z: number) => ScreenPoint): void {
    const canvas = this.bars, ctx = this.barsContext;
    const cssWidth = canvas.clientWidth, cssHeight = canvas.clientHeight, ratio = devicePixelRatio || 1;
    const width = Math.round(cssWidth * ratio), height = Math.round(cssHeight * ratio);
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, cssWidth, cssHeight);
    // Width clamp(36px, 3.4cqw, 64px); a 5px fill in a 1px track, 12px above the anchor.
    const w = Math.round(Math.max(36, Math.min(64, cssWidth * .034)));
    for (const unit of combat.units) {
      if (!unit.alive || !unit.renderActive) continue;
      const at = toScreen(unit.position.x, unit.barHeight, unit.position.z);
      if (!at.visible) continue;
      const x = Math.round(at.x - w / 2), y = Math.round(at.y - 12);
      ctx.fillStyle = MINION_BAR.rim;
      ctx.fillRect(x - 1, y - 1, w + 2, 9);
      ctx.fillStyle = MINION_BAR.track;
      ctx.fillRect(x, y, w, 7);
      ctx.fillStyle = unit.team === 'blue' ? MINION_BAR.ally : MINION_BAR.enemy;
      ctx.fillRect(x + 1, y + 1, (w - 2) * Math.max(0, unit.hp / unit.maxHp), 5);
      // Blue covers only the upper half, leaving the health fill readable underneath.
      if (unit.status.shield > 0) {
        ctx.fillStyle = '#319cff';
        ctx.fillRect(x + 1, y + 1, (w - 2) * Math.min(1, unit.status.shield / unit.maxHp), 3);
      }
      const status = unit.status.shown;
      if (status) {
        ctx.fillStyle = STATUS_COLORS[status];
        ctx.beginPath();
        ctx.moveTo(x - 7, y - 1); ctx.lineTo(x - 3, y + 3.5); ctx.lineTo(x - 7, y + 8); ctx.lineTo(x - 11, y + 3.5);
        ctx.fill();
      }
    }
    for (const structure of combat.structures) {
      if (!structure.alive) continue;
      if (structure.site.kind==='gate' && structure.hp===structure.maxHp) continue;
      const at = toScreen(structure.position.x, structure.barHeight, structure.position.z);
      if (!at.visible || at.x < 0 || at.x > cssWidth || at.y < 0 || at.y > cssHeight) continue;
      const sw = structure.site.kind === 'core' ? 124 : structure.site.kind==='tower'?66:88, x = Math.round(at.x - sw / 2), y = Math.round(at.y);
      ctx.fillStyle = '#08101de8'; ctx.fillRect(x - 2, y - 2, sw + 4, 13);
      ctx.fillStyle = structure.shielded ? '#8b9cad' : structure.team === 'blue' ? '#65d2ff' : '#ff7868';
      ctx.fillRect(x, y, sw * structure.hp / structure.maxHp, 8);
      ctx.fillStyle = '#05101a80';
      for (let n = 1; n < Math.ceil(structure.maxHp / 500); n++) ctx.fillRect(x + sw * n * 500 / structure.maxHp, y, 1, 8);
      ctx.font = `600 10px 'Segoe UI',sans-serif`; ctx.textAlign = 'center'; ctx.fillStyle = '#e5f3ff'; ctx.shadowColor = '#000'; ctx.shadowBlur = 3;
      ctx.fillText(structure.shielded ? 'INVULNERABLE' : `${Math.ceil(structure.hp)} / ${structure.maxHp}`, at.x, y + 21); ctx.shadowBlur = 0;
    }
  }

  private placeFrame(key: object, kind: 'hero' | 'enemy' | 'ally', name: string, hp: number, max: number, show: boolean, at: ScreenPoint,
    shield = 0, resource: FrameResource = null): void {
    let f = this.frames.get(key);
    const shown = show && at.visible;
    if (!f && !shown) return;
    if (!f) {
      const root = document.createElement('div');
      root.className = `unit-frame ${kind}`;
      root.title = name;
      root.innerHTML = `<div class="uf-name">${name}</div><div class="uf-bar"><i></i><b class="shield-fill" aria-hidden="true"></b></div><div class="uf-resource" hidden><i></i></div>`;
      // HotS segments health bars; one tick per 250 hp
      root.style.setProperty('--segments', String(Math.max(1, Math.round(max / 250))));
      $('unit-frames').appendChild(root);
      const res = root.querySelector<HTMLElement>('.uf-resource')!;
      f = {
        root, fill: root.querySelector('i')!, shieldFill: root.querySelector('.shield-fill')!, resource: res, resourceFill: res.querySelector('i')!,
        name, shown: true, hp: NaN, shield: NaN, resourceKind: null, resourceFraction: NaN,
      };
      this.frames.set(key, f);
    }
    if (f.shown !== shown) { f.root.style.display = shown ? '' : 'none'; f.shown = shown; }
    if (!shown) return;
    if (f.name !== name) { f.root.querySelector('.uf-name')!.textContent = name; f.name = name; }
    f.root.style.transform = `translate(${at.x}px, ${at.y}px)`;
    const hpFraction = Math.min(1, Math.max(0, hp / max));
    const shieldFraction = Math.min(1, Math.max(0, shield / max));
    if (f.hp !== hpFraction) { f.fill.style.width = `${hpFraction * 100}%`; f.hp = hpFraction; }
    if (f.shield !== shieldFraction) { f.shieldFill.style.width = `${shieldFraction * 100}%`; f.shield = shieldFraction; }
    const resourceKind = resource?.kind ?? null;
    if (f.resourceKind !== resourceKind) {
      f.resource.hidden = !resource;
      if (resource) f.resource.dataset.resource = resource.kind;
      f.resourceKind = resourceKind;
    }
    const resourceFraction = resource ? Math.min(1, Math.max(0, resource.fill)) : 0;
    if (f.resourceFraction !== resourceFraction) { f.resourceFill.style.width = `${resourceFraction * 100}%`; f.resourceFraction = resourceFraction; }
  }

  private button(slot: Slot, mini: boolean): SlotEls {
    const root = document.createElement('button');
    root.type = 'button';
    root.dataset.slot = slot;
    root.className = `skill-btn${mini ? ' mini' : ''}${slot === 'R' ? ' burst' : ''}`;
    root.innerHTML =
      `<span class="skill-art" aria-hidden="true"></span>` +
      `<span class="skill-cd"></span><span class="skill-num"></span><span class="skill-key">${slot}</span>`;
    return {
      root,
      art: root.querySelector('.skill-art')!,
      cd: root.querySelector('.skill-cd')!,
      num: root.querySelector('.skill-num')!,
      key: root.querySelector('.skill-key')!,
      cooling: false,
    };
  }

  private showTooltip(slot: Slot, anchor: HTMLElement): void {
    if (this.hovered) this.slots.get(this.hovered)?.root.removeAttribute('aria-describedby');
    this.hovered = slot;
    anchor.setAttribute('aria-describedby', 'tooltip');
    if (!this.kit) return;
    const s = slotInfo(this.kit, slot, this.heroic);
    const key = this.slots.get(slot)?.key.textContent ?? slot;
    const facts = [
      s.passive ? 'Passive' : `Hotkey: ${key}`,
      s.cost ? `${RESOURCE_LABELS[this.kit.stats.resource.kind]}: ${s.cost}` : '',
      s.cooldown ? `Cooldown: ${s.cooldown} seconds` : '',
    ].filter(Boolean);
    this.tooltip.innerHTML = `<div class="tt-name">${s.name}</div><div class="tt-facts">${facts.join(' · ')}</div><div class="tt-desc">${s.desc}</div>`;
    this.tooltip.classList.remove('hidden');
    const a = anchor.getBoundingClientRect();
    const frame = this.tooltip.offsetParent!.getBoundingClientRect();
    const margin = 8;
    this.tooltip.style.transform = 'none';
    this.tooltip.style.maxWidth = `${Math.max(0, frame.width - margin * 2)}px`;
    this.tooltip.style.maxHeight = `${Math.max(0, frame.height - margin * 2)}px`;
    this.tooltip.style.overflowY = 'auto';
    const { width, height } = this.tooltip.getBoundingClientRect();
    const x = a.left + a.width / 2 - frame.left - width / 2;
    const above = a.top - frame.top - height - margin;
    const below = a.bottom - frame.top + margin;
    const y = above >= margin || below + height > frame.height - margin ? above : below;
    this.tooltip.style.left = `${Math.max(margin, Math.min(x, frame.width - width - margin))}px`;
    this.tooltip.style.top = `${Math.max(margin, Math.min(y, frame.height - height - margin))}px`;
  }

  private hideTooltip(): void {
    if (this.hovered) this.slots.get(this.hovered)?.root.removeAttribute('aria-describedby');
    this.hovered = null;
    this.tooltip.classList.add('hidden');
  }
}
