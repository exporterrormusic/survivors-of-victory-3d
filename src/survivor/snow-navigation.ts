import { NavigationMap, type GroundPoint } from '../navigation';
import { traceScenery, type SceneryObstacle } from './range-collision';
import type { SnowField } from './snow-field';
import type { StormField } from './storm-field';
import type { FrozenLake } from './frozen-lake';

/** Arena navigation and crowd steering. Snow affects speed, never walkability. */
export class SnowNavigationMap extends NavigationMap {
  storm?:StormField;
  lake?:FrozenLake;
  /** Short-lived danger zones every unit flees and will not step into (falling meteors, burning craters). */
  dangers:{x:number;z:number;r:number}[]=[];
  override setExtent(radius:number):void {if(this.extent===radius)return;super.setExtent(radius);this.version++;}
  readonly snow: SnowField | undefined;
  version = 0;
  setScenery(obstacles:readonly SceneryObstacle[]):void {
    const current=this.obstacles as SceneryObstacle[];
    current.splice(0,current.length,...obstacles);this.invalidate();this.version++;
  }
  traceCover(from:{x:number;y:number;z:number},to:{x:number;y:number;z:number},radius=0):number|null {
    const prop=traceScenery(this.obstacles as SceneryObstacle[],from,to,radius);
    const snow=this.snow?.traceSegment(from,to,radius)??null;
    return prop===null?snow:snow===null?prop:Math.min(prop,snow);
  }
  private terrainVersion = -1;
  private snowEnabled = false;

  constructor(snow: SnowField | undefined, radius: number) {
    super([], radius);
    this.snow = snow;
  }

  override beginFrame(searches = 2): void {
    const revision = this.snow?.terrainRevision ?? 0, enabled = this.snow?.enabled ?? false;
    if (revision !== this.terrainVersion || enabled !== this.snowEnabled) {
      this.terrainVersion = revision; this.snowEnabled = enabled;
      this.invalidate(); this.version++;
    }
    super.beginFrame(searches);
  }

  override clear(from: GroundPoint, to: GroundPoint, radius: number): boolean {
    if (!super.clear(from, to, radius)) return false;
    const safeRadius = radius + .12, edge = this.extent - safeRadius;
    if (Math.hypot(from.x, from.z) > edge || Math.hypot(to.x, to.z) > edge) return false;
    return true;
  }

  /** Knockback respects arena clearance while passing through snow banks. */
  push(position: GroundPoint, dx: number, dz: number, radius: number): void {
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / .1));
    for (let i=0;i<steps;i++) {
      const next=this.slide(position,dx/steps,dz/steps,radius);
      position.x=next.x;position.z=next.z;
    }
  }
}
