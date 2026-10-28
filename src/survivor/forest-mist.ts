import type { FxQuad } from './vfx';
import { forestPlacements } from './forest-layout';
import { ELEVATOR_YAW, SHAFT_HALF_WIDTH, ELEVATOR_ORIGIN } from './elevator-footprint';
import { Constants, DepthRenderer, Effect, Matrix, PostProcess, Vector3, type Camera, type Scene } from '@babylonjs/core';

// Integrate animated world-space fog along each visible camera ray. Depth stops
// the volume at geometry; the clear pocket follows the player, not the camera.
Effect.ShadersStore.forestVolumeFragmentShader = `
precision highp float;
varying vec2 vUV;
uniform sampler2D textureSampler;
// Nonlinear depth is close to 1 across most of the scene. A low-precision
// sampler quantizes it before reconstruction, creating block-shaped fog gaps.
uniform highp sampler2D forestDepth;
uniform mat4 inverseViewProjection;
uniform vec4 fogLights[32];
uniform vec3 fogColors[32];
uniform vec4 lanterns[16];
uniform vec3 cameraPosition;
uniform vec3 focus;
uniform float clock;
uniform float strength;
uniform float elevatorClearing;
uniform vec2 elevatorOrigin;
uniform vec2 texelSize;
// Rounded footprint with a broad feather, anchored to the lift rather than
// the player. Keep the floor clear, gradually restoring mist above the tower.
float elevatorFogScale(vec3 p){
 vec2 local=mat2(${Math.cos(ELEVATOR_YAW)},${Math.sin(ELEVATOR_YAW)},${-Math.sin(ELEVATOR_YAW)},${Math.cos(ELEVATOR_YAW)})*(p.xz-elevatorOrigin);
 vec2 edge=abs(local)-vec2(${SHAFT_HALF_WIDTH - .6});
 float roundedDistance=length(max(edge,vec2(0.0)))+min(max(edge.x,edge.y),0.0)-.6;
 float footprint=1.0-smoothstep(0.0,2.5,roundedDistance);
 float nearFloor=1.0-smoothstep(1.0,5.0,p.y);
 return 1.0-.7*elevatorClearing*footprint*nearFloor;
}
float hash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
float noise(vec3 p){
 vec3 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
 return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
 mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);
}
// A shared projected canopy mask connects the moon shafts to their moving
// pools of light. Its coordinates stay anchored in the world during camera motion.
float canopy(vec3 p){
 vec2 q=p.xz+p.y*vec2(.588,.353);
 q+=vec2(sin(clock*.24+q.y*.09),cos(clock*.19+q.x*.08))*.32;
 float openings=noise(vec3(q*.21,4.7));
 return smoothstep(.47,.72,openings);
}
// Bright saturated light survives scattering better than diffuse scenery.
vec3 emission(vec3 color){
 float peak=max(color.r,max(color.g,color.b));
 float chroma=peak-min(color.r,min(color.g,color.b));
 return color*max(smoothstep(.26,.65,peak)*smoothstep(.10,.35,chroma),smoothstep(.58,.92,peak));
}
void main(){
 vec4 source=texture2D(textureSampler,vUV);
 float depth=texture2D(forestDepth,vUV).r;
 vec4 hit=inverseViewProjection*vec4(vUV*2.0-1.0,depth*2.0-1.0,1.0);
 vec3 surface=hit.xyz/hit.w;
 vec3 ray=surface-cameraPosition;
 float lengthRay=min(length(ray),90.0);
 vec3 direction=normalize(ray);
 // Spend the ray samples inside the ground layer, not in the empty air above it.
 // A fixed world height keeps mist on the forest floor while the lift moves.
 float safeY=abs(direction.y)<.0001 ? .0001 : direction.y;
 float a=(-.3-cameraPosition.y)/safeY;
 float b=(4.5-cameraPosition.y)/safeY;
 float enter=max(0.0,min(a,b));
 float leave=min(lengthRay,max(a,b));
 float span=max(0.0,leave-enter);
 vec3 scatteredLight=vec3(0.0);
 float optical=0.0;
 float bankLight=0.0;
 float stepSize=span/20.0;
 for(int i=0;i<20;i++){
  vec3 p=cameraPosition+direction*(enter+(float(i)+.5)*stepSize);
  // Two differently moving scales bend the ribbons into rolling, evolving wisps.
  vec3 flow=vec3(p.x*.16-clock*.38,p.y*.55,p.z*.42+clock*.3);
  float warp=noise(flow*.6+vec3(0.0,clock*.16,3.1));
  flow.xz+=vec2(sin(flow.z*1.2+warp*4.0+clock*.4),cos(flow.x+warp*3.0-clock*.3))*1.1;
  float billow=noise(flow+vec3(warp*1.7,0.0,warp));
  float detail=noise(flow*2.4+vec3(clock*.2,2.0,-clock*.26));
  // A thick floor everywhere so there are no bare holes; billows add rolling humps on top.
  float bank=.55+.45*smoothstep(.2,.75,billow*.72+detail*.28);
  float top=.8+billow*.7+detail*.2;
  float heightMask=(1.0-smoothstep(top*.15,top,p.y))*smoothstep(-.3,.05,p.y);
  float clearing=.8;
  // Slow connected banks occasionally rise around distant trunks; the
  // faster low ribbons remain present between them instead of blinking off.
  float broad=noise(vec3(p.x*.085-clock*.032,1.9,p.z*.12+clock*.022));
  float farBank=smoothstep(.43,.66,broad)*.6;
  float raised=(1.0-smoothstep(.7,3.8,p.y))*smoothstep(-.3,.05,p.y);
  float density=(bank*heightMask*(.72+farBank*.55)+farBank*raised*.58)*clearing;
  optical+=density*stepSize*1.35;
  bankLight+=density*billow*stepSize;

 }
 // Approximate local scattering at the closest point of the visible fog ray.
 // A source illuminates nearby mist even when its center is occluded or offscreen.
 // Testing depth at that single point makes the whole glow pop off, including
 // when the enemy's own armor hides it. Clamping the ray at a trunk or wall in
 // front of the source made its glow vanish, so the glow may reach past the
 // surface and fade softly with how far behind it the source sits.
 float layerLeave=min(90.0,max(a,b));
 float mist=max(1.0-exp(-optical),.45);
 for(int j=0;j<32;j++){
  float along=clamp(dot(fogLights[j].xyz-cameraPosition,direction),enter,max(enter,layerLeave));
  vec3 nearest=cameraPosition+direction*along;
  vec3 delta=nearest-fogLights[j].xyz;
  float low=1.0-smoothstep(.8,3.8,nearest.y);
  float behind=exp(-max(0.0,along-lengthRay)*.18);
  scatteredLight+=fogColors[j]*fogLights[j].w*exp(-dot(delta,delta)*.38)*max(low,.22)*mist*behind*.8;
 }
 float range=distance(surface.xz,focus.xz);
 // Even across the frame: distance-from-player ramps read as a blurred vignette.
 float distant=0.0;

 // Cold full-moon grade belongs only to this forest pass. Preserve anime
 // contrast while suppressing warm green daylight in the ground textures.
 float luminance=dot(source.rgb,vec3(.2126,.7152,.0722));
 vec3 moonlit=mix(vec3(luminance),source.rgb,.52)*vec3(.49,.62,.84);
 moonlit*=.98;
 vec3 darkScene=mix(source.rgb,moonlit,clamp(strength/ .60,0.0,1.0));
 darkScene*=1.0-distant*.30*strength;
 float moonPool=canopy(surface);
 float groundWeight=1.0-smoothstep(.2,2.2,surface.y);
 darkScene*=1.0-(1.0-moonPool)*groundWeight*.24*strength;
 darkScene+=vec3(.065,.09,.14)*moonPool*groundWeight*strength;
 // Restrained moon shafts, integrated only up to the visible geometry.
 float shafts=0.0;
 float aerialOptical=0.0;
 float shaftStep=lengthRay/12.0;
 for(int i=0;i<12;i++){
  vec3 p=cameraPosition+direction*(float(i)+.5)*shaftStep;
  float heightFade=smoothstep(-.2,.4,p.y)*(1.0-smoothstep(6.0,12.0,p.y));
  float localFade=.7;
  shafts+=canopy(p)*heightFade*localFade*shaftStep*.025;
  // Thin continuous atmosphere bridges ground banks and tall canopies. Unlike
  // ground mist it has no ceiling, so upper branches cannot pop out of the fog.
  float far=.35;
  float bank=noise(vec3(p.x*.085-clock*.032,1.9,p.z*.12+clock*.022));
  float heightDensity=exp(-max(p.y,0.0)*.035);
  aerialOptical+=(.018+bank*.035)*far*heightDensity*shaftStep;
 }
 float fog=1.0-exp(-(optical+aerialOptical+distant*.42)*strength);
 // Scale opacity after integration so even dense banks fall to 30% over
 // the floor, including mist lying between the camera and the platform.
 float elevatorScale=elevatorFogScale(surface);
 fog*=elevatorScale;
 float groundCurl=clamp(bankLight/max(optical/1.35,.001),0.0,1.0);
 float curl=mix(.48,groundCurl,smoothstep(0.0,.3,optical));
 vec3 fogColor=mix(vec3(.085,.135,.21),vec3(.18,.25,.34),curl);

 vec3 light=emission(source.rgb);
 vec3 halo=vec3(0.0);
 for(int i=0;i<8;i++){
  float angle=float(i)*.785398;
  vec2 uv=vUV+vec2(cos(angle),sin(angle))*texelSize*5.0;
  float neighborDepth=texture2D(forestDepth,uv).r;
  // Reject scattering across a foreground silhouette (walls, trunks, the player).
  float visible=1.0-smoothstep(.0001,.0015,neighborDepth-depth);
  halo+=emission(texture2D(textureSampler,uv).rgb)*visible;
 }
 vec3 result=mix(darkScene,fogColor,fog);
 // Steady ghost-green pools with a slow, irregular breathing flame. Evaluate
 // at the visible surface so road light never paints through a foreground wall.
 for(int i=0;i<16;i++){
  vec3 lamp=lanterns[i].xyz;
  float pulse=abs(lanterns[i].w)*(.88+.08*sin(clock*1.7+lamp.x)+.04*sin(clock*3.1+lamp.z));
  vec3 delta=surface-lamp;
  float pool=exp(-dot(delta.xz,delta.xz)*.13)*exp(-abs(surface.y)*.8);
  vec3 nearest=cameraPosition+direction*clamp(dot(lamp-cameraPosition,direction),0.0,lengthRay);
  float haze=exp(-dot(nearest-lamp,nearest-lamp)*.7);
  // A negative weight marks a lamp burning red (the easter-egg lamp once struck).
  vec3 ghost=lanterns[i].w<0.0?vec3(1.,.08,.05):vec3(.12,.85,.56);
  result+=ghost*pulse*strength*(pool*.55*(1.0-fog*.5)+haze*.32*fog)*elevatorScale;
 }
 result+=(vec3(1.0)-exp(-scatteredLight))*strength*elevatorScale;
 result+=vec3(.20,.31,.47)*(1.0-exp(-shafts))*strength*(1.0-fog*.45)*elevatorScale;
 // Keep hot white laser/explosion cores readable as well as saturated lights.
 float transmission=mix(1.0,.78,fog);
 result=mix(result,max(result,source.rgb*transmission),clamp(max(light.r,max(light.g,light.b)),0.0,1.0));
 result+=halo*.125*fog*.65;
 gl_FragColor=vec4(result,source.a);
}`;

