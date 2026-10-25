// Game-mode additions to the survivor HUD (GAME_PLAN §11), in the same flat language: ALERT
// pips under the clock (in place of WAVE), the job and carried salvage in the objective panel,
// field kits above the operator panel, edge markers for exits and Hunters, and a banner line.
// Lives beside hud.ts without changing it. The end-of-trip screen is results-screen.ts.

import './sortie.css';
import { FIELD_KITS, type FieldKitId } from './field-kits';
import { MAX_ALERT } from './alert';

/** exit: a working lift. tower: a dormant lift tower. hunter: the Alert 5 Hunter. */
export type MarkerKind = 'exit' | 'tower' | 'hunter';

export interface Marker {
  readonly kind: MarkerKind;
  /** screen position in HUD pixels, already clamped to the edge when off screen */
  readonly x: number;
  readonly y: number;
  readonly label: string;
  readonly offscreen: boolean;
}

export const KIT_ICONS: Record<string, string> = {
  mag: '<path d="M8 3h8v4H8zM7 8h10l-1 13H8z"/><path d="M12 11v6M9 14h6" stroke="#0b1014" stroke-width="2"/>',
  flame: '<path d="M12 2c1 4 6 6 6 12a6 6 0 0 1-12 0c0-3 2-5 3-7 0 3 2 4 3 4 0-3-1-6 0-9z"/>',
  chip: '<path d="M7 7h10v10H7z"/><path d="M12 4v3M12 17v3M4 12h3M17 12h3M9 4v3M15 4v3M9 17v3M15 17v3" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="12" r="2.4" fill="#0b1014"/>',
  hand: '<path d="M6 12V7a1.5 1.5 0 0 1 3 0v4V5a1.5 1.5 0 0 1 3 0v6V6a1.5 1.5 0 0 1 3 0v6-3a1.5 1.5 0 0 1 3 0v6a6 6 0 0 1-6 6h-1a6 6 0 0 1-5-3l-2-4a1.4 1.4 0 0 1 2-2z"/>',
  turret: '<path d="M7 9h8l3-2v6l-3-2H7zM10 13h3l2 8h-2l-1.5-5-1.5 5H8z"/><path d="M18 4v4M16 6h4" stroke="currentColor" stroke-width="1.6"/>',
  cell: '<path d="M9 2h6v2h2v18H7V4h2z"/><path d="M13 7l-3 6h3l-2 5" stroke="#0b1014" stroke-width="1.8" fill="none"/>',
};

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string, parent: HTMLElement) => {
  const node = document.createElement(tag);
  node.className = className;
  parent.append(node);
  return node;
};

