import { Color3, Mesh, ShaderMaterial, Texture, TransformNode, Vector3, VertexData, type Scene, type ShadowGenerator } from '@babylonjs/core';
import { StormField, STORM_BOLT, STORM_DROWN, STORM_RADIUS, stormRegion } from './storm-field';
import { createStormSpray } from './storm-spray';
import { stormWaterVertex, stormWaterFragment } from './storm-water';
import { STORM_GROVE, stormKitPlacements } from './storm-layout';
import { createStormAsset, StormMaterials } from './storm-kit';
import type { SceneryObstacle } from './range-collision';
import type { Player } from './player';
import type { TargetField } from './targets';
import type { Run } from './run';

export function stormObstacles():SceneryObstacle[]{
  const out:SceneryObstacle[]=[];
  const add=(x:number,z:number,r:number,height:number)=>out.push({x,z,r,height});
  // Continuous ring behind the forest border and across the lake and river mouth.
  for(let i=0;i<240;i++){
    const a=i*Math.PI*2/240;add(Math.cos(a)*(STORM_RADIUS+1.5),Math.sin(a)*(STORM_RADIUS+1.5),1.2,9);
  }
  // Each grove clump is a solid pillar; the lanes between them stay open for kiting.
  for(const c of STORM_GROVE)add(c.x,c.z,c.r-.4,6);
  for(const p of stormKitPlacements()){
    const c=Math.cos(p.yaw),s=Math.sin(p.yaw),k=p.scale??1;
    const local=(x:number,z:number,r:number,h:number)=>add(p.x+(c*x+s*z)*k,p.z+(-s*x+c*z)*k,r*k,h*k);
    if(p.asset==='mech-wreck'){local(0,0,2.3,4);local(2.4,.2,1.1,3);local(-.5,2,.8,3);local(-3.6,-2.7,.9,1);local(1.3,-1.9,.8,1);}
  }
  return out;
}

