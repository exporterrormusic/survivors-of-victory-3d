import { type BaseTexture, Color3, MaterialPluginBase, MeshBuilder, RawTexture, type Scene, StandardMaterial, Texture, type UniformBuffer, type Mesh } from '@babylonjs/core';
import { mountUnderUi } from './fire-vignette';
import { FrozenLake, LAKE_DAMAGE, LAKE_DAMAGE_INTERVAL, LAKE_FROST, LAKE_GRID, LAKE_HALF, LAKES } from './frozen-lake';
import type { Player } from './player';
import type { Target, TargetField, SquadMember } from './targets';
import type { Run } from './run';

/** Ice colour, Voronoi fractures that widen with stress, and open water in broken cells. */
class LakeIce extends MaterialPluginBase {
  constructor(material:StandardMaterial,private readonly texture:RawTexture){super(material,'LakeIce',211,{},true,true);}
  override getUniforms(){return {ubo:[{name:'lakeClock',size:1,type:'float'}],fragment:'uniform float lakeClock;'};}
  override getSamplers(s:string[]):void{s.push('lakeState');}
  override getActiveTextures(t:BaseTexture[]):void{t.push(this.texture);}
  override hasTexture(t:BaseTexture):boolean{return t===this.texture;}
  override bindForSubMesh(b:UniformBuffer):void{b.updateFloat('lakeClock',performance.now()/1000);b.setTexture('lakeState',this.texture);}
  override getCustomCode(type:string):Record<string,string>|null{
    if(type!=='fragment')return null;
    return {
      CUSTOM_FRAGMENT_DEFINITIONS:`
        uniform sampler2D lakeState;
        float lakeCrackGlow=0.;
        float lakeHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
        vec2 lakeHash2(vec2 p){return fract(sin(vec2(dot(p,vec2(127.1,311.7)),dot(p,vec2(269.5,183.3))))*43758.5453);}
        float lakeNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
          return mix(mix(lakeHash(i),lakeHash(i+vec2(1,0)),f.x),mix(lakeHash(i+vec2(0,1)),lakeHash(i+vec2(1,1)),f.x),f.y);}
        // Distance to the nearest Voronoi edge, plus a per-cell id.
        vec2 lakeCells(vec2 p){
          vec2 i=floor(p),f=fract(p),best=vec2(8.);vec2 bestCell=vec2(0.);
          for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){vec2 g=vec2(x,y),o=lakeHash2(i+g),r=g+o-f;float d=dot(r,r);
            if(d<best.x){best.y=best.x;best.x=d;bestCell=i+g;}else if(d<best.y)best.y=d;}
          return vec2(sqrt(best.y)-sqrt(best.x),lakeHash(bestCell));
        }
        // Mirrors lakeEdge/lakeShoreNoise in frozen-lake.ts.
        float lakeEdge(vec2 p){float e=-1e4;
          ${LAKES.map(l=>`{vec2 d=p-vec2(${l.x.toFixed(1)},${l.z.toFixed(1)});float a=atan(d.y,d.x);e=max(e,${l.r.toFixed(1)}+1.6*sin(3.*a+${l.seed.toFixed(3)})+.9*sin(5.*a+${(l.seed*2.3).toFixed(3)})-length(d));}`).join(' ')}
          return e;}
        float lakeShore(vec2 p){return sin(p.x*.9+sin(p.y*.6)*1.7)*cos(p.y*.8-p.x*.3)*.9;}
      `,
      CUSTOM_FRAGMENT_UPDATE_DIFFUSE:`
        vec2 lp=vPositionW.xz;
        float iceEdge=lakeEdge(lp);
        if(iceEdge<-1.)discard;
        vec4 state=texture2D(lakeState,(lp+${LAKE_HALF.toFixed(1)})/${LAKE_GRID.toFixed(1)});
        float stress=state.r,open=state.g;
        // Clear ice: deep blue where thick, pale where wind-polished, with frozen bubbles.
        float n=lakeNoise(lp*.11)+.5*lakeNoise(lp*.37);
        vec3 ice=mix(vec3(.33,.6,.78),vec3(.66,.86,.96),smoothstep(.4,1.3,n));
        ice+=vec3(.1)*step(.985,lakeHash(floor(lp*6.)))*lakeNoise(lp*2.);
        float polish=smoothstep(.55,.75,lakeNoise(vec2(lp.x*.05+lp.y*.09,lp.y*.4)));
        ice=mix(ice,vec3(.85,.95,1.),polish*.25);
        // Stage 1 (stress .03+): bold hairlines. Stage 2 (.3+): a dense web of wide fractures with
        // dark water inside. Stage 3 (.7+): milky splintered ice that pulses before collapse.
        // Lines are a dark core inside a white halo so they read on pale and deep ice alike.
        vec2 fine=lakeCells(lp*1.6+vec2(1.7,4.1));
        float s1=smoothstep(.025,.2,stress);
        float hairOn=step(fine.y,s1*1.05);
        float hairHalo=(1.-smoothstep(.0,.16,fine.x))*hairOn;
        float hairCore=(1.-smoothstep(.0,.05,fine.x))*hairOn;
        vec2 big=lakeCells(lp*.8+vec2(3.1,7.7));
        float s2=smoothstep(.3,.65,stress);
        float wide=.06+.14*s2;
        float fracOn=step(big.y,s2*1.05);
        float fracHalo=(1.-smoothstep(.0,wide*1.8,big.x))*fracOn;
        float fracCore=(1.-smoothstep(.0,wide*.6,big.x))*fracOn;
        float s3=smoothstep(.7,.98,stress);
        float pulse=.5+.5*sin(lakeClock*12.);
        ice=mix(ice,vec3(.84,.93,.98),smoothstep(.1,.9,stress)*.45);
        ice*=1.+s3*(big.y-.5)*.3;
        ice=mix(ice,vec3(.98,1.,1.),max(hairHalo*.9,fracHalo));
        // Crack halos glow faintly on their own so they still read under the dim night light.
        lakeCrackGlow=max(hairHalo*.9,fracHalo)*(1.-max(hairCore,fracCore));
        ice=mix(ice,vec3(.1,.27,.42),max(hairCore*.75,fracCore*(.75+.25*s2)));
        ice=mix(ice,vec3(1.),s3*pulse*.35);
        // Open water: jagged rim from the fracture cells, dark rippling water inside.
        float hole=smoothstep(.42,.58,open+(big.y-.5)*.35);
        float ripple=lakeNoise(lp*.9+vec2(lakeClock*.35,lakeClock*.2))+.5*lakeNoise(lp*2.3-vec2(lakeClock*.5,0.))-.75;
        vec3 water=mix(vec3(.04,.15,.23),vec3(.1,.3,.42),clamp(.5+ripple,0.,1.));
        // Giving way: each chunk darkens and tips under before the water closes over it.
        float tip=smoothstep(.05,.45,open+(big.y-.5)*.35)*(1.-hole);
        ice=mix(ice,vec3(.18,.36,.5),tip*.55);
        ice*=1.-tip*.25*(1.-fracCore);
        float rimBand=smoothstep(.25,.42,open+(big.y-.5)*.35)*(1.-hole);
        ice=mix(ice,vec3(.88,.97,1.),rimBand);
        vec3 surface=ice;
        // Frosted shore: the ice whitens to the snow's powder colour across the same uneven
        // band where the snow layer thins out, so there is no visible cut between them.
        float frost=1.-smoothstep(${(LAKE_FROST-.6).toFixed(1)},${(LAKE_FROST+3).toFixed(1)},iceEdge+lakeShore(lp));
        float drift=lakeNoise(lp*.8)*.35;
        baseColor.rgb=mix(surface,vec3(.88,.93,.96),clamp(frost+drift*frost,0.,1.));
        // Open water draws over the frost so the hole you see is exactly the hole that hurts.
        baseColor.rgb=mix(baseColor.rgb,water,hole);
        lakeCrackGlow*=(1.-hole)*(1.-clamp(frost,0.,1.));
      `,
      CUSTOM_FRAGMENT_BEFORE_FRAGCOLOR:`
        color.rgb=mix(color.rgb,max(color.rgb,vec3(.92,.97,1.)),lakeCrackGlow*.65);
      `,
    };
  }
}

