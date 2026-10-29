// Guest-side smoothing: hold a short buffer of host snapshots and draw the world a little in the past,
// blending between the two snapshots around that moment.
import type { EntityState, PlayerState, Snapshot } from './protocol';

export interface Sample { from: Snapshot; to: Snapshot; alpha: number }

export class SnapshotBuffer {
  private readonly items: Snapshot[] = [];
  /** host time minus local time, smoothed */
  private offset: number | null = null;

  /** delay: seconds behind the host we render (about two snapshot intervals at 20 Hz) */
  readonly delay: number;
  readonly capacity: number;
  constructor(delay = .1, capacity = 32) { this.delay = delay; this.capacity = capacity; }

  get latest(): Snapshot | undefined { return this.items[this.items.length - 1]; }

  /** Returns false for a stale or duplicate snapshot. */
  push(snapshot: Snapshot, localNow: number): boolean {
    const latest = this.latest;
    if (latest && snapshot.tick <= latest.tick) return false;
    this.items.push(snapshot);
    if (this.items.length > this.capacity) this.items.shift();
    const estimate = snapshot.time - localNow;
    // Ease toward jitter; jump on a real clock change (hitch, tab sleep).
    this.offset = this.offset === null || Math.abs(estimate - this.offset) > .5 ? estimate : this.offset + (estimate - this.offset) * .1;
    return true;
  }

  renderTime(localNow: number): number | null { return this.offset === null ? null : localNow + this.offset - this.delay; }

  /** The two snapshots around render time; clamps to the newest when the buffer runs dry (no extrapolation). */
  sample(localNow: number): Sample | null {
    const time = this.renderTime(localNow);
    if (time === null || !this.items.length) return null;
    const items = this.items;
    if (time <= items[0].time) return { from: items[0], to: items[0], alpha: 0 };
    for (let i = items.length - 1; i > 0; i--) {
      const from = items[i - 1], to = items[i];
      if (time >= from.time && time <= to.time) return { from, to, alpha: to.time > from.time ? (time - from.time) / (to.time - from.time) : 1 };
    }
    const newest = items[items.length - 1];
    return { from: newest, to: newest, alpha: 1 };
  }
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerpAngle = (a: number, b: number, t: number) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;

function blend<T extends EntityState>(from: readonly T[], to: readonly T[], alpha: number, key: (item: T) => number): T[] {
  const before = new Map(from.map(item => [key(item), item]));
  // Newcomers appear where they are; anything gone from `to` is gone (deaths arrive as events).
  return to.map(next => {
    const prev = before.get(key(next));
    return prev ? { ...next, x: lerp(prev.x, next.x, alpha), z: lerp(prev.z, next.z, alpha), yaw: lerpAngle(prev.yaw, next.yaw, alpha) } : next;
  });
}

export function interpolate({ from, to, alpha }: Sample): { players: PlayerState[]; entities: EntityState[] } {
  return {
    players: blend(from.players, to.players, alpha, p => p.slot),
    entities: blend(from.entities, to.entities, alpha, e => e.id),
  };
}
