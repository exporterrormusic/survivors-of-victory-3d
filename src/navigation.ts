// Ground navigation is independent of rendering. Routes use the same circular
// cover as collision, expanded by the moving unit's radius and a small margin.
export interface GroundPoint { x: number; z: number }
export interface GroundObstacle extends GroundPoint { r: number; active?: boolean }
export interface NavigationBody { position: GroundPoint; radius: number; alive: boolean }

const MARGIN = .12;
const NEIGHBORS = [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, 1], [-1, -1], [1, -1]];
const distance = (a: GroundPoint, b: GroundPoint) => Math.hypot(a.x - b.x, a.z - b.z);
export function insideBoundary(p: GroundPoint, boundary: readonly GroundPoint[]): boolean {
  let inside=false;
  for(let i=0,j=boundary.length-1;i<boundary.length;j=i++) {
    const a=boundary[i],b=boundary[j];
    if((a.z>p.z)!==(b.z>p.z) && p.x<(b.x-a.x)*(p.z-a.z)/(b.z-a.z)+a.x)inside=!inside;
  }
  return inside;
}
const segmentDistanceSq=(p:GroundPoint,a:GroundPoint,b:GroundPoint):number=>{
  const dx=b.x-a.x,dz=b.z-a.z,len=dx*dx+dz*dz;
  const t=len?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/len)):0;
  return (p.x-a.x-dx*t)**2+(p.z-a.z-dz*t)**2;
};

class MinHeap {
  private entries: { id: number; score: number }[] = [];
  get length(): number { return this.entries.length; }
  push(id: number, score: number): void {
    const entry = { id, score }, a = this.entries;
    let i = a.length;
    a.push(entry);
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (a[parent].score <= score) break;
      a[i] = a[parent]; i = parent;
    }
    a[i] = entry;
  }
  pop(): number {
    const a = this.entries, result = a[0].id, last = a.pop()!;
    if (a.length) {
      let i = 0;
      while (i * 2 + 1 < a.length) {
        let child = i * 2 + 1;
        if (child + 1 < a.length && a[child + 1].score < a[child].score) child++;
        if (a[child].score >= last.score) break;
        a[i] = a[child]; i = child;
      }
      a[i] = last;
    }
    return result;
  }
}

export class NavigationMap {
  readonly obstacles: readonly GroundObstacle[];
  extent: number;
  private readonly boundary: readonly GroundPoint[];
  private width: number;
  private readonly cellSize: number;
  private grids = new Map<number, { free: Uint8Array; edges: Uint8Array }>();
  private routeBudget = Infinity;

  /** The game budgets expensive searches; isolated navigation tests are unbudgeted. */
  beginFrame(searches = 2): void { this.routeBudget = searches; }
  /** Extra searches this frame for a group that updates after the crowd (the supply squad). */
  grantSearches(searches: number): void { this.routeBudget += searches; }
  prepare(radii: readonly number[]): void { for (const radius of radii) this.grid(radius); }
  requestRoute(from: GroundPoint, to: GroundPoint, radius: number): GroundPoint[] | null {
    if (this.clear(from, to, radius)) return [{ x: to.x, z: to.z }];
    if (this.routeBudget <= 0) return null;
    this.routeBudget--;
    return this.route(from, to, radius);
  }

  constructor(obstacles: readonly GroundObstacle[], extent: number, boundary: readonly GroundPoint[] = []) {
    this.obstacles = obstacles;
    this.extent = extent;
    this.boundary = boundary;
    this.cellSize = extent>90?1.5:1;
    this.width = Math.floor(extent * 2 / this.cellSize) + 1;
  }

  setExtent(extent: number): void {
    this.extent=extent;this.width=Math.floor(extent*2/this.cellSize)+1;this.invalidate();
  }

  /** Gates change walkability for the attacking side when destroyed. */
  invalidate(): void { this.grids.clear(); }

