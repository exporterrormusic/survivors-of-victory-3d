// Survivor combat HUD (the user's chosen mockup, 2026-10-25): flat translucent panels with thin
// lines and corner brackets, gold for Burst and progress, mint for health.
//   top left      objective        top centre  time and wave        top right  music, pause (Esc)
//   bottom left   portrait, affiliation, name, health, magazine and reload key
//   bottom centre Dash, Weapon and Special cards, then the wide Burst card with her art
//   bottom right  radar
//   bottom edge   level, XP line, and unspent upgrade points (Tab)
// A canvas under the panels draws Rapture health bars, damage numbers and a thin health line over
// the hero; a canvas above everything draws the reticle and its reload arc.

import { WEAPON_CHARGE_TIME, type Player } from './player';
import { NUMBER_LIFE, type Run } from './run';
import type { TargetField } from './targets';
import type { CharacterKit } from './kit';
import { InsightPanel } from './nayuta/insight-panel';
import type { Action } from './input';
import { mountHudFrame, mountPanelTrim } from './hud-frames';

export interface ScreenPoint { x: number; y: number; visible: boolean }
type Project = (x: number, y: number, z: number) => ScreenPoint;
type SlotId = 'dash' | 'weapon' | 'special';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className = '', parent?: HTMLElement): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  parent?.append(node);
  return node;
};
/** radar range around the hero, metres */
const RADAR_RANGE = 24;

/** The user's preferred simple white equipment and utility silhouettes. */
export const ICONS: Record<string, string> = {
  wings: '<svg viewBox="0 0 64 64" fill="currentColor"><path d="M30 48C13 47 5 29 3 8l12 13-3-13 14 18 4 13zM34 48C51 47 59 29 61 8L49 21l3-13-14 18-4 13zM24 48h16l-8 10z"/></svg>',
  clone: '<svg viewBox="0 0 64 64" fill="currentColor"><circle cx="23" cy="17" r="8"/><path d="M8 51V36a15 15 0 0 1 30 0v15z"/><g opacity=".5"><circle cx="43" cy="17" r="8"/><path d="M43 26a15 15 0 0 1 15 15v10H43z"/></g></svg>',
  halo: '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor"><ellipse cx="32" cy="32" rx="24" ry="14" transform="rotate(-30 32 32)" stroke-width="4"/><ellipse cx="32" cy="32" rx="18" ry="9" transform="rotate(-30 32 32)" stroke-width="1.5"/><path d="m48 8 2 6 6 2-6 2-2 6-2-6-6-2 6-2z" fill="currentColor" stroke="none"/></svg>', 
  rocket: '<svg viewBox="0 0 64 64" fill="currentColor"><path d="M50 5 59 6 58 15 32 41 23 32zm-29 25 13 13-5 5-13-13zM17 38l9 9-10 13-3-9-9-3zM35 17l-15 1-9 15 13-5zm12 12-1 15-15 9 5-13z"/></svg>',
  goddess: '<svg viewBox="0 0 64 64" fill="currentColor"><path d="M27 8h10v15h15v10H37v23H27V33H12V23h15z"/><circle cx="32" cy="32" r="28" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
  sword: '<svg viewBox="0 0 120 64" fill="currentColor"><g transform="translate(60 32) rotate(20) scale(1.35) translate(-56 -35)"><path d="M47 42Q66 26 81 8l-4 10Q65 33 50 45z"/><path d="m43 44 4 4-11 11-4-4z"/><path d="m43 39 10 10" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><path d="m40 48 4 1m-7 2 4 1m-7 2 4 1" fill="none" stroke="#0a1220" stroke-width="1.4"/><path d="m32 55 4 4-2 2-4-4z"/></g></svg>',
  wave: '<svg viewBox="0 0 64 64" fill="currentColor"><path d="M5 50C45 53 61 24 48 4 73 25 54 66 5 50zM7 40C32 42 48 23 41 12 58 26 39 51 7 40z"/></svg>',
  rifle: '<svg viewBox="0 0 120 40" fill="currentColor"><path d="M3 21l15-4h12v11l-11 3H5z"/><path d="M30 15h49v12H30z" opacity=".92"/><path d="M79 18.5h30v5H79z"/><path d="M106 16h10v10h-10z"/><path d="M38 7h33v6H38z"/><path d="M45 13h4v3h-4zM60 13h4v3h-4z"/><path d="M47 27h9l-4 10h-8z"/><path d="M61 27h10v7h-8z" opacity=".85"/><path d="M33 19h40v2H33z" fill="#0a1220" opacity=".45"/></svg>',
  turret: '<svg viewBox="0 0 64 64" fill="currentColor"><rect x="14" y="13" width="26" height="17" rx="3"/><path d="M40 17h17v6H40z"/><path d="M9 15h6v13H9z" opacity=".85"/><path d="M27 30h6v8h-6z"/><path d="M30 38L15 55M30 38l15 17M30 38v19" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round"/><ellipse cx="30" cy="57" rx="17" ry="3" opacity=".5"/><path d="M18 18h12v3H18z" fill="#0a1220" opacity=".45"/></svg>',
  dash: '<svg viewBox="0 0 64 64" fill="currentColor"><path d="M12 14l16 18-16 18h11l16-18-16-18zM31 14l16 18-16 18h11l16-18-16-18z"/></svg>',
};

