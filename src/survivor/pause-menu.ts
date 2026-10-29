import './pause-menu.css';
import { mountPauseBindings } from './pause-bindings';
import { createPauseVideo } from './pause-video';

/** Move the existing controls without replacing their settings bindings. */
export function organizePauseMenu(online: boolean, applyResolution: () => void = () => {}): void {
  const menu = document.getElementById('menu')!;
  const take = (id: string) => document.getElementById(id)!;
  const row = (id: string) => take(id).closest('label')!;
  const camera = row('camera'), shadows = row('ambient-shadows');
  const audio = take('audio-settings'), help = take('help'), leave = take('leave-match');
  const environment = take('environment-controls'), character = row('variant');
  const debug = menu.querySelector('.debug-tools')!;
  // Environment synchronization still uses these elements during the run.
  // Keep them outside the pause UI, without exposing development controls.
  const internalControls = document.createElement('div');
  internalControls.hidden = true;
  internalControls.append(environment, character, debug, camera);
  menu.parentElement!.append(internalControls);
  const close = take('menu-close');
  menu.classList.add('run-pause-menu');
  menu.setAttribute('aria-label', 'Pause settings');
  menu.setAttribute('aria-modal', 'true');
  const header = document.createElement('header');
  header.className = 'pause-heading';
  header.innerHTML = `<h2>${online ? 'MATCH SETTINGS' : 'PAUSED'}</h2><span>${online ? 'ONLINE MATCH CONTINUES' : 'SETTINGS'}</span>`;
  close.textContent = 'RESUME';
  close.setAttribute('aria-label', 'Resume match');
  leave.textContent = 'QUIT TO MAIN MENU';
  const body = document.createElement('div');
  body.className = 'pause-body';
  const tabs = document.createElement('div');
  tabs.className = 'pause-tabs';
  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label', 'Settings categories');
  tabs.setAttribute('aria-orientation', 'vertical');
  const content = document.createElement('div');
  content.className = 'pause-content';
  mountPauseBindings(help);
  const video = createPauseVideo(shadows, applyResolution);
  const definitions = [
    { id: 'audio', title: 'Audio', description: 'Volume mix', nodes: [audio] },
    { id: 'video', title: 'Video', description: 'Display settings', nodes: [video] },
    { id: 'controls', title: 'Controls', description: 'Key bindings', nodes: [help] },
  ];
  const buttons: HTMLButtonElement[] = [];
  const panels: HTMLElement[] = [];
  const select = (index: number) => {
    buttons.forEach((button, i) => {
      button.setAttribute('aria-selected', String(i === index));
      button.tabIndex = i === index ? 0 : -1;
      panels[i].hidden = i !== index;
    });
  };
  definitions.forEach((definition, index) => {
    const button = document.createElement('button');
    button.type = 'button'; button.id = `pause-tab-${definition.id}`;
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-controls', `pause-panel-${definition.id}`);
    button.innerHTML = `<span class="pause-tab-index">0${index + 1}</span><span><b>${definition.title}</b><small>${definition.description}</small></span>`;
    button.addEventListener('click', () => select(index));
    button.addEventListener('keydown', event => {
      const next = event.key === 'ArrowDown' ? (index + 1) % definitions.length
        : event.key === 'ArrowUp' ? (index + definitions.length - 1) % definitions.length
        : event.key === 'Home' ? 0 : event.key === 'End' ? definitions.length - 1 : -1;
      if (next < 0) return;
      event.preventDefault(); event.stopPropagation(); select(next); buttons[next].focus();
    });
    const panel = document.createElement('section');
    panel.id = `pause-panel-${definition.id}`;
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', button.id);
    const heading = document.createElement('h3'); heading.textContent = definition.description;
    panel.append(heading, ...definition.nodes);
    buttons.push(button); panels.push(panel); tabs.append(button); content.append(panel);
  });
  select(0);
  body.append(tabs, content);
  const footer = document.createElement('footer'); footer.className = 'pause-footer';
  const exit = document.createElement('div'); exit.className = 'pause-exit'; exit.append(leave);
  footer.append(exit, close);
  menu.replaceChildren(header, body, footer);
  // Escape is handled by match input. Keep Tab navigation within the visible panel.
  menu.addEventListener('keydown', event => {
    if (event.key !== 'Tab') return;
    const items = Array.from(menu.querySelectorAll<HTMLElement>('button, select, summary, [tabindex="0"]'))
      .filter(el => el.getClientRects().length && !el.matches(':disabled') && el.tabIndex >= 0);
    const first = items[0], last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    event.stopPropagation();
  });
}

