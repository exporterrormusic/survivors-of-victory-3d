// Ark Outskirts and Sakura at night: a low moon casting long, crisp shadows, cool
// blue grading with silver highlights, and fireflies that softly light what is around them
// (Phaser's night is a blue multiply with yellow-green fireflies; this is its 3D counterpart).

import { Color3, Color4, Constants, DepthRenderer, DirectionalLight, DynamicTexture, Effect, Matrix, ParticleSystem, PostProcess, ShadowGenerator, Vector3, type Camera, type Scene, type StandardMaterial, type AbstractMesh } from '@babylonjs/core';

import { sakuraPlacements } from './sakura-layout';

// Moonlight grade over the whole view: shadows sink toward deep blue, lit surfaces keep a cool
// silver edge. The depth buffer gives each pixel its world position so the fireflies can
// add a small green-gold glow. Hot saturated light (the crater fire, muzzle flashes) keeps its colour.
Effect.ShadersStore.outskirtsMoonFragmentShader = `
precision highp float;
varying vec2 vUV;
uniform sampler2D textureSampler;
uniform highp sampler2D moonDepth;
uniform mat4 inverseViewProjection;
uniform float amount;
uniform vec4 flies[120];
uniform vec4 lamps[16];
uniform vec4 lampShapes[16];
uniform float sakuraAmount;
void main(){
  vec4 c=texture2D(textureSampler,vUV);
  float depth=texture2D(moonDepth,vUV).r;
  vec4 hit=inverseViewProjection*vec4(vUV*2.-1.,depth*2.-1.,1.);
  vec3 world=hit.xyz/hit.w;
  float sky=step(.99999,depth);
  float l=dot(c.rgb,vec3(.2126,.7152,.0722));
  vec3 moon=mix(c.rgb,vec3(l),.35)*mix(vec3(.4,.54,1.0),vec3(.85,.93,1.12),smoothstep(.12,.75,l));
  vec3 glow=vec3(0.);
  for(int i=0;i<120;i++){vec3 d=world-flies[i].xyz;glow+=vec3(flies[i].w*exp(-dot(d,d)*.55));}
  moon+=vec3(1.,.72,.32)*glow*.3*(1.-sky);
  // Warm glows keep their color. Measured as warmth relative to the peak so clipped gold/ivory
  // cores (r,g at 1) still count; g>=b keeps pink petals under the grade.
  float peak=max(c.r,max(c.g,c.b)),warmth=(c.r-c.b)/max(peak,.001);
  float hot=smoothstep(.35,.75,peak)*smoothstep(.08,.25,warmth)*step(c.b,c.r)*step(c.b,c.g);
  moon=mix(moon,c.rgb*1.12,hot);
  float lamplight=0.;
  for(int i=0;i<16;i++){
    vec3 d=world-lamps[i].xyz;
    float below=1.-smoothstep(-.15,.2,d.y);
    float front=mix(1.,smoothstep(0.,.7,dot(d.xz,lampShapes[i].xy)),lampShapes[i].z);
    lamplight+=lamps[i].w*exp(-dot(d,d)*.16)*below*front;
  }
  moon+=vec3(1.,.65,.25)*lamplight*.30*sakuraAmount*(1.-sky);
  gl_FragColor=vec4(mix(c.rgb,moon,amount),c.a);
}`;

/** A low moon from the north-east: long shadows reaching across the basin. */
const MOON = new Vector3(.62, -.52, .58).normalize();

export class OutskirtsNight {
  private readonly glowTexture: DynamicTexture;
  private readonly fireflies: ParticleSystem;
  private readonly emitter = new Vector3();
  private readonly grade: PostProcess;
  private readonly camera: Camera;
  private readonly scene: Scene;
  private readonly sun: DirectionalLight | null;
  private readonly shadows: ShadowGenerator | null;
  private readonly daylight = { direction: new Vector3(), intensity: 1, diffuse: new Color3(), darkness: .25 };
  private graded = false;
  private moonlit = false;
  /** made on first use, so other maps never pay for the extra depth pass */
  private depth: DepthRenderer | null = null;
  private readonly inverse = Matrix.Identity();
  private readonly flyData = new Array<number>(120*4).fill(0);
  private level = 0;
  private sakuraLevel=0;
  private readonly lampData=new Array<number>(16*4).fill(0);
  private readonly lampShapes=new Array<number>(16*4).fill(0);
  private readonly lampMeshes:(AbstractMesh|null)[]=new Array(16).fill(null);

