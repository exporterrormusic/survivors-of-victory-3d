// Searchable sites (GAME_PLAN §3). No button: standing inside a site's ring works it while you
// keep fighting. Stepping out pauses progress; it never resets.

export type SiteKind = 'cache' | 'priority' | 'wreck' | 'shaft' | 'terminal' | 'scrambler' | 'med' | 'module';

export interface SiteKindSpec {
  readonly label: string;
  /** ring radius, metres */
  readonly radius: number;
  /** seconds inside the ring to finish */
  readonly work: number;
}

export const SITE_KINDS: Readonly<Record<SiteKind, SiteKindSpec>> = {
  cache: { label: 'Supply cache', radius: 3, work: 1.5 },
  priority: { label: 'Priority crate', radius: 3, work: 4 },
  wreck: { label: 'Wreck', radius: 3.5, work: 6 },
  shaft: { label: 'Lift tower', radius: 4, work: 8 },
  terminal: { label: 'Data terminal', radius: 3, work: 8 },
  scrambler: { label: 'Signal scrambler', radius: 3, work: 5 },
  med: { label: 'Med station', radius: 2.5, work: 2 },
  module: { label: 'Module case', radius: 3, work: 3 },
};

export interface SiteInit {
  readonly id: string;
  readonly kind: SiteKind;
  readonly x: number;
  readonly z: number;
}

export class Site {
  readonly id: string;
  readonly kind: SiteKind;
  readonly x: number;
  readonly z: number;
  readonly radius: number;
  readonly work: number;
  /** seconds of work done */
  progress = 0;
  done = false;
  /** the player is inside the ring this frame */
  occupied = false;

  constructor(init: SiteInit) {
    this.id = init.id;
    this.kind = init.kind;
    this.x = init.x;
    this.z = init.z;
    this.radius = SITE_KINDS[init.kind].radius;
    this.work = SITE_KINDS[init.kind].work;
  }

  get fraction(): number { return this.done ? 1 : this.progress / this.work; }

  contains(x: number, z: number): boolean {
    return Math.hypot(x - this.x, z - this.z) <= this.radius;
  }

  /** Work the site if the player stands in it; returns true on the frame it completes. */
  update(dt: number, x: number, z: number): boolean {
    this.occupied = !this.done && this.contains(x, z);
    if (!this.occupied || dt <= 0) return false;
    this.progress = Math.min(this.work, this.progress + dt);
    if (this.progress >= this.work) {
      this.done = true;
      this.occupied = false;
      return true;
    }
    return false;
  }
}

export class SiteSet {
  readonly sites: Site[];

  constructor(sites: readonly SiteInit[]) {
    this.sites = sites.map((s) => new Site(s));
  }

  get(id: string): Site | undefined { return this.sites.find((s) => s.id === id); }

  /** Sites completed this frame. Only one site is worked at a time: the nearest occupied one. */
  update(dt: number, x: number, z: number): Site[] {
    let working: Site | null = null, best = Infinity;
    for (const site of this.sites) {
      if (site.done || !site.contains(x, z)) continue;
      const d = Math.hypot(x - site.x, z - site.z);
      if (d < best) { best = d; working = site; }
    }
    const completed: Site[] = [];
    for (const site of this.sites) {
      if (site === working) { if (site.update(dt, x, z)) completed.push(site); }
      else site.occupied = false;
    }
    return completed;
  }

  /** The site being worked right now, if any. */
  get active(): Site | null { return this.sites.find((s) => s.occupied) ?? null; }
}
