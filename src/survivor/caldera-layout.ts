/** Where the molten rocks are thrown from: an unseen vent beyond the east rim. */
export const VOLCANO = { x: 78, z: 18, height: 30 };

/** Smooth shore profile, in world coordinates around the basin centre. */
export function calderaShoreRadius(a:number):number{return 45.5+1.1*Math.sin(a*5)+.6*Math.sin(a*11);}

// Same value noise as the lava shader (lavaNoiseGLSL), so the ragged shoreline and the damage agree.
const fract=(v:number)=>v-Math.floor(v);
const hash=(x:number,y:number)=>fract(Math.sin(x*127.1+y*311.7)*43758.5453);
function noise(x:number,y:number):number{
  const ix=Math.floor(x),iy=Math.floor(y);let fx=x-ix,fy=y-iy;fx=fx*fx*(3-2*fx);fy=fy*fy*(3-2*fy);
  const a=hash(ix,iy)+(hash(ix+1,iy)-hash(ix,iy))*fx,b=hash(ix,iy+1)+(hash(ix+1,iy+1)-hash(ix,iy+1))*fx;
  return a+(b-a)*fy;
}
/** Shoreline state the shaders also read: the drift clock and how far the lava has advanced (m). */
export const CALDERA_SHORE={clock:0,advance:0};
/** Over a 10-minute round the lava creeps ~9.6 m in, taking roughly 38% of the free basin. */
export const CALDERA_MAX_ADVANCE=9.6,CALDERA_ADVANCE_TIME=600;
/** Metres past the visible lava shoreline (negative = dry ground); mirrors calderaShoreDepth in GLSL. */
export function calderaShoreDepth(x:number,z:number):number{
  const c=CALDERA_SHORE.clock,dx=c*.011,dz=-c*.007;
  const lobes=(noise(x*.11+dx,z*.11+dz)-.5)*4.2+(noise(x*.37+3-dx*1.7,z*.37+3-dz*1.7)-.5)*1.6+(noise(x*1.3+dx*3,z*1.3+dz*3)-.5)*.5;
  return Math.hypot(x,z)-(calderaShoreRadius(Math.atan2(z,x))-CALDERA_SHORE.advance)+lobes;
}
export function inCalderaLava(x:number,z:number):boolean {
  return calderaShoreDepth(x,z)>=0&&Math.hypot(x,z)<=60;
}