interface Card { root: HTMLButtonElement; label: HTMLElement; value: HTMLElement | null; meter: HTMLElement }

export interface HudCharacter {
  name: string;
  /** squad or manufacturer, shown above the name */
  affiliation: string;
  portrait: string | null;
  burstArt: string | null;
  burstArtPosition?: string;
}

export class SurvivorHud {
  private readonly cards = new Map<SlotId, Card>();
  /** world-anchored bars and numbers, under the HUD panels */
  private readonly overlay = document.createElement('canvas');
  private readonly ctx = this.overlay.getContext('2d')!;
  /** the aim reticle, above everything */
  private readonly reticle = document.createElement('canvas');
  private readonly reticleCtx = this.reticle.getContext('2d')!;
  private readonly rounds = document.createElement('div');
  private readonly roundCount = document.createElement('b');
  private readonly hpFill = document.createElement('i');
  private readonly hpText = document.createElement('span');
  private readonly timer = document.createElement('b');
  private readonly wave = document.createElement('small');
  private readonly level = document.createElement('b');
  private readonly xpFill = document.createElement('i');
  private readonly upgrades = document.createElement('b');
  private readonly burst = document.createElement('button');
  private readonly kitStatus = document.createElement('div');
  private readonly insightPanel = new InsightPanel();
  private readonly burstState = document.createElement('b');
  private readonly burstFill = document.createElement('i');
  private readonly radar = document.createElement('canvas');
  private readonly radarCtx = this.radar.getContext('2d')!;
  private readonly pauseButton = document.createElement('button');
  private readonly musicMount = document.createElement('div');
  private dpr = 1;
  private shownAmmo = -1;
  private shownReload = false;

  /** drawn over the hero's health line */
  private readonly heroName: string;