  constructor(scene: Scene, camera: Camera) {
    this.scene = scene;
    this.camera = camera;
    this.sun = scene.getLightByName('sun') as DirectionalLight | null;
    this.shadows = (this.sun?.getShadowGenerator() as ShadowGenerator | null) ?? null;
    this.grade = new PostProcess('outskirts-moon', 'outskirtsMoon', ['amount', 'inverseViewProjection', 'flies', 'lamps', 'lampShapes', 'sakuraAmount'], ['moonDepth'], 1, camera);
    this.grade.onApply = (effect) => {
      scene.getTransformMatrix().invertToRef(this.inverse);
      effect.setMatrix('inverseViewProjection', this.inverse);
      effect.setFloat('amount', this.level);
      effect.setArray4('flies', this.flyData);
      // Read at render time, after scenery occlusion has applied this frame's visibility.
      for(let i=0;i<16;i++){
        let mesh=this.lampMeshes[i];
        if(!mesh||mesh.isDisposed()||!mesh.isEnabled()){
          let nearest=Infinity;mesh=null;
          for(const candidate of this.scene.meshes){
            if(candidate.material?.name!=='sakura-paper'||!candidate.isEnabled()||candidate.metadata?.theme!=='sakura')continue;
            const center=candidate.getBoundingInfo().boundingBox.centerWorld;
            const distance=(center.x-this.lampData[i*4])**2+(center.z-this.lampData[i*4+2])**2;
            if(distance<nearest){nearest=distance;mesh=candidate;}
          }
          this.lampMeshes[i]=mesh;
        }
        this.lampData[i*4+3]=this.lampShapes[i*4+3]*Math.pow(mesh?.visibility??0,3);
      }
      effect.setArray4('lamps',this.lampData);effect.setArray4('lampShapes',this.lampShapes);effect.setFloat('sakuraAmount',this.sakuraLevel);
      if (this.depth) effect.setTexture('moonDepth', this.depth.getDepthMap());
    };
    let lightIndex=0;
    for(const placement of sakuraPlacements()){
      const sources=placement.asset==='sakura-lantern'?[[0,1.66,0,1]]:
        placement.asset==='sakura-shrine'?[-1.55,-.55,.55,1.55].map(x=>[x,2.24,-1.65,.22]):[];
      for(const [x,y,z,power] of sources){
        const c=Math.cos(placement.yaw),s=Math.sin(placement.yaw),scale=placement.scale;
        this.lampData.splice(lightIndex*4,4,placement.x+(c*x+s*z)*scale,y*scale,placement.z+(-s*x+c*z)*scale,power);
        this.lampShapes.splice(lightIndex++*4,4,-s,-c,placement.asset==='sakura-shrine'?1:0,power);
      }
    }
    // Only attached while it has something to do, so other maps pay nothing.
    camera.detachPostProcess(this.grade);

    // Fireflies: a yellow-green core with a wide soft halo, with a steady glow and slow arrival/departure fades.
    const glow = this.glowTexture = new DynamicTexture('outskirts-firefly', { width: 64, height: 64 }, scene, true);
    const g = glow.getContext() as CanvasRenderingContext2D;
    const dot = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    dot.addColorStop(0, 'rgba(255,249,220,1)'); dot.addColorStop(.18, 'rgba(255,237,170,.95)'); dot.addColorStop(.45, 'rgba(255,198,105,.3)'); dot.addColorStop(1, 'rgba(255,177,75,0)');
    g.fillStyle = dot; g.fillRect(0, 0, 64, 64); glow.hasAlpha = true; glow.update();
    const p = this.fireflies = new ParticleSystem('outskirts-fireflies', 120, scene);
    p.particleTexture = glow; p.blendMode = ParticleSystem.BLENDMODE_ADD; p.emitter = this.emitter;
    p.minEmitBox = new Vector3(-26, .3, -20); p.maxEmitBox = new Vector3(26, 1.6, 20);
    p.minSize = .30; p.maxSize = .45; p.minLifeTime = 18; p.maxLifeTime = 26; p.emitRate = 5;
    // Fill the largest local gaps rather than independently scattering every birth.
    p.startPositionFunction=(world,position,particle,isLocal)=>{
      const candidate=new Vector3(),best=new Vector3();let bestDistance=-1;
      for(let attempt=0;attempt<32;attempt++){
        candidate.set((Math.random()-.5)*52,.3+Math.random()*1.3,(Math.random()-.5)*40);
        if(!isLocal)Vector3.TransformCoordinatesToRef(candidate,world,candidate);
        let distance=Infinity;
        for(const other of p.particles){
          if(other===particle)continue;
          const dx=candidate.x-other.position.x,dz=candidate.z-other.position.z;
          distance=Math.min(distance,dx*dx+dz*dz);
        }
        if(distance>bestDistance){bestDistance=distance;best.copyFrom(candidate);}
      }
      position.copyFrom(best);
    };
    p.direction1 = new Vector3(-.35, .05, -.35); p.direction2 = new Vector3(.35, .2, .35); p.minEmitPower = .3; p.maxEmitPower = .6; p.gravity = Vector3.Zero();
    // The old direction × emit power barely moved a glow at gameplay zoom.
    // Steer each fly along its own wandering path while retaining Babylon's life/blink updates.
    const updateParticles=p.updateFunction.bind(p);
    p.updateFunction=(particles)=>{
      for(const fly of particles){
        const phase=fly.id*2.399963,age=fly.age;
        fly.direction.set(
          .65*Math.cos(age*.30+phase),
          .05*Math.cos(age*.45+phase),
          .65*Math.sin(age*.30+phase));
        // No object-keyed steering state: Babylon copies living particles into recycled objects.
        const speed=fly.direction.length();
        if(speed>.70)fly.direction.scaleInPlace(.70/speed);
      }
      updateParticles(particles);
      for(const fly of particles){
        const fade=Math.max(0,Math.min(1,fly.age/4,(fly.lifeTime-fly.age)/6));
        const envelope=fade*fade*(3-2*fade);
        fly.color.set(1,.91,.65,envelope);
      }
    };
    p.updateSpeed=1/60;
    p.color1=new Color4(1,.91,.65,0);p.color2=p.color1.clone();p.colorDead=new Color4(1,.91,.65,0);
    // Start with an established, age-staggered population rather than a sparse first minute.
    p.preWarmCycles = 600;p.preWarmStepOffset=2;
  }

