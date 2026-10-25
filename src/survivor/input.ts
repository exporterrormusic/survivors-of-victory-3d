// Survivors of Victory controls: WASD move, mouse aim, LMB weapon, RMB Special, E Burst,
// R reload, Shift dash, Tab talents, Esc pause. Presses are latched until the next frame reads them,
// so a click shorter than a frame still fires.

export type Action = 'fire' | 'special' | 'burst' | 'reload' | 'dash' | 'talents' | 'pause';

const KEYS: Readonly<Record<string, Action>> = {
  KeyE: 'burst', KeyR: 'reload', ShiftLeft: 'dash', ShiftRight: 'dash', Tab: 'talents', Escape: 'pause',
};
const MOVE: Readonly<Record<string, readonly [number, number]>> = {
  KeyW: [0, 1], KeyS: [0, -1], KeyA: [-1, 0], KeyD: [1, 0],
  ArrowUp: [0, 1], ArrowDown: [0, -1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
};

export class SurvivorInput {
  /** cursor in canvas CSS pixels */
  readonly pointer = { x: 0, y: 0, inside: false };
  private readonly keys = new Set<string>();
  private readonly held = new Set<Action>();
  private readonly pressed = new Set<Action>();
  private readonly released = new Set<Action>();
  /** while false (menus open), presses are ignored and held state clears */
  enabled = true;

  constructor(canvas: HTMLCanvasElement) {
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('pointermove', (e) => {
      this.pointer.x = e.offsetX;
      this.pointer.y = e.offsetY;
      this.pointer.inside = true;
    });
    canvas.addEventListener('pointerleave', () => { this.pointer.inside = false; });
    canvas.addEventListener('pointerdown', (e) => {
      this.pointer.x = e.offsetX;
      this.pointer.y = e.offsetY;
      canvas.focus({ preventScroll: true });
      if (e.button === 0) this.down('fire');
      if (e.button === 2) this.down('special');
    });
    window.addEventListener('pointerup', (e) => {
      if (e.button === 0) this.up('fire');
      if (e.button === 2) this.up('special');
    });
    window.addEventListener('keydown', (e) => {
      if (e.code !== 'Escape' && e.code !== 'Tab' && e.target instanceof HTMLElement && e.target.closest('button, select, input, textarea, [role="slider"]')) return;
      const action = KEYS[e.code];
      if (MOVE[e.code] || action) e.preventDefault();
      if (e.repeat) return;
      if (this.enabled && MOVE[e.code]) this.keys.add(e.code);
      if (action) this.down(action);
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      const action = KEYS[e.code];
      if (action) this.up(action);
    });
    window.addEventListener('blur', () => this.clear());
  }

  /** Normalised WASD direction on the ground (screen up = world +Z). */
  move(): [number, number] {
    if (!this.enabled) return [0, 0];
    let x = 0, z = 0;
    for (const code of this.keys) { x += MOVE[code][0]; z += MOVE[code][1]; }
    const l = Math.hypot(x, z);
    return l > 0 ? [x / l, z / l] : [0, 0];
  }

  isHeld(action: Action): boolean { return this.enabled && this.held.has(action); }
  /** A HUD click follows the same queued action path as a key or mouse press. */
  trigger(action: Action): void { if (this.enabled) this.pressed.add(action); }
  /** True once per press. */
  wasPressed(action: Action): boolean { return this.pressed.delete(action) && (this.enabled || action === 'pause' || action === 'talents'); }
  wasReleased(action: Action): boolean { return this.released.delete(action); }

  /** Drop presses nobody read this frame (call at the end of each frame). */
  endFrame(): void {
    this.pressed.clear();
    this.released.clear();
  }

  clear(): void {
    this.keys.clear();
    this.held.clear();
    this.pressed.clear();
    this.released.clear();
  }

  private down(action: Action): void {
    if (!this.enabled && action !== 'pause' && action !== 'talents') return;
    this.held.add(action);
    this.pressed.add(action);
  }

  private up(action: Action): void {
    if (this.held.delete(action)) this.released.add(action);
  }
}