// Shader slots: the closest enemies first, then the brightest additive effects.
const LIGHT_SLOTS = 32, ENEMY_LIGHTS = 24;

export class ForestMist {
  private readonly depth: DepthRenderer;
  private readonly pass: PostProcess;
  private readonly inverse = Matrix.Identity();
  private readonly focus = new Vector3();
  private readonly lightData = new Array<number>(128).fill(0);
  private readonly lightColors = new Array<number>(96).fill(0);
  private readonly lanternData = new Array<number>(64).fill(0);
  private readonly lanternPositions = forestPlacements().filter(p=>p.asset==='forest-lamp').map(p=>
    new Vector3(p.x+Math.cos(p.yaw)*.55*p.scale,1.72*p.scale,p.z-Math.sin(p.yaw)*.55*p.scale));
  /** One lantern's ghost-light scaled by `factor` (the easter-egg lamp's flicker). */
  readonly dim = { at: null as Vector3 | null, factor: 1, red: false };
  private clock = 0;
  private strength = 0;
  private enabled = false;
  constructor(private readonly scene: Scene, private readonly camera: Camera, elevatorClearing = false) {
    // Separate depth target leaves the existing anime/AO pipeline's depth untouched.
    // Interpolated depth invents surfaces between silhouettes and the floor.
    this.depth = new DepthRenderer(scene, Constants.TEXTURETYPE_FLOAT, camera, true, Constants.TEXTURE_NEAREST_SAMPLINGMODE);
    // Keep fading scenery in the fog depth pass when it changes render queues;
    // otherwise its fog silhouette switches instantly at the first faded frame.
    this.depth.forceDepthWriteTransparentMeshes = true;
    this.depth.getDepthMap().name = 'forest-volume-depth';
    // See-through figures (the easter-egg ghost) would cut a hard silhouette out of the mist.
    this.depth.getDepthMap().renderListPredicate = mesh => !mesh.metadata?.skipFogDepth;
    this.pass = new PostProcess('forest-volume', 'forestVolume',
      ['inverseViewProjection','fogLights','fogColors','lanterns','cameraPosition','focus','clock','strength','texelSize','elevatorClearing','elevatorOrigin'], ['forestDepth'], 1, null,
      Constants.TEXTURE_BILINEAR_SAMPLINGMODE, scene.getEngine(), false);
    this.pass.onApply = effect => {
      scene.getTransformMatrix().invertToRef(this.inverse);
      effect.setMatrix('inverseViewProjection',this.inverse);
      effect.setArray4('fogLights',this.lightData);
      effect.setArray3('fogColors',this.lightColors);
      effect.setArray4('lanterns',this.lanternData);
      effect.setVector3('cameraPosition',camera.globalPosition);
      effect.setVector3('focus',this.focus);
      effect.setFloat2('texelSize',1 / this.pass.width,1 / this.pass.height);
      effect.setFloat('clock',this.clock);effect.setFloat('strength',this.strength);
      effect.setFloat('elevatorClearing',elevatorClearing ? 1 : 0);
      effect.setFloat2('elevatorOrigin',ELEVATOR_ORIGIN.x,ELEVATOR_ORIGIN.z);
      effect.setTexture('forestDepth',this.depth.getDepthMap());
    };
  }
  setLights(lights: readonly {position:Vector3;alive:boolean;radius:number}[], focus:Vector3, effects: readonly FxQuad[] = []):void {
    this.lightData.fill(0);this.lightColors.fill(0);
    if(!this.enabled)return;
    // Cap cost independently of horde size; choose the closest live sources.
    const nearby=lights.filter(light=>light.alive).sort((a,b)=>
      Vector3.DistanceSquared(a.position,focus)-Vector3.DistanceSquared(b.position,focus)).slice(0,ENEMY_LIGHTS);
    nearby.forEach((light,i)=>{
      this.lightData.splice(i*4,4,light.position.x,light.position.y+Math.max(.6,light.radius),light.position.z,1);
      this.lightColors.splice(i*3,3,.65,.025,.045);
    });
    const glowing=effects.filter(q=>q.busy&&q.visible&&q.alpha>.025&&q.blend==='add')
      .sort((a,b)=>b.alpha*Math.min(8,b.scaling.x*b.scaling.y)-a.alpha*Math.min(8,a.scaling.x*a.scaling.y)).slice(0,LIGHT_SLOTS-ENEMY_LIGHTS);
    let slot=ENEMY_LIGHTS;
    for(const q of glowing){
      if(slot>=LIGHT_SLOTS)break;
      const beam=!q.billboard&&['streak','lance','tongue'].includes(q.texture)&&q.scaling.x>4;
      const samples=beam?Math.min(3,LIGHT_SLOTS-slot):1;
      for(let sample=0;sample<samples;sample++){
        const t=samples===1?.5:(sample+.5)/samples;
        const c=q.corners;
        const x=beam?(c[0]+c[9])*.5*(1-t)+(c[3]+c[6])*.5*t:q.position.x;
        const y=beam?(c[1]+c[10])*.5*(1-t)+(c[4]+c[7])*.5*t:q.position.y;
        const z=beam?(c[2]+c[11])*.5*(1-t)+(c[5]+c[8])*.5*t:q.position.z;
        this.lightData.splice(slot*4,4,x,y,z,q.alpha);
        this.lightColors.splice(slot*3,3,q.color.r*.9,q.color.g*.9,q.color.b*.9);
        slot++;
      }
    }
  }
  update(clock:number,strength:number,focus:Vector3):void {
    this.clock=clock;this.strength=strength;this.focus.copyFrom(focus);
    this.lanternData.fill(0);
    [...this.lanternPositions].sort((a,b)=>Vector3.DistanceSquared(a,focus)-Vector3.DistanceSquared(b,focus)).slice(0,16).forEach((p,i)=>{
      const distance=Vector3.Distance(p,focus);
      // Fade distant sources before they leave the bounded light budget.
      let weight=Math.max(0,Math.min(1,(28-distance)/10));
      if(this.dim.at&&Vector3.DistanceSquared(p,this.dim.at)<1)weight*=this.dim.red?-this.dim.factor:this.dim.factor;
      this.lanternData.splice(i*4,4,p.x,p.y,p.z,weight);
    });
    const enabled=strength>.001;
    if(enabled){
      // DepthRenderer creates a fixed-size target; keep it aligned after a
      // window resize or a change to the game's rendering resolution.
      const engine=this.scene.getEngine(),map=this.depth.getDepthMap(),size=map.getSize();
      const width=engine.getRenderWidth(),height=engine.getRenderHeight();
      if(size.width!==width||size.height!==height)map.resize({width,height});
    }
    if(enabled===this.enabled)return;
    this.enabled=enabled;
    // Scene targets run before active-mesh evaluation and reuse last frame's
    // visible meshes. Camera targets run after evaluation/skinning, keeping fog
    // depth in sync with fast dodges, camera movement and transient afterimages.
    if(enabled){this.camera.customRenderTargets.push(this.depth.getDepthMap());this.camera.attachPostProcess(this.pass);}
    else {this.camera.detachPostProcess(this.pass);this.removeDepthTarget();}
  }
  private removeDepthTarget():void {
    const index=this.camera.customRenderTargets.indexOf(this.depth.getDepthMap());
    if(index>=0)this.camera.customRenderTargets.splice(index,1);
  }
  dispose():void {this.removeDepthTarget();this.pass.dispose(this.camera);this.depth.dispose();}
}
