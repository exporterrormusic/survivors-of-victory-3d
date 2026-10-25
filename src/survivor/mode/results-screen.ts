// The end-of-trip screen (mockup S07): what was banked or lost, the job, the NIKKE's level and SP
// gained, the trip, and the field kits that end with it. Full-screen menu style (cyan lines, gold
// for progress). The panel sits right; the frozen 3D view stays visible on the left, where the
// camera holds a close shot of the NIKKE (`standX`). The rest of the HUD hides while it's open.

import './results.css';
import { mountHudFrame } from '../hud-frames';
import { MAX_ALERT } from './alert';
import { FIELD_KITS, FIELD_KIT_IDS } from './field-kits';
import type { SortieResults } from './sortie';
import { KIT_ICONS, clock } from './sortie-hud';

export interface TripSummary {
  readonly results: SortieResults;
  readonly zone: { readonly name: string; readonly image: string };
  readonly nikke: {
    readonly name: string;
    /** banner art for the level row (Snow White: her Burst card's eye close-up) */
    readonly art: string | null;
    readonly levelBefore: number;
    readonly level: number;
    readonly xp: number;
    readonly xpToNext: number;
  };
  readonly kills: number;
}

const ICONS = {
  salvage: '<path d="M12 3l8 9-8 9-8-9z"/>',
  dust: '<path d="M12 2l4 7-4 13-4-13z"/><path d="M5.5 9l3 3-1 8-4-6zM18.5 9l-3 3 1 8 4-6z"/>',
  credits: '<path d="M3 7h18v11H3z"/><path d="M6 11h5v3H6zM14 11h4M14 14h3" stroke="#07111a" stroke-width="1.6"/>',
  module: '<path d="M12 2l8 5v10l-8 5-8-5V7z"/><path d="M12 7l4 2.5v5L12 17l-4-2.5v-5z" fill="#07111a"/>',
  core: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.5" fill="#07111a"/><circle cx="12" cy="12" r="2"/>',
  crate: '<path d="M3 8l9-4 9 4v10l-9 4-9-4z"/><path d="M3 8l9 4 9-4M12 12v10" stroke="#07111a" stroke-width="1.6" fill="none"/>',
  time: '<circle cx="12" cy="13" r="8" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 8.5V13l3 2M9 3h6" stroke="currentColor" stroke-width="2" fill="none"/>',
  kills: '<path d="M12 3a8 8 0 0 0-8 8c0 3 1.5 5 3 6v4h10v-4c1.5-1 3-3 3-6a8 8 0 0 0-8-8z"/><circle cx="9" cy="11.5" r="2" fill="#07111a"/><circle cx="15" cy="11.5" r="2" fill="#07111a"/>',
  alert: '<path d="M12 3l10 18H2z"/><path d="M12 9.5v5.5M12 17v2" stroke="#07111a" stroke-width="2"/>',
  sp: '<path d="M4 12l8-7 8 7-2.5 2.2L12 9.4l-5.5 4.8zM4 19l8-7 8 7-2.5 2.2L12 16.4l-5.5 4.8z"/>',
  next: '<path d="M3 4h5l7 8-7 8H3l7-8zM11 4h5l7 8-7 8h-5l7-8z"/>',
} as const;

const svg = (paths: string) => `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${paths}</svg>`;
const two = (n: number) => String(n).padStart(2, '0');
const num = (n: number) => Math.floor(n).toLocaleString('en-US');
const escape = (text: string) => text.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

export class ResultsScreen {
  private readonly root: HTMLDivElement;
  private readonly panel: HTMLElement;
  private readonly hud: HTMLElement;

