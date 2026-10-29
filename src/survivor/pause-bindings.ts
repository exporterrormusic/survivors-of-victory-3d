import { CONTROL_BINDING_DEFINITIONS, controlBindingsEqual, formatControlBinding, loadControlSettings, resetControlSettings, saveControlSettings, type ControlAction, type ControlBinding } from '../frontend/settings/GameSettings';

export function mountPauseBindings(root: HTMLElement): void {
  let capturing: ControlAction | null = null;
  let suppressClick = false;
  let settings = loadControlSettings();
  const buttons = new Map<ControlAction, HTMLButtonElement>();
  const grid = document.createElement('div'); grid.className = 'pause-binding-grid';
  const status = document.createElement('span'); status.setAttribute('role', 'status');
  const render = () => {
    for (const [action, button] of buttons) {
      button.textContent = action === capturing ? 'Press a key…' : formatControlBinding(settings.bindings[action]);
      button.classList.toggle('capturing', action === capturing);
    }
    status.textContent = capturing ? 'Press a key or mouse button. Esc cancels.' : 'Mouse: aim · Wheel: zoom';
  };
  for (const { action, label } of CONTROL_BINDING_DEFINITIONS) {
    const row = document.createElement('div');
    const name = document.createElement('span'); name.textContent = label;
    const button = document.createElement('button'); button.type = 'button'; button.setAttribute('aria-label', `Rebind ${label.toLowerCase()}`);
    button.addEventListener('click', () => { capturing = action; render(); });
    buttons.set(action, button); row.append(name, button); grid.append(row);
  }
  const reset = document.createElement('button'); reset.type = 'button'; reset.textContent = 'RESET TO DEFAULT';
  reset.addEventListener('click', () => { capturing = null; settings = resetControlSettings(); render(); });
  const footer = document.createElement('div'); footer.className = 'pause-binding-footer'; footer.append(reset, status);
  root.replaceChildren(grid, footer);
  const apply = (binding: ControlBinding) => {
    if (!capturing) return;
    const previous = settings.bindings[capturing];
    for (const { action } of CONTROL_BINDING_DEFINITIONS) {
      if (action !== capturing && controlBindingsEqual(settings.bindings[action], binding)) settings.bindings[action] = previous;
    }
    settings.bindings[capturing] = binding; capturing = null;
    saveControlSettings(settings); render();
  };
  const active = () => capturing && root.getClientRects().length;
  window.addEventListener('keydown', event => {
    if (!active()) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (event.key === 'Escape' && capturing !== 'menu') { capturing = null; render(); return; }
    if (event.repeat || event.ctrlKey || event.altKey || event.metaKey) return;
    apply({ device: 'keyboard', keyCode: event.keyCode });
  }, true);
  window.addEventListener('pointerdown', event => {
    if (!active()) return;
    event.preventDefault(); event.stopImmediatePropagation();
    const button = (['LEFT', 'MIDDLE', 'RIGHT', 'BACK', 'FORWARD'] as const)[event.button];
    suppressClick = event.button === 0;
    if (button) apply({ device: 'mouse', button });
  }, true);
  // Avoid a completed mouse capture clicking a second binding or Resume.
  window.addEventListener('click', event => {
    if (!suppressClick) return;
    suppressClick = false; event.preventDefault(); event.stopImmediatePropagation();
  }, true);
  root.addEventListener('contextmenu', event => event.preventDefault());
  window.addEventListener('wheel', event => {
    if (!active()) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (capturing?.startsWith('move') || event.deltaY === 0) return;
    apply({ device: 'mouse', button: event.deltaY < 0 ? 'WHEEL UP' : 'WHEEL DOWN' });
  }, { capture: true, passive: false });
  window.addEventListener('sov:controls-changed', () => { settings = loadControlSettings(); render(); });
  render();
}
