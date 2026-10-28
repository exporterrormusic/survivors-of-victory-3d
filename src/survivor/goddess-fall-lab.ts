// Test Lab "Events" tab: step through the Goddess Fall easter egg (goddess-fall-egg.ts).

import { EGG_STEPS, GODDESS_FALL_KEY, goddessFallUnlocked, type GoddessFallEgg } from './goddess-fall-egg';
import { saveSetting } from '../settings-store';
import type { Player } from './player';

export function mountEggLab(egg: GoddessFallEgg, player: Player, toForest: () => void): HTMLElement {
  const panel = document.createElement('div');
  panel.className = 'egg-lab';
  panel.innerHTML = `<h3>Goddess Fall</h3>
    <p data-status></p>
    <div class="weather-presets">
      <button type="button" data-act="back">◀ Back a step</button>
      <button type="button" data-act="forward">Forward a step ▶</button>
      <button type="button" data-act="teleport">Go to objective</button>
      <button type="button" data-act="reset">Restart event</button>
    </div>
    <p data-steps></p>
    <div class="weather-presets"><button type="button" data-act="forest">Load forest</button><button type="button" data-act="relock">Lock Goddess Fall mode</button></div>`;
  const status = panel.querySelector<HTMLElement>('[data-status]')!;
  const steps = panel.querySelector<HTMLElement>('[data-steps]')!;
  const sync = () => {
    const at = EGG_STEPS.indexOf(egg.step);
    status.textContent = egg.active
      ? `Step ${at + 1}/${EGG_STEPS.length}: ${egg.label}`
      : 'Only runs in the Haunted Pine Forest. Load it below.';
    steps.innerHTML = EGG_STEPS.map((s, i) => i === at ? `<b>${i + 1}. ${s}</b>` : `${i + 1}. ${s}`).join(' · ')
      + `<br>Goddess Fall Mode: ${goddessFallUnlocked() ? 'unlocked' : 'locked'}`;
  };
  panel.addEventListener('pointerdown', (e) => e.stopPropagation());
  panel.addEventListener('click', (e) => {
    const act = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-act]')?.dataset.act;
    if (!act) return;
    if (act === 'forest') toForest();
    else if (act === 'relock') saveSetting(GODDESS_FALL_KEY, 'locked');
    else if (egg.active) {
      const at = EGG_STEPS.indexOf(egg.step);
      if (act === 'back') egg.goTo(EGG_STEPS[Math.max(0, at - 1)]);
      if (act === 'forward') egg.goTo(EGG_STEPS[Math.min(EGG_STEPS.length - 1, at + 1)]);
      if (act === 'reset') egg.goTo('lamp');
      if (act === 'teleport') { const o = egg.objective; player.position.set(o.x, player.position.y, o.z); player.unstick(); }
    }
    sync();
  });
  const previous = egg.onStep;
  egg.onStep = (step) => { previous?.(step); sync(); };
  sync();
  // Theme changes don't report a step; refresh while the tab is visible.
  setInterval(() => { if (panel.isConnected && panel.offsetParent) sync(); }, 500);
  return panel;
}