  constructor(hud: HTMLElement, summary: TripSummary, onContinue: () => void) {
    this.hud = hud;
    const { results: r, zone, nikke } = summary;
    const won = r.outcome === 'extracted';
    const title = won ? 'Sector cleared' : r.abandoned ? 'Sortie abandoned' : 'Signal lost';
    const purse = r.purse;
    const salvage = `${svg(ICONS.salvage)}<small>Salvage</small><b>◆ ${num(purse.salvage)}</b>`;
    const tiles = [
      // Only banked salvage turns into Core Dust.
      won ? `<div class="sr-tile sr-convert">
        <div>${salvage}</div>
        <i class="sr-arrow">${svg(ICONS.next)}</i>
        <div class="sr-dust">${svg(ICONS.dust)}<small>Core dust</small><b>${num(purse.salvage)}</b></div>
      </div>` : `<div class="sr-tile">${salvage}</div>`,
      `<div class="sr-tile">${svg(ICONS.credits)}<small>Credits</small><b>${num(purse.credits)}</b></div>`,
      purse.modules > 0 ? `<div class="sr-tile">${svg(ICONS.module)}<small>NIPMH module</small><b>×${purse.modules}</b></div>` : '',
      purse.pristineCores > 0 ? `<div class="sr-tile sr-core">${svg(ICONS.core)}<small>Pristine core</small><b>×${purse.pristineCores}</b></div>` : '',
    ].filter(Boolean);
    const jobState = r.jobDone
      ? won ? `<span class="sr-ok">✓</span><em>+${num(r.jobReward)}</em>` : '<span class="sr-bad">Reward lost</span>'
      : '<span class="sr-bad">Not done</span>';
    const gained = nikke.level - nikke.levelBefore;
    const xpShare = Math.max(0, Math.min(1, nikke.xp / nikke.xpToNext));
    const pips = Array.from({ length: MAX_ALERT }, (_, i) => `<i class="${i < r.alertReached ? 'on' : ''}"></i>`).join('');
    const found = new Map(r.fieldKits.map(({ id, count }) => [id, count]));
    const kits = FIELD_KIT_IDS.map((id) => {
      const kit = FIELD_KITS[id];
      return `<span class="sr-kit" title="${escape(kit.name)}: ${escape(kit.effect)}">${svg(KIT_ICONS[kit.icon] ?? '')}<b>×${found.get(id) ?? 0}</b></span>`;
    }).join('');

    this.root = document.createElement('div');
    this.root.className = 'sm-results sr';
    this.root.dataset.outcome = r.outcome;
    this.root.innerHTML = `
      <section class="sr-panel" role="dialog" aria-modal="true" aria-labelledby="sr-title">
        <header class="sr-head" style="--zone: url('${zone.image}')">
          <h2 id="sr-title">${title} <span>· ${escape(zone.name)}</span></h2>
          ${won ? '' : '<p class="sr-sub">Carried loot lost · XP and levels kept</p>'}
        </header>
        <h3 class="sr-label${won ? '' : ' sr-lost'}">${won ? 'Banked' : 'Lost'}</h3>
        <div class="sr-tiles" style="--extra: ${tiles.length - 1}">${tiles.join('')}</div>
        <h3 class="sr-label">Job</h3>
        <div class="sr-row sr-job">${svg(ICONS.crate)}<b>${escape(r.jobTitle)} ${r.jobProgress}/${r.jobTarget}</b>${jobState}</div>
        <h3 class="sr-label">${escape(nikke.name)}</h3>
        <div class="sr-row sr-nikke">
          <div class="sr-art"${nikke.art ? ` style="background-image: url('${nikke.art}')"` : ''}></div>
          <div class="sr-level">LV <span>${two(nikke.levelBefore)}</span>${gained > 0 ? ` <i>→</i> LV <strong>${two(nikke.level)}</strong>` : ''}</div>
          <div class="sr-xp" role="progressbar" aria-label="Experience" aria-valuemin="0" aria-valuemax="${nikke.xpToNext}" aria-valuenow="${Math.floor(nikke.xp)}"><i style="width: ${(xpShare * 100).toFixed(1)}%"></i></div>
          <small class="sr-xp-text">${num(nikke.xp)} / ${num(nikke.xpToNext)}</small>
          ${gained > 0 ? `<div class="sr-sp">${svg(ICONS.sp)}+${gained} SP</div>` : ''}
        </div>
        <h3 class="sr-label">Trip</h3>
        <div class="sr-row sr-trip">
          <div>${svg(ICONS.time)}<p><small>Time</small><b>${clock(r.time)}</b></p></div>
          <div>${svg(ICONS.kills)}<p><small>Kills</small><b>${num(summary.kills)}</b></p></div>
          <div class="sr-alert" data-level="${r.alertReached}">${svg(ICONS.alert)}<p><small>Alert</small><span class="sr-pips">${pips}</span></p></div>
        </div>
        <div class="sr-foot">
          <div>
            <h3 class="sr-label sr-muted">Field kits <small>Last one trip</small></h3>
            <div class="sr-kits">${kits}</div>
          </div>
          <button type="button" class="sr-continue" data-a="continue"><span>${svg(ICONS.next)}</span><b>Continue</b></button>
        </div>
      </section>`;
    this.panel = this.root.querySelector('.sr-panel')!;
    const button = this.root.querySelector<HTMLButtonElement>('.sr-continue')!;
    mountHudFrame(button, 'card');
    button.addEventListener('click', onContinue);
    hud.classList.add('sr-open');
    hud.append(this.root);
    button.focus({ preventScroll: true });
  }

  /** Where across the HUD (0–1) the NIKKE should stand: the middle of the space left of the panel. */
  get standX(): number {
    const view = this.hud.getBoundingClientRect(), panel = this.panel.getBoundingClientRect();
    const free = (panel.left - view.left) / Math.max(1, view.width);
    // Compact layouts leave no room beside the panel; keep her centred behind it.
    return free > .18 ? free / 2 : .5;
  }

  dispose(): void {
    this.hud.classList.remove('sr-open');
    this.root.remove();
  }
}
