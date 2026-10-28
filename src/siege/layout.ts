/** Metres. +X faces the enemy; +Z is the top lane. All friendly defenses are x <= 0. */
export interface Point { x: number; z: number }
export interface Corridor { a: Point; b: Point; width: number }
// Scale distances between destinations, NOT character sizes, movement, or weapon ranges.
export const MAP_SCALE = 3;
export const LANES = [72, 0, -72] as const;
export const ARK = { x: -174, z: 0 };
export const BOUNDS = { left: -204, right: 204, bottom: -114, top: 114 };
export const MAP_WIDTH = BOUNDS.right-BOUNDS.left;
export const MAP_DEPTH = BOUNDS.top-BOUNDS.bottom;
export const LANE_WIDTH = 18;
export const FALLBACK_X = -90;
export const FINAL_X = -138;
export const JUNCTION_X = -132;
export const SPAWN_X = 186;
export const lanePath = (lane: number): Point[] => [ARK, { x: JUNCTION_X, z: 0 }, { x: -96, z: LANES[lane] }, { x: 0, z: LANES[lane] }, { x: SPAWN_X, z: LANES[lane] }];
export const corridors: Corridor[] = LANES.flatMap((_, lane) => {
  const p = lanePath(lane);
  return p.slice(1).map((b, i) => ({ a: p[i], b, width: LANE_WIDTH }));
});
for (const x of [-90, -30, 54, 129]) corridors.push({ a: { x, z: -72 }, b: { x, z: 72 }, width: 9 });
// Side clearings are connected to existing cross-lane routes, never stranded in scenery.
export const OBJECTIVE_SITES = [{ x: 54, z: 36 }, { x: 129, z: -36 }, { x: 153, z: 72 }];
export function segmentDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x-a.x, dz = b.z-a.z;
  const t = Math.max(0, Math.min(1, ((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz || 1)));
  return Math.hypot(p.x-a.x-dx*t,p.z-a.z-dz*t);
}
export const distance = (a: Point,b: Point) => Math.hypot(a.x-b.x,a.z-b.z);
export function walkable(p: Point, radius = .65): boolean {
  if(p.x < BOUNDS.left+9+radius || p.x > BOUNDS.right-9-radius || Math.abs(p.z)>BOUNDS.top-12-radius) return false;
  if(distance(p,ARK)<12-radius) return true;
  return corridors.some(c=>segmentDistance(p,c.a,c.b)<=c.width/2-radius)
    || OBJECTIVE_SITES.some(s=>distance(p,s)<8-radius);
}
export function move(p: Point, dx: number, dz: number, clear: (p: Point)=>boolean = ()=>true): void {
  // Axis sliding, sub-stepped so sprint/delta spikes cannot tunnel across islands.
  const steps = Math.max(1, Math.ceil(Math.hypot(dx,dz)/.25));
  for(let i=0;i<steps;i++) {
    const px={x:p.x+dx/steps,z:p.z};if(walkable(px)&&clear(px))p.x=px.x;
    const pz={x:p.x,z:p.z+dz/steps};if(walkable(pz)&&clear(pz))p.z=pz.z;
  }
}
export function pointOnPath(path: Point[], d: number): Point {
  for(let i=1;i<path.length;i++) {
    const length=distance(path[i-1],path[i]);
    if(d<=length) {const t=Math.max(0,d/length);return {x:path[i-1].x+(path[i].x-path[i-1].x)*t,z:path[i-1].z+(path[i].z-path[i-1].z)*t};}
    d-=length;
  }
  return {...path[path.length-1]};
}