  constructor(kit: CharacterKit, hero: HudCharacter, onPause: () => void, onAction: (action: Action) => void) {
    this.heroName = hero.name;
    const hud = $('hud');
    hud.classList.add('survivor');
    this.kitStatus.className = 'run-kit-status';

    // the MOBA's own frames give way to the survivor layout below
    for (const id of ['topbar', 'unit-frames', 'channel', 'portrait', 'ability-dock', 'map-panel', 'menu-btn']) $(id)?.classList.add('hidden');

    // Top left is reserved for the communication panel.

    // top centre: time and wave
    const clock = el('div', '', hud);
    clock.id = 'run-clock';
    el('span', 'rc-line', clock);
    clock.append(this.timer);
    el('span', 'rc-line', clock);
    clock.append(this.wave);

    const actionButton = (button: HTMLButtonElement, action: Action, label: string) => {
      button.type = 'button';
      button.setAttribute('aria-label', label);
      button.addEventListener('click', (e) => {
        e.stopPropagation();
        onAction(action);
        if (e.detail > 0) button.blur();
      });
    };

    // top right: music and pause share one aligned toolbar.
    const tools = el('div', '', hud);
    tools.id = 'run-tools';
    this.musicMount.id = 'run-music';
    this.musicMount.addEventListener('keydown', (event) => {
      if (event.code !== 'Escape' || event.repeat) return;
      event.stopPropagation();
      onPause();
    }, true);
    tools.append(this.musicMount);
    const pause = el('div', '', tools);
    pause.id = 'run-pause';
    const pauseButton = this.pauseButton;
    pauseButton.className = 'run-frame';
    pause.append(pauseButton);
    pauseButton.type = 'button';
    pauseButton.setAttribute('aria-label', 'Menu (Esc)');
    pauseButton.setAttribute('aria-controls', 'menu');
    pauseButton.setAttribute('aria-expanded', 'false');
    pauseButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4h4v16H6zM14 4h4v16h-4z" fill="currentColor"/></svg>';
    pauseButton.addEventListener('click', (e) => { e.stopPropagation(); onPause(); pauseButton.blur(); });
    el('span', '', el('kbd', 'run-key', pause)).textContent = 'ESC';

    // bottom left: portrait and the hero's numbers
    const heroPanel = el('div', '', hud);
    heroPanel.id = 'run-hero';
    const face = el('div', 'rh-face run-frame', heroPanel);
    mountPanelTrim(face, 'portrait');
    const art = el('img', '', face);
    art.alt = `${hero.name} portrait`;
    art.draggable = false;
    if (hero.portrait) art.src = `${import.meta.env.BASE_URL}${hero.portrait}`;
    const info = el('div', 'rh-info', heroPanel);
    el('small', 'rh-affiliation', info).textContent = hero.affiliation;
    el('b', 'rh-name', info).textContent = hero.name;
    const hp = el('div', 'rh-hp', info);
    hp.setAttribute('role', 'progressbar');
    hp.setAttribute('aria-label', 'Health');
    hp.setAttribute('aria-valuemin', '0');
    el('div', 'rh-hp-bar', hp).append(this.hpFill);
    hp.append(this.hpText);
    const ammo = el('div', 'rh-ammo', info);
    ammo.classList.toggle('rh-ammo-compact', kit.weapon.magazine > 10);
    this.rounds.className = 'rh-rounds';
    this.rounds.setAttribute('aria-hidden', 'true');
    ammo.append(this.rounds, this.roundCount);
    if (kit.weapon.melee) ammo.style.display = 'none';
    const reload = el('button', 'run-key rh-reload', ammo);
    el('span', '', reload).textContent = 'R';
    actionButton(reload, 'reload', 'Reload (R)');

    // bottom centre: ability cards, then Burst
    const dock = el('div', '', hud);
    dock.id = 'run-dock';
    dock.setAttribute('role', 'group');
    dock.setAttribute('aria-label', 'Combat abilities');
    const cards: [SlotId, string, string, string, boolean][] = [
      ['dash', 'Dash', kit.icons.dash, 'SHIFT', false],
      ['weapon', 'Weapon', kit.icons.weapon, 'LMB', false],
      ['special', 'Special', kit.icons.special, 'RMB', true],
    ];
    for (const [id, label, icon, key, counted] of cards) {
      const root = el('button', 'rd-card', dock);
      mountHudFrame(root);
      root.dataset.slot = id;
      root.dataset.icon = icon;
      actionButton(root, id === 'weapon' ? 'fire' : id, `${id === 'special' ? kit.specialName : label} (${key})`);
      const labelEl = el('small', 'rd-label', root);
      labelEl.textContent = label;
      const body = el('div', 'rd-body', root);
      const iconArt = el('div', 'rd-icon', body);
      iconArt.setAttribute('aria-hidden', 'true');
      iconArt.innerHTML = ICONS[icon] ?? '';
      // The charge count sits in the card's top-right corner so the icon stays centred.
      const value = counted ? el('b', 'rd-count', root) : null;
      const meter = el('i', 'rd-meter', root);
      el('span', '', el('kbd', 'run-key', root)).textContent = key;
      this.cards.set(id, { root, label: labelEl, value, meter });
      if(id==='special')root.append(this.kitStatus);
    }
    this.burst.className = 'rd-burst';
    actionButton(this.burst, 'burst', `${kit.burstName} (E)`);
    dock.append(this.burst);
    mountHudFrame(this.burst, 'burst');
    const burstArt = el('div', 'rb-art', this.burst);
    if (hero.burstArt) burstArt.style.backgroundImage = `url("${import.meta.env.BASE_URL}${hero.burstArt}")`;
    if (hero.burstArtPosition) burstArt.style.backgroundPosition = hero.burstArtPosition;
    const burstText = el('div', 'rb-text', this.burst);
    el('small', 'rb-name', burstText).textContent = kit.burstName;
    burstText.append(this.burstState);
    const burstBar = el('div', 'rb-bar', this.burst);
    const burstTrack = el('div', 'rb-track', burstBar);
    burstTrack.setAttribute('role', 'progressbar');
    burstTrack.setAttribute('aria-label', 'Burst charge');
    burstTrack.setAttribute('aria-valuemin', '0');
    burstTrack.setAttribute('aria-valuemax', '100');
    burstTrack.append(this.burstFill);
    const burstKey = el('kbd', 'run-key rb-key', this.burst);
    el('span', '', burstKey).textContent = 'E';
    mountHudFrame(burstKey, 'key');

    // bottom right: radar
    const radar = el('div', 'run-frame', hud);
    radar.id = 'run-radar';
    mountPanelTrim(radar, 'radar');
    el('small', 'rr-label', radar).textContent = 'Radar';
    this.radar.setAttribute('role', 'img');
    this.radar.setAttribute('aria-label', 'Radar: nearby Raptures and your heading');
    radar.append(this.radar);

    // bottom edge: level, XP, upgrades
    const xp = el('div', '', hud);
    xp.id = 'run-xp';
    const lv = el('span', 'rx-level', xp);
    lv.append('Lv ', this.level);
    const track = el('div', 'rx-track', xp);
    track.setAttribute('role', 'progressbar');
    track.setAttribute('aria-label', 'Experience');
    track.setAttribute('aria-valuemin', '0');
    track.append(this.xpFill);
    const up = el('button', 'rx-upgrades', xp);
    actionButton(up, 'talents', 'Ability ranks (Tab)');
    up.setAttribute('aria-controls', 'run-talents');
    up.append(kit.talentTiers ? '[Tab] Talents ' : '[Tab] Upgrades ', this.upgrades);

    this.overlay.id = 'run-overlay';
    this.overlay.setAttribute('aria-hidden', 'true');
    hud.prepend(this.overlay);
    this.reticle.id = 'run-reticle';
    this.reticle.setAttribute('aria-hidden', 'true');
    hud.append(this.reticle);
  }

