import type { AchievementDefinition } from '../frontend/profile/AchievementProgress';
import './achievement-toast.css';

const HOLD_MS = 4200;

/** Newly verified achievements, one card at a time in the top-right corner (HUD style: flat panel, brackets, gold). */
export function showAchievementToasts(unlocked: readonly AchievementDefinition[]): void {
  const hud = document.getElementById('hud');
  if (!hud || !unlocked.length) return;
  let stack = hud.querySelector<HTMLDivElement>('.achievement-toasts');
  if (!stack) {
    stack = document.createElement('div');
    stack.className = 'achievement-toasts';
    stack.setAttribute('role', 'status');
    stack.setAttribute('aria-live', 'polite');
    hud.append(stack);
  }
  unlocked.forEach((definition, index) => {
    window.setTimeout(() => {
      const card = document.createElement('div');
      card.className = 'achievement-toast';
      card.innerHTML = '<i class="at-gem"></i><div><small>Achievement verified</small><b></b><p></p></div><em></em>';
      card.querySelector('b')!.textContent = definition.title;
      card.querySelector('p')!.textContent = definition.description;
      card.querySelector('em')!.textContent = `+${definition.points} AP`;
      stack!.append(card);
      window.setTimeout(() => {
        card.classList.add('leaving');
        card.addEventListener('animationend', () => card.remove(), { once: true });
      }, HOLD_MS);
    }, index * 900);
  });
}