  clear(from: GroundPoint, to: GroundPoint, radius: number): boolean {
    const edge = this.extent - radius - MARGIN;
    if (Math.abs(from.x) > edge || Math.abs(from.z) > edge || Math.abs(to.x) > edge || Math.abs(to.z) > edge) return false;
    const dx = to.x - from.x, dz = to.z - from.z, lengthSq = dx * dx + dz * dz;
    if(this.boundary.length) {
      if(!insideBoundary(from,this.boundary)||!insideBoundary(to,this.boundary))return false;
      const r2=(radius+MARGIN)**2;
      for(let i=0;i<this.boundary.length;i++) {
        const a=this.boundary[i],b=this.boundary[(i+1)%this.boundary.length];
        if(Math.min(segmentDistanceSq(from,a,b),segmentDistanceSq(to,a,b),segmentDistanceSq(a,from,to),segmentDistanceSq(b,from,to))<r2)return false;
        const ex=b.x-a.x,ez=b.z-a.z,den=dx*ez-dz*ex;
        if(Math.abs(den)>1e-8) {
          const ax=a.x-from.x,az=a.z-from.z,t=(ax*ez-az*ex)/den,u=(ax*dz-az*dx)/den;
          if(t>=0&&t<=1&&u>=0&&u<=1)return false;
        }
      }
    }
    for (const o of this.obstacles) {
      if(o.active===false)continue;
      const t = lengthSq ? Math.max(0, Math.min(1, ((o.x - from.x) * dx + (o.z - from.z) * dz) / lengthSq)) : 0;
      const ox = from.x + dx * t - o.x, oz = from.z + dz * t - o.z, r = o.r + radius + MARGIN - 1e-6;
      if (ox * ox + oz * oz < r * r) return false;
    }
    return true;
  }

  /** Surface-normal sliding with a small contact cushion, never an unchecked push.
   * Uses the actual obstacle normals rather than world-axis X/Z fallback. */
  slide(from:GroundPoint,dx:number,dz:number,radius:number):GroundPoint {
    const travel=Math.hypot(dx,dz);
    if(travel<1e-9)return {x:from.x,z:from.z};
    let sx=dx,sz=dz;
    for(let pass=0;pass<3;pass++)for(const o of this.obstacles){
      if(o.active===false)continue;
      const ox=from.x-o.x,oz=from.z-o.z,d=Math.hypot(ox,oz);
      const gap=d-o.r-radius-MARGIN;
      if(d<1e-8||gap>travel+.10)continue;
      const nx=ox/d,nz=oz/d,inward=sx*nx+sz*nz;
      // Leave the inward component that can safely reach contact this step.
      const allowed=Math.max(0,gap-.025);
      if(inward < -allowed){sx-=nx*(inward+allowed);sz-=nz*(inward+allowed);}
      if(pass===0&&gap<.10){
        const cushion=Math.min(travel*.18,Math.max(0,.10-gap)*.25);
        sx+=nx*cushion;sz+=nz*cushion;
      }
    }
    const length=Math.hypot(sx,sz);
    if(length>travel){sx*=travel/length;sz*=travel/length;}
    // Back off continuously if two contacts or the arena boundary constrain motion.
    for(const scale of [1,.5,.25,.125]){
      const next={x:from.x+sx*scale,z:from.z+sz*scale};
      if(this.clear(from,next,radius))return next;
    }
    for(const [x,z] of [[dx,0],[0,dz]]){
      const next={x:from.x+x,z:from.z+z};
      if(this.clear(from,next,radius))return next;
    }
    return {x:from.x,z:from.z};
  }

  /** Correct overlap only; ordinary movement still sweeps the entire segment. */
  project(point: GroundPoint, radius: number): GroundPoint {
    const edge = this.extent - radius - MARGIN;
    const p = { x: Math.max(-edge, Math.min(edge, point.x)), z: Math.max(-edge, Math.min(edge, point.z)) };
    for (let pass = 0; pass < 12; pass++) {
      if (this.clear(p, p, radius)) return p;
      for (const o of this.obstacles) {
        if(o.active===false)continue;
        const dx = p.x - o.x, dz = p.z - o.z, d = Math.hypot(dx, dz), min = o.r + radius + MARGIN + .01;
        if (d < min) {
          p.x = Math.max(-edge, Math.min(edge, o.x + (d > 1e-6 ? dx / d : 1) * min));
          p.z = Math.max(-edge, Math.min(edge, o.z + (d > 1e-6 ? dz / d : 0) * min));
        }
      }
    }
    // Overlapping cover can trap iterative projection; find the nearest free cell.
    let best = Infinity, result = p;
    const grid = this.grid(radius);
    for (let id = 0; id < grid.free.length; id++) {
      if (!grid.free[id]) continue;
      const candidate = this.point(id), d = distance(point, candidate);
      if (d < best) { best = d; result = candidate; }
    }
    return result;
  }