  /** The music strip lives immediately left of Pause in the top-right toolbar. */
  get musicParent(): HTMLElement { return this.musicMount; }

  setPaused(paused: boolean): void {
    this.pauseButton.setAttribute('aria-expanded', String(paused));
    this.pauseButton.setAttribute('aria-label', paused ? 'Resume (Esc)' : 'Menu (Esc)');
  }

  resize(): void {
    const r = this.overlay.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.overlay.width = this.reticle.width = Math.max(1, Math.round(r.width * this.dpr));
    this.overlay.height = this.reticle.height = Math.max(1, Math.round(r.height * this.dpr));
    const m = this.radar.getBoundingClientRect();
    this.radar.width = Math.max(1, Math.round(m.width * this.dpr));
    this.radar.height = Math.max(1, Math.round(m.height * this.dpr));
  }

  update(player: Player, run: Run, targets: TargetField, project: Project, pointer: { x: number; y: number; inside: boolean }): void {
    const kit = player.kit;
    const minutes = Math.floor(run.time / 60), seconds = Math.floor(run.time % 60);
    setText(this.timer, `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`);
    setText(this.wave, `Wave ${String(run.wave).padStart(2, '0')}`);
    setText(this.level, String(run.level).padStart(2, '0'));
    setWidth(this.xpFill, `${(run.xp / run.xpToNext) * 100}%`);
    setProgress(this.xpFill.parentElement!, run.xp, run.xpToNext);
    // Talent-tier heroes show waiting picks instead of unspent SP.
    const waiting = run.tiers ? run.tiers.pendingCount(run.level) : run.skillPoints;
    setText(this.upgrades, String(waiting));
    this.upgrades.parentElement!.classList.toggle('has-points', waiting > 0);
    setAttr(this.upgrades.parentElement!, 'aria-label', run.tiers ? `Talents (Tab), ${waiting} talent picks waiting` : `Ability ranks (Tab), ${waiting} unspent skill points`);

    // health and magazine
    setWidth(this.hpFill, `${(player.hp / player.maxHp) * 100}%`);
    setProgress(this.hpText.parentElement!, Math.ceil(player.hp), player.maxHp);
    setText(this.hpText, `${Math.ceil(player.hp)} / ${player.maxHp}`);
    const reloading = player.reloading > 0;
    if (player.ammo !== this.shownAmmo || reloading !== this.shownReload) {
      this.shownAmmo = player.ammo;
      this.shownReload = reloading;
      const size = kit.weapon.magazine;
      if (size > 10) {
        if (!this.rounds.firstElementChild) el('i', '', this.rounds);
        setWidth(this.rounds.firstElementChild as HTMLElement, `${Math.max(0, Math.min(1, player.ammo / size)) * 100}%`);
      } else {
        while (this.rounds.childElementCount < size) el('i', '', this.rounds);
        [...this.rounds.children].forEach((round, i) => round.classList.toggle('spent', i >= player.ammo));
      }
      this.rounds.parentElement!.setAttribute('aria-label', `${player.ammo} of ${size} rounds${reloading ? ', reloading' : ''}`);
      this.rounds.classList.toggle('reloading', reloading);
      this.roundCount.innerHTML = `${String(player.ammo).padStart(2, '0')}<small> / ${String(size).padStart(2, '0')}</small>`;
    }

    // cards: a line along the bottom shows reload / recharge progress
    const weapon = this.cards.get('weapon')!;
    const fullyCharged = player.weaponCharge !== null && player.weaponCharge >= WEAPON_CHARGE_TIME - 1e-6;
    weapon.root.classList.toggle('busy', reloading);
    weapon.root.classList.toggle('charging', player.weaponCharge !== null);
    weapon.root.classList.toggle('charged', fullyCharged);
    setAttr(weapon.root, 'aria-label', reloading ? `Reloading (${player.reloading.toFixed(1)} seconds)` : fullyCharged ? 'Fully charged. Release LMB to fire.' : kit.unlimitedAmmo ? 'Asceticism: narrow palm strikes, no ammunition cost.' : kit.weapon.melee ? 'Fleetly Fading (LMB). Costs HP down to 50%; no reload.' : `Weapon (LMB), ${player.ammo} rounds`);
    setText(weapon.label, reloading ? 'Reloading' : fullyCharged ? 'Fully charged' : player.weaponCharge !== null ? `Charge ${Math.floor(player.weaponCharge / WEAPON_CHARGE_TIME * 100)}%` : 'Weapon');
    setWidth(weapon.meter, reloading ? `${(1 - player.reloading / player.reloadTime) * 100}%` : player.weaponCharge !== null ? `${player.weaponCharge / WEAPON_CHARGE_TIME * 100}%` : '0');

    const insight=kit.insightDisplay;
    this.kitStatus.classList.toggle('has-insight',!!insight);
    if(insight){
      if(this.insightPanel.root.parentElement!==this.kitStatus)this.kitStatus.replaceChildren(this.insightPanel.root);
      this.insightPanel.update(insight);
    }else setText(this.kitStatus, kit.status ?? '');
    this.kitStatus.hidden = !insight&&!kit.status;
    const special = kit.special();
    const sp = this.cards.get('special')!;
    const specialCharge = special.charge ?? null;
    const specialFull = specialCharge !== null && specialCharge >= 1 - 1e-6;
    setText(sp.label, special.label ?? (specialFull ? 'Fully charged' : specialCharge !== null ? `Charge ${Math.floor(specialCharge * 100)}%` : 'Special'));
    // Only multi-charge Specials show a count ("x 2"); single-charge ones show none.
    setText(sp.value!, special.maxCharges > 1 ? `x ${special.charges}` : '');
    sp.root.classList.toggle('charged', specialFull);
    sp.root.classList.toggle('busy', !(special.available ?? special.charges > 0));
    setDisabled(sp.root, !(special.available ?? special.charges > 0));
    sp.root.title = special.hint ?? '';
    setAttr(sp.root, 'aria-label', special.hint ?? (specialFull ? 'Fully charged. Release RMB to fire.' : `${kit.specialName} (RMB), ${special.charges} charges`));
    setWidth(sp.meter, specialCharge !== null ? `${specialCharge * 100}%` : special.charges < special.maxCharges ? `${special.progress * 100}%` : '0');

    const dash = this.cards.get('dash')!;
    dash.root.classList.toggle('active', player.dashing > 0);
    setDisabled(dash.root, player.dashCooldown > 0);
    setText(dash.label, player.dashCooldown > 0 ? `Dash ${player.dashCooldown.toFixed(1)}s` : 'Dash');
    setWidth(dash.meter, player.dashCooldown > 0 ? `${(1 - player.dashCooldown / player.dashCooldownDuration) * 100}%` : '0');
    setAttr(dash.root, 'aria-label', player.dashCooldown > 0 ? `Dash recharging, ${player.dashCooldown.toFixed(1)} seconds` : 'Dash ready (Shift)');

    const ready = kit.burstAvailable !== false && run.burst >= 100 && !kit.burstActive;
    this.burst.classList.toggle('ready', ready);
    setDisabled(this.burst, kit.burstActive ? !kit.burstActionReady : !ready);
    setText(this.burstState, kit.burstAvailable === false ? 'Planned' : kit.burstLabel ?? (player.burstCharge !== null ? `Focus ${Math.round(player.burstCharge / 2.5 * 100)}%` : ready ? 'Burst ready' : `Burst ${Math.floor(run.burst)}%`));
    setWidth(this.burstFill, `${run.burst}%`);
    setProgress(this.burstFill.parentElement!, Math.floor(run.burst), 100);

    this.drawOverlay(player, run, targets, project, pointer);
    this.drawRadar(player, targets);
  }