export class FrozenLakeView {
  readonly mesh:Mesh;
  private readonly data=new Uint8Array(LAKE_GRID*LAKE_GRID*4);
  private readonly texture:RawTexture;
  private readonly material:StandardMaterial;
  private uploadIn=0;
  constructor(scene:Scene,private readonly lake:FrozenLake){
    this.texture=RawTexture.CreateRGBATexture(this.data,LAKE_GRID,LAKE_GRID,scene,false,false,Texture.BILINEAR_SAMPLINGMODE);
    this.texture.wrapU=this.texture.wrapV=Texture.CLAMP_ADDRESSMODE;this.texture.gammaSpace=false;
    this.material=new StandardMaterial('frozen-lake-ice',scene);
    this.material.diffuseColor=Color3.White();this.material.specularColor=new Color3(.55,.65,.75);this.material.specularPower=96;
    new LakeIce(this.material,this.texture);
    this.mesh=MeshBuilder.CreateGround('frozen-lake',{width:LAKE_HALF*2,height:LAKE_HALF*2},scene);
    this.mesh.position.y=.02;this.mesh.material=this.material;this.mesh.receiveShadows=true;this.mesh.isPickable=false;
    this.mesh.setEnabled(false);
  }
  set(enabled:boolean):void{this.mesh.setEnabled(enabled);this.lake.dirty=true;}
  update(dt:number):void{
    if(!this.lake.enabled)return;
    this.uploadIn-=dt;
    if(!this.lake.dirty||this.uploadIn>0)return;
    this.uploadIn=.08;this.lake.dirty=false;
    for(let i=0;i<this.lake.stress.length;i++){
      this.data[i*4]=Math.round(Math.min(1,this.lake.stress[i])*255);
      this.data[i*4+1]=Math.round(this.lake.openness(i)*255);
    }
    this.texture.update(this.data);
  }
  dispose():void{this.mesh.dispose();this.material.dispose();this.texture.dispose();}
}

