import { Axis, BoundingInfo, Color3, Constants, Effect, Mesh, PointLight, ShaderMaterial, Vector3, VertexData, type Scene } from '@babylonjs/core';
import type { KitContext } from '../kit';
import { SNOW } from './palette';
import { addAnimeEffectLight } from '../../toon';

/** Shared by the damage corridor and its visible flame footprint, including charge scaling. */
export const afterburnHalfWidth = (chargeWidth: number) => chargeWidth * .5;

// One local light across all trails keeps rapid fire from adding unbounded scene lights.
type FireLightSource = { position: Vector3; strength: number; width: number };
const fireLights = new WeakMap<Scene, { light: PointLight; sources: Set<FireLightSource> }>();
function fireLight(ctx: KitContext) {
  let pool = fireLights.get(ctx.scene);
  if (!pool) {
    const light = new PointLight('sw-afterburn-light', Vector3.Zero(), ctx.scene);
    light.diffuse = new Color3(...SNOW.cyan); light.specular = new Color3(.05, .35, .6);
    light.intensity = 0; light.range = 6; light.renderPriority = 1;
    addAnimeEffectLight(ctx.scene, light);
    pool = { light, sources: new Set() }; fireLights.set(ctx.scene, pool);
  }
  const source: FireLightSource = { position: new Vector3(), strength: 0, width: 1 };
  pool.sources.add(source);
  const refresh = () => {
    let best: FireLightSource | undefined, score = -1;
    for (const candidate of pool.sources) {
      const weight = candidate.strength / (1 + Vector3.DistanceSquared(candidate.position, ctx.playerPosition) * .08);
      if (weight > score) { score = weight; best = candidate; }
    }
    pool.light.intensity = best ? best.strength : 0;
    if (best) { pool.light.position.copyFrom(best.position); pool.light.range = 5 + Math.sqrt(best.width); }
  };
  return { source, refresh, dispose: () => { pool.sources.delete(source); refresh(); } };
}

// Original Babylon implementation of the layered-mask approach used by toon fire shaders.
// Visual references: yoa3d.com/demo/flame and 23rd.dev/docs/components/shader-anime-fire.
// Flat cyan/white regions and curled silhouettes replace the old 32-step volume integration.
Effect.ShadersStore.swAnimeFireVertexShader = `
precision highp float;
attribute vec3 position;
attribute vec2 uv;
attribute vec4 color;
uniform mat4 world, viewProjection;
uniform vec3 cameraRight;
uniform float time, flameWidth, flameHeight;
varying vec2 vUV;
varying vec4 vSeed;
varying vec3 vWorld;
void main() {
  vUV=uv; vSeed=color;
  vec3 root=(world*vec4(position,1.0)).xyz;
  float flicker=1.0+sin(time*(3.0+color.z*2.0)+color.x*12.0)*.10;
  float lean=sin(time*(1.7+color.y)+color.x*19.0+uv.y*3.0)*uv.y*uv.y*.22;
  vWorld=root+cameraRight*((uv.x-.5+lean)*flameWidth*(.8+color.y*.4));
  vWorld.y+=uv.y*flameHeight*(.65+color.z*.55)*flicker;
  gl_Position=viewProjection*vec4(vWorld,1.0);
}`;
Effect.ShadersStore.swAnimeFireFragmentShader = `
precision highp float;
varying vec2 vUV;
varying vec4 vSeed;
varying vec3 vWorld;
uniform vec3 origin, forward, side, outerColor, flameColor, coreColor;
uniform float time, reach, opacity, halfWidth, fieldRadius;
float hash(vec2 p) {return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p) {
  vec2 i=floor(p), f=fract(p);f=f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);
}
void main() {
  float along=dot(vWorld-origin,forward), across=abs(dot(vWorld-origin,side));
  if(along<0.0 || along>reach || across>halfWidth) discard;
  if(fieldRadius>0.0 && length((vWorld-origin).xz)>fieldRadius) discard;
  float y=vUV.y, x=(vUV.x-.5)*2.0;
  float clock=time*(1.2+vSeed.y*.55)+vSeed.x*20.0;
  float curl=sin(y*5.8-clock*1.4+vSeed.w*6.0)*y*.38;
  // A tapered flame with eroded shoulders and a hooked, needle-like tip.
  float body=pow(max(0.0,1.0-y),.82)*.88-abs(x-curl);
  // The noise moves the edge out by at most .06+.21y; beyond that the card is clear (most of it).
  if(body+.075+y*.21<=0.0) discard;
  vec2 flow=vec2(x*2.0+vSeed.x*13.0,y*3.5-clock*2.5);
  float n=noise(flow)*.7+noise(flow*2.0+5.2)*.3;
  float field=body+(n-.5)*(.12+y*.42);
  float edge=smoothstep(-.015,.025,field);
  float root=smoothstep(0.0,.16,y);
  float hole=noise(vec2(x*3.7+vSeed.z*20.0,y*5.0-clock*3.2));
  float cut=1.0-smoothstep(.69,.77,hole)*smoothstep(.24,.55,y);
  float inner=smoothstep(.39,.43,field)*(1.0-smoothstep(.42,.78,y));
  vec3 paint=mix(outerColor,flameColor,smoothstep(.035,.09,field));
  paint=mix(paint,coreColor,inner);
  float boundary=1.0-smoothstep(halfWidth-.18,halfWidth,across);
  float alpha=edge*root*cut*boundary*opacity*(.60+inner*.16);
  if(alpha<.015) discard;
  gl_FragColor=vec4(paint,alpha);
}`;

