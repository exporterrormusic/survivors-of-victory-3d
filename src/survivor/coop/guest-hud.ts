import { returnToMainMenu } from '../../frontend/return-to-menu';
﻿// A co-op guest's round HUD: the host's Survival objective box, Obelisk bar and banners, in the same
// boxes Survival mode draws (mode/survival-mode.css). Text only (never the host's HTML). The talent
// line is this player's own.

import type { Run } from '../run';
import type { RoundInfo } from './net-host';
import '../mode/survival-mode.css';

/**
 * A co-op round's end-screen buttons, for host and guests alike: back to the same room's lobby
 * (the Multiplayer screen reopens it by code: the host hosts it again, guests rejoin), or the menu.
 */
export function coopEndActions(role: 'host' | 'join', code: string): HTMLButtonElement[] {
  const lobby = document.createElement('button'), quit = document.createElement('button');
  lobby.textContent = 'Return to lobby'; quit.textContent = 'Quit to main menu';
  lobby.addEventListener('click', () => location.assign(`${location.pathname}?preview=multiplayer&lobby=${role}&room=${encodeURIComponent(code)}`));
  quit.addEventListener('click', () => returnToMainMenu());
  return [lobby, quit];
}

export class GuestRoundHud {

  private readonly boss = document.createElement('div');
  private readonly notice = document.createElement('div');
  private noticeFor = 0;
  private shown = false;
  /** what was last drawn, to redraw only on a new round update or talent change */
  private drawn: RoundInfo | null = null;

  private result: HTMLElement | null = null;

  constructor(hud: HTMLElement, private readonly code: string) {

    this.boss.className = 'survival-boss';
    this.notice.className = 'survival-notice';
    this.boss.hidden = true;
    hud.append(this.boss, this.notice);
  }

  banner(text: string, seconds = 3): void {
    this.notice.textContent = text; this.noticeFor = seconds;
    this.notice.classList.remove('show'); void this.notice.offsetWidth; this.notice.classList.add('show');
  }

  update(dt: number, round: RoundInfo | null, run: Run): void {
    if (this.noticeFor > 0 && (this.noticeFor -= dt) <= 0) this.notice.classList.remove('show');
    if (round && (round.phase === 'victory' || round.phase === 'defeat')) this.showResult(round, run);
    const objective = round?.objective;
    if (!objective) return;
    if (!this.shown) {
      // The host is in a Survival Round: hide the Test Range title and lab, as Survival mode does.
      this.shown = true;
      document.body.classList.add('survival-round');

    }
    if (round === this.drawn) return;
    this.drawn = round;
    const boss = round.boss;
    this.boss.hidden = !boss;
    if (boss) {
      const bar = document.createElement('progress');
      bar.max = boss[1]; bar.value = boss[0]; bar.setAttribute('aria-label', 'Obelisk health');
      this.boss.replaceChildren(`OBELISK · ${boss[0]} / ${boss[1]}`, bar);
    }
  }

  /** The host closed the room or vanished: the match can't go on here. */
  lost(reason: 'no-host' | 'host-left'): void {
    this.panel(reason === 'no-host' ? 'COULD NOT CONNECT' : 'HOST LEFT',
      [reason === 'no-host' ? 'No host answered with that room code.' : 'The host closed the room, so the round has ended.']);
  }

  /** Same results card as Survival's (survival-mode.css), from the host's round. */
  private showResult(round: RoundInfo, run: Run): void {
    if (this.result) return;
    const endless = round.objective?.mode === 'ENDLESS';
    const minutes = Math.floor(round.elapsed / 60), seconds = Math.floor(round.elapsed % 60);
    const talents = run.tiers ? run.tiers.tiers.map((_, i) => run.tiers!.choice(i)?.name).filter(Boolean).join(' · ') || 'No talents chosen' : '';
    this.panel(endless ? 'RUN ENDED' : round.phase === 'victory' ? 'ROUND COMPLETE' : 'ROUND ENDED',
      [`${minutes}:${String(seconds).padStart(2, '0')} · ${round.kills} Raptures defeated · Level ${round.level}`, talents],
      "Co-op rounds as a guest don't award cores or records yet.");
  }

  private panel(title: string, lines: string[], note?: string): void {
    this.result?.remove();
    const result = this.result = document.createElement('div');
    result.className = 'survival-results';
    const section = document.createElement('section');
    const h1 = document.createElement('h1'); h1.textContent = title;
    section.append(h1, ...lines.filter(Boolean).map(line => { const p = document.createElement('p'); p.textContent = line; return p; }));
    if (note) { const small = document.createElement('small'); small.textContent = note; section.append(small); }
    const actions = document.createElement('div'); actions.dataset.actions = '';
    actions.append(...coopEndActions('join', this.code)); section.append(actions); result.append(section);
    document.getElementById('hud')!.append(result);
    document.exitPointerLock?.();
  }

  dispose(): void {
    this.result?.remove();
     this.boss.remove(); this.notice.remove();
    document.body.classList.remove('survival-round');
  }
}