  private drawOverlay(player: Player, run: Run, targets: TargetField, project: Project, pointer: { x: number; y: number; inside: boolean }): void {
    const { ctx, dpr } = this;
    const c = this.overlay;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const scale = Math.max(.8, Math.min(1.6, c.height / dpr / 900));

    if (player.damageFlash > 0) {
      ctx.strokeStyle = `rgba(255,55,45,${player.damageFlash / .25 * .75})`;
      ctx.lineWidth = 14 * scale;
      ctx.strokeRect(0, 0, c.width / dpr, c.height / dpr);
    }
    // A co-op down holds trainingReset at Infinity until revived; its ring says that, not this text.
    if (player.trainingReset > 0 && Number.isFinite(player.trainingReset)) {
      ctx.fillStyle = '#fff0e5';
      ctx.font = `bold ${24 * scale}px Rajdhani, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('TRAINING RESET', c.width / dpr / 2, c.height / dpr * .4);
      ctx.textAlign = 'left';
    }

    // Rapture health bars. Common Raptures get a bar only; heavies and bosses are named, in gold,
    // with a wider bar, so the special ones stand out in a crowd.
    for (const t of targets.targets) {
      if (!t.alive || t.scale < .5) continue;
      const p = project(t.position.x, t.barHeight, t.position.z);
      if (!p.visible) continue;
      const named = t.combatTier === 'heavy' || t.combatTier === 'boss';
      const w = (named ? 84 : 54) * scale, h = 6 * scale;
      if (named) {
        ctx.font = `700 ${(t.combatTier === 'boss' ? 17 : 15) * scale}px Rajdhani, 'Segoe UI', sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#000c';
        const label = t.type.name.toUpperCase();
        ctx.strokeText(label, p.x, p.y - h - 4 * scale);
        ctx.fillStyle = '#ffd36a';
        ctx.fillText(label, p.x, p.y - h - 4 * scale);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
      }
      ctx.fillStyle = '#060a0f';
      ctx.fillRect(p.x - w / 2 - 1, p.y - h - 1, w + 2, h + 2);
      ctx.fillStyle = '#ef6c69';
      ctx.fillRect(p.x - w / 2, p.y - h, w * (t.hp / t.maxHp), h);
      ctx.strokeStyle = '#dce9f055';
      ctx.lineWidth = 1;
      ctx.strokeRect(p.x - w / 2 - 1.5, p.y - h - 1.5, w + 3, h + 3);
    }