  /**
   * The moon: a low key light, a little brighter and cooler than the generic night, with deep,
   * crisp cast shadows. Runs after the atmosphere each frame so its night settings stay overridden;
   * the day values are kept and restored when the map or time changes.
   */
  private moonlight(on: boolean): void {
    const sun = this.sun, shadows = this.shadows;
    if (!sun) return;
    if (on && !this.moonlit) {
      this.moonlit = true;
      this.daylight.direction.copyFrom(sun.direction); this.daylight.intensity = sun.intensity;
      this.daylight.diffuse.copyFrom(sun.diffuse); this.daylight.darkness = shadows?.darkness ?? .25;
    }
    if (on) {
      Vector3.LerpToRef(this.daylight.direction, MOON, this.level, sun.direction); sun.direction.normalize();
      sun.intensity = this.daylight.intensity + (.95 - this.daylight.intensity) * this.level;
      Color3.LerpToRef(this.daylight.diffuse, new Color3(.72, .82, 1), this.level, sun.diffuse);
      if (shadows) shadows.darkness = this.daylight.darkness + (.08 - this.daylight.darkness) * this.level;
    } else if (this.moonlit) {
      this.moonlit = false;
      sun.direction.copyFrom(this.daylight.direction); sun.intensity = this.daylight.intensity;
      sun.diffuse.copyFrom(this.daylight.diffuse); if (shadows) shadows.darkness = this.daylight.darkness;
    }
  }

  update(dt: number, active: boolean, focus: Vector3, sakura=false): void {
    this.sakuraLevel+=((active&&sakura?1:0)-this.sakuraLevel)*Math.min(1,dt*2);
    const paper=this.scene.getMaterialByName('sakura-paper') as StandardMaterial|null;
    if(paper)paper.emissiveColor.set(.32+this.sakuraLevel*.43,.20+this.sakuraLevel*.28,.08+this.sakuraLevel*.10);
    this.level += ((active ? 1 : 0) - this.level) * Math.min(1, dt * 2);
    if (!active && this.level < .01) this.level = 0;
    const on = this.level > 0;
    this.moonlight(on);
    this.emitter.copyFrom(focus);
    if (on && !this.fireflies.isStarted()) this.fireflies.start();
    if (!on && this.fireflies.isStarted()) this.fireflies.stop();
    this.fireflies.updateSpeed = dt > 0 ? 1/60 : 0;
    if (on && !this.depth) this.depth = new DepthRenderer(this.scene, Constants.TEXTURETYPE_FLOAT, this.camera, true, Constants.TEXTURE_NEAREST_SAMPLINGMODE);
    if (this.depth) this.depth.enabled = on;
    if (on !== this.graded) {
      this.graded = on;
      if (on) {
        // A directly constructed DepthRenderer is not scheduled by the scene automatically.
        this.depth!.getDepthMap().name='moon-firefly-depth';
        this.depth!.forceDepthWriteTransparentMeshes=true;
        this.camera.customRenderTargets.push(this.depth!.getDepthMap());
        this.camera.attachPostProcess(this.grade);
      } else {
        this.removeDepthTarget();
        this.camera.detachPostProcess(this.grade);
      }
    }
    // Every living fly contributes; no camera/player-distance ranking or cutoff.
    // Density is capped at the particle source instead of silently dropping lights.
    this.flyData.fill(0);
    if(on)this.fireflies.particles.forEach((q,i)=>{
      this.flyData[i*4]=q.position.x;this.flyData[i*4+1]=q.position.y;
      this.flyData[i*4+2]=q.position.z;this.flyData[i*4+3]=q.color.a;
    });
  }

  private removeDepthTarget():void {
    if(!this.depth)return;
    const index=this.camera.customRenderTargets.indexOf(this.depth.getDepthMap());
    if(index>=0)this.camera.customRenderTargets.splice(index,1);
  }

  dispose(): void {
    this.moonlight(false);
    this.glowTexture.dispose(); this.fireflies.dispose();
    this.grade.dispose();
    this.removeDepthTarget();
    this.depth?.getDepthMap().dispose();
    this.depth?.dispose();
  }
}
