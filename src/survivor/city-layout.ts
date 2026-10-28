/** Metres; one source of truth for models and navigation footprints. */
export const CITY_ASSETS = {
  'city-office': { width: 7, depth: 7, height: 2.5 },
  'city-tower': { width: 7, depth: 7, height: 2.7 },
  'city-shaft': { width: 5, depth: 5, height: 2.4 },
  'city-corner': { width: 7, depth: 7, height: 2.2 },
  'city-collapse': { width: 7, depth: 5, height: 2.1 },
  'city-rubble': { width: 3, depth: 3, height: 1.5 },
  'city-long-collapse': { width: 28, depth: 6, height: 4.2 },
} as const;
export type CityAsset = keyof typeof CITY_ASSETS;
export function isCityAsset(asset: string): asset is CityAsset { return Object.hasOwn(CITY_ASSETS, asset); }
export interface CityPlacement { asset: CityAsset; x: number; z: number; scale: number; yaw: number }
export function cityPlacements(): CityPlacement[] {
  const out: CityPlacement[] = [];
  const put = (asset: CityAsset, x: number, z: number, yaw = 0) => out.push({asset,x,z,scale:1,yaw});
  // Continuous fallen towers form two cross-street barriers and a perimeter avenue.
  put('city-long-collapse',0,18);
  put('city-long-collapse',0,-18,Math.PI);
  put('city-long-collapse',27,0,Math.PI/2);
  put('city-long-collapse',-27,0,-Math.PI/2);
  for(const side of [-1,1]){
    put('city-collapse',side*20,27,.25*side);
    put('city-corner',side*19,-28,-.18*side);
    put('city-rubble',side*17,13);
    put('city-rubble',side*17,-13);
  }
  return out;
}
export interface CityPoint { x:number;y:number;z:number }
/** Camera-to-player segment intersects a padded tower volume. */
export function cityOccludes(from:CityPoint,to:CityPoint,p:CityPlacement):boolean {
  const a=CITY_ASSETS[p.asset],c=Math.cos(p.yaw),s=Math.sin(p.yaw);
  const local=(v:CityPoint)=>({x:(v.x-p.x)*c-(v.z-p.z)*s,y:v.y,z:(v.x-p.x)*s+(v.z-p.z)*c});
  const f=local(from),t=local(to);
  let enter=0,leave=1;
  for(const [key,min,max] of [['x',-a.width*p.scale/2-1,a.width*p.scale/2+1],['y',0,a.height*p.scale],['z',-a.depth*p.scale/2-1,a.depth*p.scale/2+1]] as const){
    const d=t[key]-f[key];
    if(Math.abs(d)<1e-8){if(f[key]<min||f[key]>max)return false;continue;}
    const u=(min-f[key])/d,v=(max-f[key])/d;
    enter=Math.max(enter,Math.min(u,v));leave=Math.min(leave,Math.max(u,v));
    if(enter>leave)return false;
  }
  return true;
}