  route(from: GroundPoint, destination: GroundPoint, radius: number): GroundPoint[] {
    const goal = this.project(destination, radius);
    if (this.clear(from, goal, radius)) return [goal];
    const grid = this.grid(radius), start = this.anchor(from, radius, grid.free), end = this.anchor(goal, radius, grid.free);
    if (start < 0 || end < 0) return [];
    const cost = new Float64Array(grid.free.length).fill(Infinity);
    const previous = new Int32Array(grid.free.length).fill(-1), closed = new Uint8Array(grid.free.length);
    const open = new MinHeap();
    cost[start] = 0; open.push(start, distance(this.point(start), goal));
    while (open.length) {
      const id = open.pop();
      if (closed[id]) continue;
      if (id === end) {
        const path: GroundPoint[] = [goal];
        for (let at = end; at !== -1; at = previous[at]) path.push(this.point(at));
        path.reverse();
        const smooth: GroundPoint[] = [];
        let origin = from, next = 0;
        while (next < path.length) {
          let far = path.length - 1;
          while (far > next && !this.clear(origin, path[far], radius)) far--;
          if (!this.clear(origin, path[far], radius)) return [];
          smooth.push(path[far]); origin = path[far]; next = far + 1;
        }
        return smooth;
      }
      closed[id] = 1;
      for (let n = 0; n < NEIGHBORS.length; n++) {
        if (!(grid.edges[id] & (1 << n))) continue;
        const [dx, dz] = NEIGHBORS[n], other = id + dx + dz * this.width;
        const candidate = cost[id] + (n < 4 ? 1 : Math.SQRT2)*this.cellSize;
        if (candidate >= cost[other]) continue;
        cost[other] = candidate; previous[other] = id;
        open.push(other, candidate + distance(this.point(other), this.point(end)));
      }
    }
    return []; // Unreachable destinations are retried at a bounded rate.
  }

  private point(id: number): GroundPoint { return { x: id % this.width*this.cellSize - this.extent, z: Math.floor(id / this.width)*this.cellSize - this.extent }; }
  private anchor(p: GroundPoint, radius: number, free: Uint8Array): number {
    const x = Math.round((p.x + this.extent)/this.cellSize), z = Math.round((p.z + this.extent)/this.cellSize);
    let best = Infinity, result = -1;
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
      const cx = x + dx, cz = z + dz;
      if (cx < 0 || cz < 0 || cx >= this.width || cz >= this.width) continue;
      const id = cx + cz * this.width, candidate = this.point(id), d = distance(p, candidate);
      if (free[id] && d < best && this.clear(p, candidate, radius)) { best = d; result = id; }
    }
    return result;
  }
  private grid(radius: number): { free: Uint8Array; edges: Uint8Array } {
    const cached = this.grids.get(radius);
    if (cached) return cached;
    const size = this.width * this.width, free = new Uint8Array(size), edges = new Uint8Array(size);
    for (let id = 0; id < size; id++) { const p = this.point(id); free[id] = +this.clear(p, p, radius); }
    for (let id = 0; id < size; id++) {
      if (!free[id]) continue;
      const p = this.point(id);
      NEIGHBORS.forEach(([dx, dz], n) => {
        const x = id % this.width + dx, z = Math.floor(id / this.width) + dz, other = x + z * this.width;
        if (x >= 0 && z >= 0 && x < this.width && z < this.width && free[other] && this.clear(p, this.point(other), radius)) edges[id] |= 1 << n;
      });
    }
    const grid = { free, edges }; this.grids.set(radius, grid); return grid;
  }
}

/** Per-unit route memory prevents left/right oscillation at obstacle edges. */
export class NavigationAgent {
  private route: GroundPoint[] = [];
  private goal: GroundPoint | null = null;
  private retry = 0;
  private checkpoint: GroundPoint | null = null;
  private progressTime = 0;
  private side = 1;
  private bypassTime = 0;
  private steeringTime = 0;
  private velocityX = 0;
  private velocityZ = 0;
  private readonly map: NavigationMap;
  private readonly radius: number;
  /**
   * Re-plan when the goal moves more than `distance`, at most every `delay` seconds. Crowds use the
   * slow defaults to spread searches; the player's hero re-plans almost at once for held-mouse steering.
   */
  private readonly repath: { readonly delay: number; readonly distance: number };
  constructor(map: NavigationMap, radius: number, repath = { delay: .75, distance: .8 }) {
    this.map = map; this.radius = radius; this.repath = repath;
  }

