import { loadControlSettings, type ControlAction, type ControlBinding } from '../frontend/settings/GameSettings';

export type Action = 'fire' | 'special' | 'burst' | 'reload' | 'dash' | 'talents' | 'pause' | 'menu';
const movement: Partial<Record<ControlAction, readonly [number, number]>> = {
  moveUp: [0, 1], moveDown: [0, -1], moveLeft: [-1, 0], moveRight: [1, 0],
};
const mouseButtons = ['LEFT', 'MIDDLE', 'RIGHT', 'BACK', 'FORWARD'] as const;
export interface InputSource {
  move(): [number, number];
  isHeld(action: Action): boolean;
  wasPressed(action: Action): boolean;
  wasReleased(action: Action): boolean;
}
export class SurvivorInput implements InputSource {
  readonly pointer = { x: 0, y: 0, inside: false };
  private settings = loadControlSettings();
  private readonly moving = new Set<ControlAction>();
  private readonly held = new Set<Action>();
  private readonly pressed = new Set<Action>();
  private readonly released = new Set<Action>();
  enabled = true;
  constructor(canvas: HTMLCanvasElement) {
    window.addEventListener('sov:controls-changed', () => { this.clear(); this.settings = loadControlSettings(); });
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    canvas.addEventListener('pointermove', e => { this.pointer.x = e.offsetX; this.pointer.y = e.offsetY; this.pointer.inside = true; });
    canvas.addEventListener('pointerleave', () => { this.pointer.inside = false; });
    canvas.addEventListener('pointerdown', e => {
      this.pointer.x = e.offsetX; this.pointer.y = e.offsetY; canvas.focus({ preventScroll: true });
      this.dispatch(binding => binding.device === 'mouse' && binding.button === mouseButtons[e.button], true);
    });
    window.addEventListener('pointerup', e => this.dispatch(binding => binding.device === 'mouse' && binding.button === mouseButtons[e.button], false));
    // Mouse-bound Pause or Menu also resumes when the pointer is over the menu.
    window.addEventListener('pointerdown', e => {
      if (this.enabled || e.target === canvas || (e.target instanceof HTMLElement && e.target.closest('button,select'))) return;
      for (const action of ['pause', 'menu'] as const) {
        const binding = this.settings.bindings[action];
        if (binding.device === 'mouse' && binding.button === mouseButtons[e.button]) this.down(action);
      }
    });
    canvas.addEventListener('wheel', e => {
      const matches = (binding: ControlBinding) => binding.device === 'mouse' && binding.button === (e.deltaY < 0 ? 'WHEEL UP' : 'WHEEL DOWN');
      this.dispatch(matches, true); this.dispatch(matches, false);
    }, { passive: true });
    window.addEventListener('keydown', e => {
      const bound = (action: 'pause' | 'menu') => { const binding = this.settings.bindings[action]; return binding.device === 'keyboard' && binding.keyCode === e.keyCode; };
      const menu = e.code === 'Escape' || bound('menu');
      // Pause still works from a focused button (Space must not click it), but not while typing.
      const field = e.target instanceof HTMLElement && e.target.closest('select,input,textarea,[role="slider"]');
      const control = e.target instanceof HTMLElement && e.target.closest('button');
      if (!menu && (field || (control && !bound('pause')))) return;
      if (e.repeat) { if (bound('pause')) e.preventDefault(); return; }
      if (e.code === 'Escape') { e.preventDefault(); this.down('menu'); return; }
      if (this.dispatch(binding => binding.device === 'keyboard' && binding.keyCode === e.keyCode, true)) e.preventDefault();
    });
    window.addEventListener('keyup', e => this.dispatch(binding => binding.device === 'keyboard' && binding.keyCode === e.keyCode, false));
    window.addEventListener('blur', () => this.clear());
  }
  private dispatch(matches: (binding: ControlBinding) => boolean, down: boolean): boolean {
    let matched = false;
    for (const [id, binding] of Object.entries(this.settings.bindings)) {
      if (!matches(binding)) continue;
      matched = true;
      const action = id as ControlAction;
      if (movement[action]) { if (down && this.enabled) this.moving.add(action); else this.moving.delete(action); }
      else { const mapped = action === 'specialAttack' ? 'special' : action as Action; if (down) this.down(mapped); else this.up(mapped); }
    }
    return matched;
  }
  move(): [number, number] {
    if (!this.enabled) return [0, 0];
    let x = 0, z = 0;
    for (const action of this.moving) { const direction = movement[action]!; x += direction[0]; z += direction[1]; }
    const length = Math.hypot(x, z); return length > 0 ? [x / length, z / length] : [0, 0];
  }
  isHeld(action: Action): boolean { return this.enabled && this.held.has(action); }
  trigger(action: Action): void { if (this.enabled) this.pressed.add(action); }
  wasPressed(action: Action): boolean { return this.pressed.delete(action) && (this.enabled || action === 'pause' || action === 'menu' || action === 'talents'); }
  wasReleased(action: Action): boolean { return this.released.delete(action); }
  endFrame(): void { this.pressed.clear(); this.released.clear(); }
  clear(): void { this.moving.clear(); this.held.clear(); this.pressed.clear(); this.released.clear(); }
  private down(action: Action): void { if (!this.enabled && action !== 'pause' && action !== 'menu' && action !== 'talents') return; this.held.add(action); this.pressed.add(action); }
  private up(action: Action): void { if (this.held.delete(action)) this.released.add(action); }
}