/** Owns river presentation and the flood; the same StormField drives movement and AI. */
export class StormMap{
  readonly field=new StormField();
  /** Cel treatment over the physically based water; off shows the realistic base. */
  waterAnime=false;
  private root:TransformNode|null=null;
  private mats:StormMaterials;
  private water:ShaderMaterial[]=[];
  private clock=0;
  private drownedAt=new WeakMap<object,number>();
  private boltIn=0;
  /** Aimed lightning (bolt, flash, thunder); returns false while the sky is still recharging. Wired by the game. */
  strike:((x:number,z:number)=>boolean)|null=null;
  constructor(private scene:Scene,private shadows:ShadowGenerator){
    this.mats=new StormMaterials(scene);
  }
  set(enabled:boolean):void{
    this.root?.dispose();this.root=null;for(const w of this.water)w.dispose();this.water=[];
    this.field.reset(enabled);this.drownedAt=new WeakMap();if(!enabled)return;
    this.root=new TransformNode('stormbringer-river-map',this.scene);
    for(const p of stormKitPlacements()){
      const prop=createStormAsset(this.scene,p.asset,this.mats);prop.parent=this.root;prop.position.set(p.x,0,p.z);prop.rotation.y=p.yaw;prop.scaling.setAll(p.scale??1);
      for(const m of prop.getChildMeshes())this.shadows.addShadowCaster(m);
    }
    // One grid over the valley and both gorges; the shader draws the water's exact outline.
    const positions:number[]=[],indices:number[]=[],X0=-110,Z0=-150,W=220,D=260,step=1;
    const nx=W/step,nz=D/step;
    for(let j=0;j<=nz;j++)for(let i=0;i<=nx;i++)positions.push(X0+i*step,.06,Z0+j*step);
    for(let j=0;j<nz;j++)for(let i=0;i<nx;i++){const a=j*(nx+1)+i;indices.push(a,a+nx+1,a+1,a+1,a+nx+1,a+nx+2);}
    const data=new VertexData();Object.assign(data,{positions,indices,normals:positions.map((_,i)=>i%3===1?1:0)});
    const surface=new Mesh('storm-river-water',this.scene);data.applyToMesh(surface);surface.parent=this.root;surface.isPickable=false;surface.alwaysSelectAsActiveMesh=true;
    const shader=new ShaderMaterial('storm-flowing-river',this.scene,{vertexSource:stormWaterVertex,fragmentSource:stormWaterFragment},
      {attributes:['position'],uniforms:['worldViewProjection','time','surgeAge','warning','daylight','lightning','eye','fogColor','fogDensity','anime'],samplers:['waterNormal'],needAlphaBlending:true});
    const ripples=new Texture(`${import.meta.env.BASE_URL}environment/storm-kit-v3/water-normal.png`,this.scene,{noMipmap:false,gammaSpace:false});
    shader.setTexture('waterNormal',ripples);shader.onDisposeObservable.addOnce(()=>ripples.dispose());
    shader.backFaceCulling=false;this.water.push(shader);surface.material=shader;
    this.water.push(createStormSpray(this.scene,this.root));
    this.updateVisuals();
  }
  private updateVisuals():void{
    const f=this.field,sun=this.scene.getLightByName('sun')?.intensity??.5;
    for(const w of this.water){
      w.setFloat('time',f.flowTime);w.setFloat('surgeAge',f.surgeAge);w.setFloat('warning',f.phase==='warning'?1:0);
      w.setFloat('daylight',Math.min(1,sun));w.setFloat('lightning',Math.max(0,sun-1.4)*.2);
      w.setVector3('eye',this.scene.activeCamera?.globalPosition??Vector3.Zero());w.setColor3('fogColor',this.scene.fogColor);
      w.setFloat('fogDensity',this.scene.fogDensity);w.setFloat('anime',this.waterAnime?1:0);
    }
    this.mats.get('lamp').emissiveColor.copyFrom(f.phase==='warning'||f.phase==='surge'?new Color3(1,.25,.04):new Color3(.12,.8,.85));
  }
  /** A surge slows the river to 10% and washes waders toward the nearer bank. It drowns Raptures
   * caught in it (the player and squad are only slowed), so luring the horde in is the play. */
  update(dt:number,player:Player,targets:TargetField,run?:Run):void{
    const f=this.field;if(!f.enabled)return;
    f.update(dt);this.clock+=dt;this.updateVisuals();
    const phase=f.phase;
    if(dt<=0||phase!=='surge'){this.boltIn=0;return;}
    if(run&&(this.boltIn-=dt)<=0)this.bolt(targets,run);
    const push=(position:{x:number;z:number},radius:number,hover:boolean)=>{
      if(hover||!f.wet(position,radius))return;
      const flow=f.current(position);targets.navigation.push(position,flow.x*dt,flow.z*dt,radius);
    };
    if(player.hp>0&&!player.transported)push(player.position,.45,false);
    for(const t of targets.targets)if(t.alive){
      push(t.position,t.radius,t.hover);
      if(!run||t.hover||this.clock-(this.drownedAt.get(t)??-Infinity)<STORM_DROWN.interval)continue;
      const depth=f.depth(t.position)*f.floodAt(t.position);if(depth<.05)continue;
      this.drownedAt.set(t,this.clock);run.environmentDamage(t,t.maxHp*STORM_DROWN.share[t.combatTier]*depth);
    }
    for(const ally of targets.squad)if(ally.alive)push(ally.position,.45,false);
  }
  /** The storm hunts packs on the bare east slate during a surge, giving that bank a reason to visit. */
  private bolt(targets:TargetField,run:Run):void{
    this.boltIn=.25;
    const east=targets.targets.filter(t=>t.alive&&stormRegion(t.position)===2);
    let best=null as (typeof east)[number]|null,count=0;
    for(const t of east){
      const n=east.filter(o=>Math.hypot(o.position.x-t.position.x,o.position.z-t.position.z)<STORM_BOLT.radius).length;
      if(n>count){best=t;count=n;}
    }
    if(!best||count<STORM_BOLT.pack||!this.strike?.(best.position.x,best.position.z))return;
    this.boltIn=STORM_BOLT.interval;
    const {x,z}=best.position;
    for(const t of east)if(t.alive&&Math.hypot(t.position.x-x,t.position.z-z)<STORM_BOLT.radius)
      run.environmentDamage(t,t.maxHp*STORM_BOLT.share[t.combatTier]);
  }
  dispose():void{this.root?.dispose();for(const w of this.water)w.dispose();this.mats.dispose();}
}
