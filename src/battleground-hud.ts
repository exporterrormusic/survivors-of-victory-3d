import { returnToMainMenu } from './frontend/return-to-menu';
import type { Combat } from './combat';
import { BATTLEGROUND } from './battleground';

export class BattlegroundHud {
  private readonly status = document.createElement('div');
  private readonly result = document.createElement('div');
  private ended = false;

  constructor() {
    this.status.id = 'battle-status';
    this.status.setAttribute('aria-label','Core health');
    this.status.innerHTML = `<div class="core-scores">${(['blue', 'red'] as const).map(team => `<div class="core-score ${team}"><div role="progressbar" aria-label="${team === 'blue' ? 'Allied' : 'Enemy'} core health" aria-valuemin="0" aria-valuemax="100"><i></i><b></b></div></div>`).join('')}<span class="core-health-label">Core Health</span></div>`;
    this.result.id = 'match-result'; this.result.className = 'hidden';
    this.result.setAttribute('role', 'dialog'); this.result.setAttribute('aria-modal', 'true'); this.result.setAttribute('aria-labelledby', 'match-result-title');
    this.result.innerHTML = `<div class="match-result-card"><span class="match-result-map"></span><h1 id="match-result-title"></h1><p></p><div class="match-result-actions"><button type="button" class="match-replay">Play again</button><button type="button" class="match-lobby">Return to lobby</button></div></div>`;
    this.result.querySelector('.match-result-map')!.textContent = BATTLEGROUND.name;
    this.result.querySelector('.match-replay')!.addEventListener('click', () => location.reload());
    this.result.querySelector('.match-lobby')!.addEventListener('click', () => returnToMainMenu());
    this.result.addEventListener('keydown', e => {
      if (e.code !== 'Tab') return;
      const buttons = [...this.result.querySelectorAll<HTMLButtonElement>('button')];
      if (e.shiftKey && document.activeElement === buttons[0]) { buttons[1].focus(); e.preventDefault(); }
      else if (!e.shiftKey && document.activeElement === buttons[1]) { buttons[0].focus(); e.preventDefault(); }
    });
    // The core row shares the scoreboard's middle grid column at every width.
    document.getElementById('topbar')!.append(this.status);
    document.getElementById('hud')!.append(this.result);
  }

  update(combat: Combat): void {
    for (const team of ['blue', 'red'] as const) {
      const core = combat.structures.find(s => s.team === team && s.site.kind === 'core')!;
      const score = this.status.querySelector(`.core-score.${team}`)!;
      const percent = Math.ceil(core.hp / core.maxHp * 100);
      score.querySelector('b')!.textContent = core.shielded ? 'INVULNERABLE' : `${percent}%`;
      score.classList.toggle('protected',core.shielded);
      (score.querySelector('i') as HTMLElement).style.width = `${percent}%`;
      score.querySelector('[role=progressbar]')!.setAttribute('aria-valuenow', String(percent));
      score.setAttribute('title', `${core.name}: ${Math.ceil(core.hp)} / ${core.maxHp}${core.shielded ? ' — Destroy a Fort and Keep in the same lane to expose this Core' : ''}`);
    }
    if (!combat.winner || this.ended) return;
    this.ended = true;
    const won = combat.winner === 'blue';
    this.result.className = won ? 'victory' : 'defeat';
    this.result.querySelector('h1')!.textContent = won ? 'Victory' : 'Defeat';
    this.result.querySelector('p')!.textContent = won ? 'The Rapture Core has been destroyed.' : 'The Ark Reactor has fallen.';
    this.result.querySelector<HTMLButtonElement>('.match-replay')!.focus();
  }
}