type FireSlot = { mesh: Mesh; material: ShaderMaterial; busy: boolean };
const pools = new WeakMap<Scene, FireSlot[]>();
/** every trail's material keeps this reference; the camera's right is the same for all of them */
const cameraRight = new Vector3();
const MAX_RANGE = 62.5;
const SPACING = .72;
const STEPS = Math.ceil(MAX_RANGE / SPACING);
function createSlot(ctx: KitContext): FireSlot {
  const mesh = new Mesh('sw-afterburn-fire',ctx.scene);
  const material = new ShaderMaterial('sw-anime-afterburn',ctx.scene,'swAnimeFire',{
    attributes:['position','uv','color'],
    uniforms:['world','viewProjection','cameraRight','time','flameWidth','flameHeight','origin','forward','side','outerColor','flameColor','coreColor','reach','opacity','halfWidth','fieldRadius'],
    needAlphaBlending:true,
  });
  material.setFloat('fieldRadius',0);
  material.alphaMode=Constants.ALPHA_COMBINE;
  material.disableDepthWrite=true;material.backFaceCulling=false;
  material.setColor3('outerColor',new Color3(...SNOW.cyan).scale(.8));
  material.setColor3('flameColor',new Color3(...SNOW.cyan).scale(1.1));
  material.setColor3('coreColor',new Color3(...SNOW.core).scale(1.15));
  material.setVector3('cameraRight',Vector3.Right());
  material.setVector3('origin',Vector3.Zero());material.setVector3('forward',Vector3.Forward());material.setVector3('side',Vector3.Right());
  for(const name of ['time','reach','opacity'])material.setFloat(name,0);
  for(const name of ['flameWidth','flameHeight','halfWidth'])material.setFloat(name,1);
  const positions:number[]=[],uvs:number[]=[],colors:number[]=[],indices:number[]=[];
  for(let lane=0;lane<3;lane++)for(let i=0;i<STEPS;i++) {
    const base=positions.length/3, seed=[Math.random(),Math.random(),Math.random(),Math.random()];
    for(const [u,v] of [[0,0],[1,0],[1,1],[0,1]]) {
      positions.push(0,0,0);uvs.push(u,v);colors.push(...seed);
    }
    indices.push(base,base+1,base+2,base,base+2,base+3);
  }
  const data=new VertexData();data.positions=positions;data.uvs=uvs;data.colors=colors;data.indices=indices;data.applyToMesh(mesh,true);
  mesh.material=material;mesh.isPickable=false;mesh.setEnabled(false);
  return {mesh,material,busy:false};
}

/** Compile fire and reserve its GPU resources while the loading screen is still present. */
export async function prepareBlueFire(ctx: KitContext): Promise<void> {
  if(pools.has(ctx.scene))return;
  const slots=Array.from({length:16},()=>createSlot(ctx));pools.set(ctx.scene,slots);
  fireLight(ctx).dispose(); // introduce the single light before world materials compile
  await Promise.all([...slots.map(slot=>slot.material.forceCompilationAsync(slot.mesh)),ctx.vfx.prepare()]);
  // A representative draw also warms the glow pass and driver pipelines, which
  // forceCompilation alone does not exercise. Gameplay has not started yet.
  const focus=ctx.camera.focus.clone();
  const warmOrigin=focus.add(new Vector3(-8,0,-10));
  const preview=blueFireTrail(ctx,warmOrigin,new Vector3(1,0,.2).normalize(),3,MAX_RANGE);
  try {
    ctx.camera.snap(warmOrigin);ctx.targets.draw();
    for(let i=0;i<24;i++) {
      preview.update(.5+i/60,12,.85);
      ctx.scene.render();
      await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
    }
    await ctx.scene.whenReadyAsync();
  } finally {
    preview.dispose();ctx.camera.snap(focus);
  }

}