  waypoint(position: GroundPoint, target: GroundPoint, dt: number, blockers: readonly NavigationBody[] = []): GroundPoint | null {
    this.retry -= dt;
    this.bypassTime = Math.max(0, this.bypassTime - dt);
    this.progressTime += dt;
    if (!this.checkpoint) this.checkpoint = { x: position.x, z: position.z };
    if (this.progressTime >= .8) {
      if (distance(position, this.checkpoint) < .18 && distance(position, target) > .5) {
        this.route = []; this.retry = 0;
        if (this.bypassTime > 0) this.side *= -1;
        // Commit to a short lateral bypass instead of rebuilding a 14,641-cell
        // navigation grid per stalled unit. Static cover is still swept each step.
        if (blockers.some(b => b.alive && b.position !== position && distance(position, b.position) < 4)) this.bypassTime = 2;
      }
      this.checkpoint = { x: position.x, z: position.z }; this.progressTime = 0;
    }
    const changed = !this.goal || distance(this.goal, target) > this.repath.distance;
    const invalid = this.route.length > 0 && !this.map.clear(position, this.route[0], this.radius);
    if ((changed && this.retry <= 0) || (!this.route.length && this.retry <= 0) || invalid) {
      const route = this.map.requestRoute(position, target, this.radius);
      if (!route) { if (invalid) this.route = []; return this.route[0] ?? null; }
      this.route = route;
      this.steeringTime = 0;
      this.goal = { x: target.x, z: target.z }; this.retry = this.repath.delay;
    }
    // Skip waypoints only when the entire shortcut is safe for this unit's body.
    for (let i = this.route.length - 1; i > 0; i--) {
      if (this.map.clear(position, this.route[i], this.radius)) { this.route.splice(0, i); break; }
    }
    while (this.route.length && distance(position, this.route[0]) < .08) this.route.shift();
    return this.route[0] ?? null;
  }

  step(body: NavigationBody, target: GroundPoint, speed: number, dt: number, neighbors: readonly NavigationBody[]): boolean {
    if (dt <= 0 || speed <= 0) return false;
    const p = body.position;
    if (!this.map.clear(p, p, this.radius)) {
      const safe = this.map.project(p, this.radius); p.x = safe.x; p.z = safe.z;
    }
    const waypoint = this.waypoint(p, target, dt, neighbors);
    if (!waypoint) return false;
    const d = distance(p, waypoint), yaw = Math.atan2(waypoint.z - p.z, waypoint.x - p.x) + (this.bypassTime > 0 ? this.side * Math.PI / 2 : 0);
    const step = Math.min(d, speed * dt), look = Math.min(d, speed * .45);
    this.steeringTime -= dt;
    if (this.steeringTime > 0) {
      if (!this.velocityX && !this.velocityZ) return false;
      const next = this.map.slide(p,this.velocityX*step,this.velocityZ*step,this.radius);
      if (distance(p,next)>step*.15 && this.map.clear(p, next, this.radius)) { p.x = next.x; p.z = next.z; return true; }
    }
    // Steering decisions run at 10 Hz; movement and swept collision stay per-frame.
    this.steeringTime = .1; this.velocityX = 0; this.velocityZ = 0;
    const nearby = neighbors.filter(other => other !== body && other.alive && distance(p, other.position) < this.radius + other.radius + look + 1);
    let best = -Infinity, chosen: GroundPoint | null = null;
    for (const angle of [0, .4 * this.side, -.4 * this.side, .8 * this.side, -.8 * this.side, 1.2 * this.side, -1.2 * this.side, 1.6 * this.side, -1.6 * this.side, 2 * this.side, -2 * this.side]) {
      const dx = Math.cos(yaw + angle), dz = Math.sin(yaw + angle);
      const next = this.map.slide(p,dx*step,dz*step,this.radius);
      if (!this.map.clear(p, next, this.radius)) continue;
      let score = Math.cos(angle) * 2 - (angle * this.side < 0 ? .08 : 0);
      score -= 3 * (1 - distance(p,next)/Math.max(step,1e-9));
      for (const other of nearby) {
        const clearance = (this.radius + other.radius) * .85;
        const current = distance(p, other.position), after = distance(next, other.position);
        if (after < clearance && after < current - .001) score -= 8;
        const ahead = distance({ x: p.x + dx * look, z: p.z + dz * look }, other.position);
        score -= Math.max(0, clearance + .25 - ahead) * 2;
      }
      if (score > best) { best = score; chosen = next; }
    }
    if (!chosen || best < -2) return false; // Yield briefly instead of shoving through a crowd.
    if (step > 0) { this.velocityX = (chosen.x - p.x) / step; this.velocityZ = (chosen.z - p.z) / step; }
    p.x = chosen.x; p.z = chosen.z;
    return true;
  }
}