    // NIKKEs (the hero and the supply squad): name over a segmented health line.
    const nikkeBar = (x: number, y: number, z: number, hpShare: number, name: string, width: number, color: string, offsetY=0): void => {
      const at = project(x, y, z);
      if (!at.visible) return;
      at.y+=offsetY;
      const w = width * scale, h = 6 * scale, segments = 5;
      ctx.fillStyle = '#060a0f';
      ctx.fillRect(at.x - w / 2 - 1, at.y - h - 1, w + 2, h + 2);
      ctx.fillStyle = color;
      ctx.fillRect(at.x - w / 2, at.y - h, w * Math.max(0, Math.min(1, hpShare)), h);
      ctx.fillStyle = '#0e1727';
      for (let i = 1; i < segments; i++) ctx.fillRect(at.x - w / 2 + (w * i) / segments - .5, at.y - h, 1, h);
      ctx.font = `700 ${13 * scale}px Rajdhani, 'Segoe UI', sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#000b';
      ctx.strokeText(name, at.x, at.y - h - 3 * scale);
      ctx.fillStyle = '#eef3f2';
      ctx.fillText(name, at.x, at.y - h - 3 * scale);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
    };
    for (const ally of targets.squad) if(ally.alive){
      const state=ally.cloneDisplay;
      if(!state){nikkeBar(ally.position.x, ally.position.y + 2.3, ally.position.z, ally.hp / ally.maxHp, ally.name.toUpperCase(), 50, '#5fc7d8');continue;}
      const color=state.silver?'#e7f5ff':state.ready?'#ffe36c':'#bca36e';
      const p=project(ally.position.x,ally.position.y+2.5,ally.position.z);
      if(!p.visible)continue;
      const r=7*scale;
      // A filling ring becomes a solid diamond at maturity; silver uses a shrinking arc.
      ctx.fillStyle='#080d16dd';ctx.beginPath();ctx.arc(p.x,p.y,r+3*scale,0,Math.PI*2);ctx.fill();
      ctx.lineWidth=2*scale;ctx.strokeStyle='#6a7079';ctx.beginPath();ctx.arc(p.x,p.y,r,0,Math.PI*2);ctx.stroke();
      ctx.strokeStyle=color;ctx.beginPath();ctx.arc(p.x,p.y,r,-Math.PI/2,-Math.PI/2+state.progress*Math.PI*2);ctx.stroke();
      if(state.ready){ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(p.x,p.y-r+2);ctx.lineTo(p.x+r-2,p.y);ctx.lineTo(p.x,p.y+r-2);ctx.lineTo(p.x-r+2,p.y);ctx.closePath();ctx.fill();}
      if(state.retrieving){ctx.strokeStyle='#fff';ctx.lineWidth=2*scale;ctx.beginPath();ctx.moveTo(p.x-5*scale,p.y-16*scale);ctx.lineTo(p.x,p.y-11*scale);ctx.lineTo(p.x+5*scale,p.y-16*scale);ctx.stroke();}
      if(ally.hp<ally.maxHp){ctx.fillStyle='#080d16';ctx.fillRect(p.x-15*scale,p.y+12*scale,30*scale,3*scale);ctx.fillStyle=color;ctx.fillRect(p.x-15*scale,p.y+12*scale,30*scale*Math.max(0,ally.hp/ally.maxHp),3*scale);}

    }
    if (player.chibi.root.isEnabled() && !player.transported)
      nikkeBar(player.position.x, player.position.y + 2.55, player.position.z, player.hp / player.maxHp, this.heroName.toUpperCase(), 64, '#6edc70');

    // damage numbers rise and fade; crits are gold with a "!"
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const n of run.numbers) {
      const t = n.age / NUMBER_LIFE;
      const p = project(n.x, n.y + t * .9, n.z);
      if (!p.visible) continue;
      const size = (n.crit ? 30 : 23) * scale * (t < .12 ? .7 + t * 2.5 : 1);
      ctx.font = `700 ${size}px Rajdhani, 'Segoe UI', sans-serif`;
      ctx.globalAlpha = t < .7 ? 1 : (1 - t) / .3;
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#000c';
      const text = `${n.value}${n.crit ? '!' : ''}`;
      ctx.strokeText(text, p.x, p.y);
      ctx.fillStyle = n.crit ? '#ffd34d' : '#ffffff';
      ctx.fillText(text, p.x, p.y);
    }
    ctx.globalAlpha = 1;

    // reticle, with the reload drawn as an arc around it
    const rc = this.reticleCtx;
    rc.setTransform(1, 0, 0, 1, 0, 0);
    rc.clearRect(0, 0, c.width, c.height);
    rc.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (pointer.inside) {
      const ctx = rc;
      const { x, y } = pointer;
      const r = 13 * scale;
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#000a';
      ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = '#e9fbff';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        ctx.beginPath();
        ctx.moveTo(x + dx * (r - 4), y + dy * (r - 4));
        ctx.lineTo(x + dx * (r + 6), y + dy * (r + 6));
        ctx.strokeStyle = '#000a'; ctx.lineWidth = 4; ctx.stroke();
        ctx.strokeStyle = '#e9fbff'; ctx.lineWidth = 2; ctx.stroke();
      }
      ctx.fillStyle = '#e9fbff';
      ctx.beginPath(); ctx.arc(x, y, 2, 0, Math.PI * 2); ctx.fill();
      const heldSpecial = player.kit.special().charge ?? null;
      if (player.weaponCharge !== null || heldSpecial !== null) {
        const charge = Math.min(1, heldSpecial ?? player.weaponCharge! / 3), full = charge >= 1 - 1e-6;
        const chargeColor = heldSpecial !== null ? '#d398ff' : '#32cfff';
        const radius = r + 11 * scale;
        ctx.strokeStyle = '#07131ee8';ctx.lineWidth = 6 * scale;
        ctx.beginPath();ctx.arc(x,y,radius,0,Math.PI*2);ctx.stroke();
        ctx.strokeStyle = full ? '#f2ffff' : chargeColor;ctx.lineWidth = (full ? 4 : 3) * scale;
        ctx.beginPath();ctx.arc(x,y,radius,-Math.PI/2,-Math.PI/2+charge*Math.PI*2);ctx.stroke();
        if (full) for (let i=0;i<4;i++) {
          const a=i*Math.PI/2+Math.PI/4;
          ctx.beginPath();ctx.moveTo(x+Math.cos(a)*(radius+4*scale),y+Math.sin(a)*(radius+4*scale));
          ctx.lineTo(x+Math.cos(a)*(radius+10*scale),y+Math.sin(a)*(radius+10*scale));ctx.stroke();
        }
        ctx.textAlign='center';ctx.textBaseline='top';ctx.font=`700 ${14*scale}px Rajdhani, sans-serif`;
        const label=full?'FULLY CHARGED':`CHARGING ${Math.floor(charge*100)}%`;
        const labelY=y+radius+14*scale;
        ctx.lineWidth=4*scale;ctx.strokeStyle='#07131e';ctx.strokeText(label,x,labelY);
        ctx.fillStyle=full?'#f2ffff':chargeColor;ctx.fillText(label,x,labelY);
        if (full) {
          ctx.font=`600 ${11*scale}px Rajdhani, sans-serif`;
          const releaseLabel = heldSpecial !== null ? 'RELEASE RMB' : 'RELEASE LMB';
          ctx.strokeText(releaseLabel,x,labelY+16*scale);ctx.fillText(releaseLabel,x,labelY+16*scale);
        }
      } else if (player.reloading > 0) {
        const k = 1 - player.reloading / player.kit.weapon.reload;
        ctx.strokeStyle = '#ffd86b';
        ctx.lineWidth = 3.5;
        ctx.beginPath(); ctx.arc(x, y, r + 9, -Math.PI / 2, -Math.PI / 2 + k * Math.PI * 2); ctx.stroke();
      } else if (!player.kit.weapon.melee && player.ammo <= 2) {
        ctx.fillStyle = player.ammo === 0 ? '#ff6f6f' : '#ffd86b';
        for (let i = 0; i < player.ammo; i++) ctx.fillRect(x + r + 8 + i * 6, y - 5, 3.5, 10);
      }
    }
  }

  /** Radar centred on the hero: range rings, crosshair, Raptures in red, the hero as a green arrow along the aim. */
  private drawRadar(player: Player, targets: TargetField): void {
    const { radarCtx: ctx, dpr } = this;
    const { width: w, height: h } = this.radar;
    if (w < 4 || h < 4) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const u = w / 184; // the reference canvas is 184px wide; scale its marks with the HUD
    const cx = w / 2, cy = h / 2, r = Math.min(w, h) / 2 - 6 * u;
    const k = r / RADAR_RANGE;
    ctx.lineWidth = 1 * dpr;
    for (const [f, opacity] of [[1, .28], [.72, .16], [.36, .08]]) {
      ctx.strokeStyle = `rgba(225,236,244,${opacity})`;
      ctx.beginPath(); ctx.arc(cx, cy, r * f, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(0, cy); ctx.lineTo(w, cy);
    ctx.moveTo(cx, 0); ctx.lineTo(cx, h);
    ctx.strokeStyle = 'rgba(225,236,244,.16)';
    ctx.setLineDash([1 * u, 3 * u]);
    ctx.stroke();
    ctx.setLineDash([]);
    // ticks on the outer ring
    ctx.strokeStyle = 'rgba(225,236,244,.45)';
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * (r - 5 * dpr), cy + Math.sin(a) * (r - 5 * dpr));
      ctx.lineTo(cx + Math.cos(a) * (r + 3 * dpr), cy + Math.sin(a) * (r + 3 * dpr));
      ctx.stroke();
    }
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#ff4b47';
    for (const t of targets.targets) {
      if (!t.alive) continue;
      const x = cx + (t.position.x - player.position.x) * k, y = cy - (t.position.z - player.position.z) * k;
      ctx.beginPath(); ctx.arc(x, y, 2 * u, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    const s = 6.5 * u;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(player.aimYaw);
    ctx.fillStyle = '#4ff0a0';
    ctx.beginPath(); ctx.moveTo(0, -s * 1.25); ctx.lineTo(s, s * .85); ctx.lineTo(-s, s * .85); ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

// The HUD updates every frame. Skip writes whose value hasn't changed: each attribute or style
// write invalidates style even when the value is the same.
function setText(el: HTMLElement, text: string): void {
  if (el.textContent !== text) el.textContent = text;
}

function setAttr(el: HTMLElement, name: string, value: string): void {
  if (el.getAttribute(name) !== value) el.setAttribute(name, value);
}

function setDisabled(el: HTMLButtonElement, disabled: boolean): void {
  if (el.disabled !== disabled) el.disabled = disabled;
}

/** Inline widths read back normalised ('0' as '0px'), so remember what was written instead. */
const widths = new WeakMap<HTMLElement, string>();
function setWidth(el: HTMLElement, width: string): void {
  if (widths.get(el) === width) return;
  widths.set(el, width);
  el.style.width = width;
}

function setProgress(el: HTMLElement, value: number, max: number): void {
  const now = String(Math.max(0, Math.min(max, value)));
  if (el.getAttribute('aria-valuenow') !== now) el.setAttribute('aria-valuenow', now);
  if (el.getAttribute('aria-valuemax') !== String(max)) el.setAttribute('aria-valuemax', String(max));
}