/** Three staggered rows of curled, cel-painted flame cards, one draw per trail. */
export function blueFireTrail(ctx:KitContext,origin:Vector3,dir:Vector3,width:number,range:number) {
  let pool=pools.get(ctx.scene);
  if(!pool){pool=[];pools.set(ctx.scene,pool);}
  let slot=pool.find(s=>!s.busy);
  if(!slot){slot=createSlot(ctx);pool.push(slot);}
  slot.busy=true;
  const {mesh,material}=slot;
  const halfWidth=afterburnHalfWidth(width),side=new Vector3(dir.z,0,-dir.x);
  const base=new Vector3(origin.x,.035,origin.z);
  mesh.position.copyFrom(base);mesh.rotation.y=Math.atan2(dir.x,dir.z);
  const positions=mesh.getVerticesData('position')!;
  const seeds=mesh.getVerticesData('color')!;
  let cursor=0,maxGround=0;
  for(let lane=0;lane<3;lane++)for(let i=0;i<STEPS;i++) {
    const seedAt=(lane*STEPS+i)*16;
    const along=(i+.15+(lane%2)*.42+(seeds[seedAt]-.5)*.5)*SPACING;
    const across=((lane-1)*.63+(seeds[seedAt+1]-.5)*.34)*halfWidth;
    const x=base.x+dir.x*along+side.x*across,z=base.z+dir.z*along+side.z*across;
    const ground=Math.max(0,ctx.snow?.surfaceHeight(x,z)??0);maxGround=Math.max(maxGround,ground);
    for(let corner=0;corner<4;corner++){positions[cursor++]=across;positions[cursor++]=ground;positions[cursor++]=along;}
  }
  mesh.updateVerticesData('position',positions);
  const height=.95*Math.sqrt(width);
  mesh.setBoundingInfo(new BoundingInfo(new Vector3(-halfWidth-1,0,-1),new Vector3(halfWidth+1,maxGround+height*1.5,range+1)));
  material.setVector3('origin',base);material.setVector3('forward',dir);material.setVector3('side',side);
  material.setFloat('flameWidth',.72*Math.sqrt(width));material.setFloat('flameHeight',height);material.setFloat('halfWidth',halfWidth);
  const lighting=fireLight(ctx);lighting.source.width=width;
  // Pooled ember strokes rise, drift, and curl; their count is bounded per shot.
  const cinders = Array.from({ length: 48 }, (_, i) => {
    const q = ctx.vfx.quad(i % 5 === 0 ? 'star' : 'spark', i % 3 ? SNOW.cyan : SNOW.core);
    ctx.vfx.glowing(q);
    return { q, born: -1, next: Math.random() * 1.3, life: 1, speed: 1, distance: 0,
      lateral: 0, drift: 0, phase: 0, size: .05, hot: false };
  });
  const at=new Vector3(),tip=new Vector3();
  return {
    update(age:number,reach:number,opacity:number) {
      mesh.setEnabled(reach>.01);
      ctx.vfx.camera.getDirectionToRef(Axis.X,cameraRight);material.setVector3('cameraRight',cameraRight);
      material.setFloat('time',age);material.setFloat('reach',reach);material.setFloat('opacity',opacity);
      // Illuminate the part of the trail near the player, rather than its distant endpoint.
      const p = ctx.playerPosition;
      const along = Math.max(0, Math.min(reach, (p.x - base.x) * dir.x + (p.y - base.y) * dir.y + (p.z - base.z) * dir.z + 2));
      lighting.source.position.set(base.x + dir.x * along, base.y + dir.y * along, base.z + dir.z * along);
      lighting.source.position.y = .7 + (ctx.snow?.surfaceHeight(lighting.source.position.x, lighting.source.position.z) ?? 0);
      lighting.source.strength = reach > .1 ? opacity * (2.8 + Math.sin(age * 13) * .2) : 0;
      lighting.refresh();
      for (const ember of cinders) {
        if (ember.born >= 0 && age - ember.born >= ember.life) {
          ember.born = -1; ember.next = age + .05 + Math.random() * .65;
        }
        if (ember.born < 0) {
          if (age < ember.next || reach < .1) { ember.q.visible = false; continue; }
          ember.born = age; ember.life = .65 + Math.random() * 1.7;
          ember.speed = .65 + Math.random() * 1.9;
          ember.distance = Math.random() * reach;
          ember.lateral = (Math.random() * 2 - 1) * halfWidth * .85;
          ember.drift = (Math.random() * 2 - 1) * .55;
          ember.phase = Math.random() * Math.PI * 2;
          ember.size = .025 + Math.random() * .055;
          ember.hot = Math.random() < .35;
        }
        const elapsed = age - ember.born, t = elapsed / ember.life;
        const sway = Math.sin(elapsed * 3 + ember.phase) * .16 * t;
        const forward = ember.distance + ember.drift * elapsed * .25, across = ember.lateral + ember.drift * elapsed + sway;
        at.set(base.x + dir.x * forward + side.x * across, 0, base.z + dir.z * forward + side.z * across);
        at.y = .18 + (ctx.snow?.surfaceHeight(at.x, at.z) ?? 0) + elapsed * ember.speed;
        const fade = Math.min(1, elapsed / .1) * (1 - t) * opacity;
        tip.copyFrom(at).addInPlaceFromFloats(side.x * ember.drift * .08, .08 + ember.speed * .06, side.z * ember.drift * .08);
        ctx.vfx.streak(ember.q, at, tip, ember.size);
        ctx.vfx.tint(ember.q, ember.hot ? SNOW.core : SNOW.cyan, fade);

      }
    },    dispose() {
      lighting.dispose();for(const ember of cinders)ctx.vfx.release(ember.q);
      mesh.setEnabled(false);slot.busy=false;
    },
  };
}