export const clock = (seconds: number) => {
  const s = Math.max(0, Math.ceil(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

export class SortieHud {
  private readonly hud = document.getElementById('hud')!;
  private readonly alert: HTMLDivElement;
  private readonly alertName: HTMLElement;
  private readonly alertNext: HTMLElement;
  private readonly pips: HTMLElement[] = [];
  private readonly objectiveTitle: HTMLElement | null;
  private readonly objectiveLine: HTMLElement | null;
  private readonly carried: HTMLElement;
  private readonly kits: HTMLDivElement;
  private readonly bannerEl: HTMLDivElement;
  private readonly markers: HTMLDivElement;
  private readonly markerPool: HTMLDivElement[] = [];
  private bannerTime = 0;
  private bannerSticky = '';
  private shownKits = '';

  constructor() {
    this.hud.classList.add('sortie-mode');
    const runClock = document.getElementById('run-clock')!;
    this.alert = el('div', 'sm-alert', runClock);
    el('span', 'sm-alert-label', this.alert).textContent = 'Alert';
    const pips = el('span', 'sm-pips', this.alert);
    for (let i = 0; i < MAX_ALERT; i++) this.pips.push(el('i', '', pips));
    this.alertName = el('span', 'sm-alert-name', this.alert);
    this.alertNext = el('span', 'sm-alert-next', this.alert);

    const objective = document.getElementById('run-objective');
    this.objectiveTitle = objective?.querySelector('b') ?? null;
    this.objectiveLine = objective?.querySelector('small') ?? null;
    this.carried = el('em', 'sm-carried', (this.objectiveLine?.parentElement ?? this.hud) as HTMLElement);

    this.kits = el('div', 'sm-kits', this.hud);
    this.bannerEl = el('div', 'sm-banner', this.hud);
    this.markers = el('div', 'sm-markers', this.hud);
  }

  setObjective(title: string, line: string, carried: number, warn: boolean): void {
    if (this.objectiveTitle && this.objectiveTitle.textContent !== title) this.objectiveTitle.textContent = title;
    if (this.objectiveLine && this.objectiveLine.textContent !== line) this.objectiveLine.textContent = line;
    const text = `◆ ${carried} carried`;
    if (this.carried.textContent !== text) this.carried.textContent = text;
    this.carried.classList.toggle('warn', warn);
  }

  setAlert(level: number, name: string, nextIn: number, live: boolean): void {
    this.pips.forEach((pip, i) => pip.classList.toggle('on', i < level));
    this.alert.dataset.level = String(level);
    const label = live ? name : 'Gates opening';
    if (this.alertName.textContent !== label) this.alertName.textContent = label;
    const next = live && Number.isFinite(nextIn) ? `Next ${clock(nextIn)}` : '';
    if (this.alertNext.textContent !== next) this.alertNext.textContent = next;
  }

  setKits(entries: readonly { id: FieldKitId; count: number }[]): void {
    const key = entries.map((e) => `${e.id}${e.count}`).join();
    if (key === this.shownKits) return;
    this.shownKits = key;
    this.kits.replaceChildren(...entries.map(({ id, count }) => {
      const kit = FIELD_KITS[id];
      const cell = document.createElement('div');
      cell.className = 'sm-kit';
      cell.title = `${kit.name}: ${kit.effect}`;
      cell.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${KIT_ICONS[kit.icon] ?? ''}</svg><b>×${count}</b>`;
      return cell;
    }));
  }

  /** A short line under the clock. Sticky text (gates closing, working a site) wins over timed text. */
  banner(text: string, seconds = 3, tone: 'info' | 'good' | 'warn' = 'info'): void {
    this.bannerTime = seconds;
    this.bannerEl.textContent = text;
    this.bannerEl.dataset.tone = tone;
  }

  setSticky(text: string): void { this.bannerSticky = text; }

  setMarkers(markers: readonly Marker[]): void {
    while (this.markerPool.length < markers.length) this.markerPool.push(el('div', 'sm-marker', this.markers));
    this.markerPool.forEach((node, i) => {
      const marker = markers[i];
      node.classList.toggle('hidden', !marker);
      if (!marker) return;
      node.dataset.kind = marker.kind;
      node.classList.toggle('offscreen', marker.offscreen);
      node.style.transform = `translate(${marker.x.toFixed(1)}px, ${marker.y.toFixed(1)}px)`;
      if (node.textContent !== marker.label) node.textContent = marker.label;
    });
  }

  update(dt: number): void {
    this.bannerTime -= dt;
    const sticky = this.bannerSticky !== '';
    if (sticky) {
      if (this.bannerEl.textContent !== this.bannerSticky) this.bannerEl.textContent = this.bannerSticky;
      this.bannerEl.dataset.tone = 'sticky';
    }
    this.bannerEl.classList.toggle('show', sticky || this.bannerTime > 0);
  }

  /** The world freezes behind the results screen, so timed lines would never run out. */
  clearForResults(): void {
    this.bannerSticky = '';
    this.bannerTime = 0;
    this.bannerEl.classList.remove('show');
    this.setMarkers([]);
  }

  dispose(): void {
    this.hud.classList.remove('sortie-mode');
    for (const node of [this.alert, this.carried, this.kits, this.bannerEl, this.markers]) node.remove();
  }
}