/** Weight, falling in and the river's wading damage for everything standing on the lake. */
export class FrozenLakeHazard {
  private clock=0;
  private hurtAt=new WeakMap<object,number>();
  private sink=0;
  private splashed=0;
  /** Splash and shake where a collapse begins; wired by the game, absent in tests. */
  onBreak:((x:number,z:number)=>void)|null=null;
  /** Soft hurt cue on the damage rhythm while the player wades. */
  onHurt:(()=>void)|null=null;
  private hurtPulse=0;
  /** Frost creeping in from the screen edges while the player is in the water. */
  private frost:HTMLDivElement|null=null;
  private frostLevel=0;
  private frostFlare=0;
  private showFrost(level:number,dt:number):void{
    if(typeof document==='undefined')return;
    if(!this.frost&&level<=0)return;
    if(!this.frost){
      const el=this.frost=document.createElement('div');
      el.className='frozen-lake-frost';
      // Crystalline frost from SVG turbulence, layered over a pale cold glow, masked to creep in
      // from the edges and corners. No box shadow or scaling: those read as a rectangular frame.
      const crystals=`url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='512' height='512'><filter id='f'><feTurbulence type='fractalNoise' baseFrequency='.012 .03' numOctaves='4' seed='7'/><feColorMatrix values='0 0 0 0 .9  0 0 0 0 .97  0 0 0 0 1  0 0 0 2.6 -1.25'/></filter><rect width='512' height='512' filter='url(%23f)'/><filter id='g'><feTurbulence type='turbulence' baseFrequency='.05' numOctaves='2' seed='3'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 -3 1.4'/></filter><rect width='512' height='512' filter='url(%23g)' opacity='.55'/></svg>`).replace(/%2523/g,'%23')}")`;
      const mask='radial-gradient(ellipse 72% 68% at 50% 50%, transparent 45%, rgba(0,0,0,.55) 72%, #000 100%)';
      mountUnderUi(el);
      Object.assign(el.style,{opacity:'0',
        background:`${crystals} center/512px 512px repeat, radial-gradient(ellipse 72% 68% at 50% 50%, rgba(170,225,255,0) 40%, rgba(170,225,255,.45) 80%, rgba(225,246,255,.75) 100%)`,
        WebkitMaskImage:mask,maskImage:mask});
    }
    // Creeps in quickly when you go under, thaws slowly once you are out.
    this.frostLevel+=(level-this.frostLevel)*Math.min(1,dt*(level>this.frostLevel?3:1.2));
    this.frostFlare=Math.max(0,this.frostFlare-dt*2.2);
    const o=Math.min(1,this.frostLevel*.85+this.frostFlare*.35);
    this.frost.style.opacity=o.toFixed(3);
  }
  constructor(readonly lake:FrozenLake,readonly view:FrozenLakeView){}
  set(enabled:boolean):void{this.splashed=0;this.lake.reset(enabled);this.view.set(enabled);this.hurtAt=new WeakMap();this.sink=0;}
  update(dt:number,player:Player,targets:TargetField,run:Run):void{
    const lake=this.lake;
    if(!lake.enabled){
      for(const t of targets.targets)if(t.alive&&t.drowning>0){t.drowning=0;t.stunned=0;}
      if(this.sink){this.sink=0;player.chibi.root.position.y=0;}if(this.frost)this.showFrost(0,1);return;
    }
    this.clock+=dt;lake.update(dt);this.view.update(dt);
    if(lake.lastBreak&&lake.lastBreak.count!==this.splashed){this.splashed=lake.lastBreak.count;this.onBreak?.(lake.lastBreak.x,lake.lastBreak.z);}
    const affect=(body:Player|Target|SquadMember,radius:number,hp:number,hover:boolean,isPlayer:boolean)=>{
      if(hover)return 0;
      // Only the player's weight cracks the ice; everyone on the ground can fall in.
      if(isPlayer)lake.load({position:body.position,radius},1,dt);
      const depth=lake.depth(body.position);if(depth<.05||dt<=0)return depth;
      // The player drains smoothly at the same rate as the ticks, without strobing hit feedback.
      if(body===player){
        player.takeDamage(hp*LAKE_DAMAGE*depth*dt/LAKE_DAMAGE_INTERVAL,true,true);
        if((this.hurtPulse-=dt)<=0){this.hurtPulse=LAKE_DAMAGE_INTERVAL;this.frostFlare=1;this.onHurt?.();}
        return depth;
      }
      if(this.clock-(this.hurtAt.get(body)??-Infinity)<LAKE_DAMAGE_INTERVAL)return depth;
      this.hurtAt.set(body,this.clock);
      if('hit' in body)run.environmentDamage(body as Target,hp*LAKE_DAMAGE*depth);
      else body.takeDamage(hp*LAKE_DAMAGE*depth);
      return depth;
    };
    let playerDepth=0;
    if(player.hp>0&&!player.transported)playerDepth=affect(player,.45,player.maxHp,false,true);
    for(const t of targets.targets){
      if(!t.alive||t.hover||dt<=0||t.combatTier==='heavy'||t.combatTier==='boss')continue;
      if(t.drowning>0||lake.depth(t.position)>=.05){
        // Once the ice gives way beneath a grounded Rapture it cannot climb out.
        // Keep its gameplay position at the surface for loot and kill effects.
        t.drowning=Math.min(1,t.drowning+dt/1.5);
        t.stunned=Math.max(t.stunned,2);
        if(t.drowning>=1)run.environmentDamage(t,t.hp);
      }
    }
    for(const ally of targets.squad)if(ally.alive)affect(ally,.45,ally.maxHp,false,false);
    // The player drops waist-deep into a hole and climbs back out at its edge.
    const goal=-.7*playerDepth;this.sink+=(goal-this.sink)*Math.min(1,dt*(goal<this.sink?14:6));
    player.chibi.root.position.y=this.sink;
    this.showFrost(player.hp>0&&!player.transported?playerDepth:0,dt);
  }
  dispose():void{this.view.dispose();this.frost?.remove();}
}
