// Exits (GAME_PLAN §2): the arrival lift is always a working exit; dormant lift towers become
// exits once restored. Boarding means holding the platform while the gates cycle shut. Stepping
// off pauses the cycle; it doesn't reset.

export const GATE_CYCLE = 8;

export interface ExitInit {
  readonly id: string;
  readonly kind: 'arrival' | 'shaft';
  readonly x: number;
  readonly z: number;
  readonly active?: boolean;
}

export class Exit {
  readonly id: string;
  readonly kind: 'arrival' | 'shaft';
  readonly x: number;
  readonly z: number;
  /** stand within this of the centre to hold the platform */
  readonly platformRadius = 2.8;
  active: boolean;
  /** seconds of gate cycle done */
  boarding = 0;
  onPlatform = false;
  /** The arrival lift starts armed only once the player has stepped off it, so arriving isn't leaving. */
  armed: boolean;

  constructor(init: ExitInit) {
    this.id = init.id;
    this.kind = init.kind;
    this.x = init.x;
    this.z = init.z;
    this.active = init.active ?? init.kind === 'arrival';
    this.armed = init.kind !== 'arrival';
  }

  get gatesRemaining(): number { return Math.max(0, GATE_CYCLE - this.boarding); }

  distanceTo(x: number, z: number): number { return Math.hypot(x - this.x, z - this.z); }
}

export class ExitSet {
  readonly exits: Exit[];

  constructor(exits: readonly ExitInit[]) {
    this.exits = exits.map((e) => new Exit(e));
  }

  get(id: string): Exit | undefined { return this.exits.find((e) => e.id === id); }

  activate(id: string): Exit | undefined {
    const exit = this.get(id);
    if (exit) exit.active = true;
    return exit;
  }

  nearestActive(x: number, z: number): { exit: Exit; distance: number } | null {
    let best: { exit: Exit; distance: number } | null = null;
    for (const exit of this.exits) {
      if (!exit.active) continue;
      const distance = exit.distanceTo(x, z);
      if (!best || distance < best.distance) best = { exit, distance };
    }
    return best;
  }

  /** Advance boarding; returns the exit whose gates closed this frame (the player is out). */
  update(dt: number, x: number, z: number, canBoard = true): Exit | null {
    for (const exit of this.exits) {
      const distance = exit.distanceTo(x, z);
      if (!exit.armed && distance > exit.platformRadius + 1) exit.armed = true;
      exit.onPlatform = canBoard && exit.active && exit.armed && distance <= exit.platformRadius;
      if (!exit.onPlatform || dt <= 0) continue;
      exit.boarding = Math.min(GATE_CYCLE, exit.boarding + dt);
      if (exit.boarding >= GATE_CYCLE) return exit;
    }
    return null;
  }

  /** The exit whose platform the player is holding, if any. */
  get boardingExit(): Exit | null { return this.exits.find((e) => e.onPlatform) ?? null; }
}
