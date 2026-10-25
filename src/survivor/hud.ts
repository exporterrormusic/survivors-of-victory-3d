// Survivor combat HUD (the user's chosen mockup, 2026-10-25): flat translucent panels with thin
// lines and corner brackets, gold for Burst and progress, mint for health.
//   top left      objective        top centre  time and wave        top right  music, pause (Esc)
//   bottom left   portrait, affiliation, name, health, magazine and reload key
//   bottom centre Dash, Weapon and Special cards, then the wide Burst card with her art
//   bottom right  radar
//   bottom edge   level, XP line, and unspent upgrade points (Tab)
// A canvas under the panels draws Rapture health bars, damage numbers and a thin health line over
// the hero; a canvas above everything draws the reticle and its reload arc.

import type { Player } from './player';
import { NUMBER_LIFE, type Run } from './run';
import type { TargetField } from './targets';
import type { CharacterKit } from './kit';
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
const ICONS: Record<string, string> = {
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
  private readonly burstState = document.createElement('b');
  private readonly burstFill = document.createElement('i');
  private readonly radar = document.createElement('canvas');
  private readonly radarCtx = this.radar.getContext('2d')!;
  private readonly pauseButton = document.createElement('button');
  private readonly musicMount = document.createElement('div');
  private dpr = 1;
  private shownAmmo = -1;
  private shownReload = false;

  constructor(kit: CharacterKit, hero: HudCharacter, onPause: () => void, onAction: (action: Action) => void) {
    const hud = $('hud');
    hud.classList.add('survivor');
    // the MOBA's own frames give way to the survivor layout below
    for (const id of ['topbar', 'unit-frames', 'channel', 'portrait', 'ability-dock', 'map-panel', 'menu-btn']) $(id)?.classList.add('hidden');

    // top left: objective
    const objective = el('div', 'run-panel', hud);
    objective.id = 'run-objective';
    objective.innerHTML = '<i class="ro-mark" aria-hidden="true"></i><div><b>Test range</b><small>Eliminate Raptures</small></div>';
    mountPanelTrim(objective, 'objective');

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
    pauseButton.setAttribute('aria-label', 'Pause (Esc)');
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
    this.rounds.className = 'rh-rounds';
    this.rounds.setAttribute('aria-hidden', 'true');
    ammo.append(this.rounds, this.roundCount);
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
      actionButton(root, id === 'weapon' ? 'fire' : id, `${id === 'special' ? kit.specialName : label} (${key})`);
      const labelEl = el('small', 'rd-label', root);
      labelEl.textContent = label;
      const body = el('div', 'rd-body', root);
      const iconArt = el('div', 'rd-icon', body);
      iconArt.setAttribute('aria-hidden', 'true');
      iconArt.innerHTML = ICONS[icon] ?? '';
      const value = counted ? el('b', 'rd-count', body) : null;
      const meter = el('i', 'rd-meter', root);
      el('span', '', el('kbd', 'run-key', root)).textContent = key;
      this.cards.set(id, { root, label: labelEl, value, meter });
    }
    this.burst.className = 'rd-burst';
    actionButton(this.burst, 'burst', `${kit.burstName} (E)`);
    dock.append(this.burst);
    mountHudFrame(this.burst, 'burst');
    const burstArt = el('div', 'rb-art', this.burst);
    if (hero.burstArt) burstArt.style.backgroundImage = `url("${import.meta.env.BASE_URL}${hero.burstArt}")`;
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
    up.append('[Tab] Upgrades ', this.upgrades);

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
    this.pauseButton.setAttribute('aria-label', paused ? 'Resume (Esc)' : 'Pause (Esc)');
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
    setText(this.upgrades, String(run.skillPoints));
    this.upgrades.parentElement!.classList.toggle('has-points', run.skillPoints > 0);
    setAttr(this.upgrades.parentElement!, 'aria-label', `Ability ranks (Tab), ${run.skillPoints} unspent skill points`);

    // health and magazine
    setWidth(this.hpFill, `${(player.hp / player.maxHp) * 100}%`);
    setProgress(this.hpText.parentElement!, Math.ceil(player.hp), player.maxHp);
    setText(this.hpText, `${Math.ceil(player.hp)} / ${player.maxHp}`);
    const reloading = player.reloading > 0;
    if (player.ammo !== this.shownAmmo || reloading !== this.shownReload) {
      this.shownAmmo = player.ammo;
      this.shownReload = reloading;
      const size = kit.weapon.magazine;
      while (this.rounds.childElementCount < size) el('i', '', this.rounds);
      [...this.rounds.children].forEach((round, i) => round.classList.toggle('spent', i >= player.ammo));
      this.rounds.classList.toggle('reloading', reloading);
      this.roundCount.innerHTML = `${String(player.ammo).padStart(2, '0')}<small> / ${String(size).padStart(2, '0')}</small>`;
    }

    // cards: a line along the bottom shows reload / recharge progress
    const weapon = this.cards.get('weapon')!;
    weapon.root.classList.toggle('busy', reloading);
    setAttr(weapon.root, 'aria-label', reloading ? `Reloading (${player.reloading.toFixed(1)} seconds)` : `Weapon (LMB), ${player.ammo} rounds`);
    setText(weapon.label, reloading ? 'Reloading' : player.weaponCharge !== null ? `Charge ${Math.round(player.weaponCharge / 3 * 100)}%` : 'Weapon');
    setWidth(weapon.meter, reloading ? `${(1 - player.reloading / kit.weapon.reload) * 100}%` : player.weaponCharge !== null ? `${player.weaponCharge / 3 * 100}%` : '0');

    const special = kit.special();
    const sp = this.cards.get('special')!;
    setText(sp.value!, `${special.charges}`);
    sp.root.classList.toggle('busy', special.charges <= 0);
    setDisabled(sp.root, special.charges <= 0);
    setAttr(sp.root, 'aria-label', `${kit.specialName} (RMB), ${special.charges} charges`);
    setWidth(sp.meter, special.charges < special.maxCharges ? `${special.progress * 100}%` : '0');

    this.cards.get('dash')!.root.classList.toggle('active', player.dashing > 0);

    const ready = run.burst >= 100;
    this.burst.classList.toggle('ready', ready);
    setDisabled(this.burst, !ready);
    setText(this.burstState, player.burstCharge !== null ? `Focus ${Math.round(player.burstCharge / 2.5 * 100)}%` : ready ? 'Burst ready' : `Burst ${Math.floor(run.burst)}%`);
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
    if (player.trainingReset > 0) {
      ctx.fillStyle = '#fff0e5';
      ctx.font = `bold ${24 * scale}px Rajdhani, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('TRAINING RESET', c.width / dpr / 2, c.height / dpr * .4);
      ctx.textAlign = 'left';
    }

    // Rapture health bars: bars only, no names
    for (const t of targets.targets) {
      if (!t.alive || t.scale < .5) continue;
      const p = project(t.position.x, t.barHeight, t.position.z);
      if (!p.visible) continue;
      const w = 54 * scale, h = 6 * scale;
      ctx.fillStyle = '#060a0f';
      ctx.fillRect(p.x - w / 2 - 1, p.y - h - 1, w + 2, h + 2);
      ctx.fillStyle = '#ef6c69';
      ctx.fillRect(p.x - w / 2, p.y - h, w * (t.hp / t.maxHp), h);
      ctx.strokeStyle = '#dce9f055';
      ctx.lineWidth = 1;
      ctx.strokeRect(p.x - w / 2 - 1.5, p.y - h - 1.5, w + 3, h + 3);
    }

    // the hero: one thin segmented health line, no name
    const hp = project(player.position.x, player.position.y + 2.55, player.position.z);
    if (hp.visible && player.chibi.root.isEnabled() && !player.transported) {
      const w = 64 * scale, h = 6 * scale, segments = 5;
      ctx.fillStyle = '#060a0f';
      ctx.fillRect(hp.x - w / 2 - 1, hp.y - h - 1, w + 2, h + 2);
      ctx.fillStyle = '#6edc70';
      ctx.fillRect(hp.x - w / 2, hp.y - h, w * (player.hp / player.maxHp), h);
      ctx.fillStyle = '#0e1727';
      for (let i = 1; i < segments; i++) ctx.fillRect(hp.x - w / 2 + (w * i) / segments - .5, hp.y - h, 1, h);
    }

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
      if (player.reloading > 0) {
        const k = 1 - player.reloading / player.kit.weapon.reload;
        ctx.strokeStyle = '#ffd86b';
        ctx.lineWidth = 3.5;
        ctx.beginPath(); ctx.arc(x, y, r + 9, -Math.PI / 2, -Math.PI / 2 + k * Math.PI * 2); ctx.stroke();
      } else if (player.ammo <= 2) {
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
