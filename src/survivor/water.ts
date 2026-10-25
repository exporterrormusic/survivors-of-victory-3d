import { type AbstractMesh, type BaseTexture, type Camera, Color4, Constants, type DirectionalLight,
  MaterialPluginBase, Matrix, MirrorTexture, type Observer, Plane, type Scene, StandardMaterial,
  type UniformBuffer, Vector3 } from '@babylonjs/core';

export const WATER_PRESETS = { auto: 'Weather driven', wet: 'Wet ground preview', off: 'Off' } as const;
export type WaterPreset = keyof typeof WATER_PRESETS;

/** Old puddle/lake preferences now preview the same walkable wet ground. */
export function normalizeWaterPreset(value: string | null): WaterPreset {
  if(value==='puddles'||value==='lakes')return 'wet';
  return value && Object.hasOwn(WATER_PRESETS,value) ? value as WaterPreset : 'auto';
}

interface ReflectionState {
  amount: number;
  clock: number;
  light: number;
  flash: number;
  viewProjection: Matrix;
  sun: Vector3;
  reflection: MirrorTexture;
}

/** A thin reflective coat in the actual lit floor; there is no water plane or shoreline. */
class GroundReflection extends MaterialPluginBase {
  constructor(material: StandardMaterial, private readonly state: ReflectionState) {
    super(material,'GroundWetReflection',265,{},true,true);
    this.doNotSerialize=true;
  }
  override getClassName(): string { return 'GroundWetReflection'; }
  override getSamplers(samplers: string[]): void { samplers.push('groundWetMirror'); }
  override getActiveTextures(textures: BaseTexture[]): void { textures.push(this.state.reflection); }
  override hasTexture(texture: BaseTexture): boolean { return texture===this.state.reflection; }
  override getUniforms() {
    return {
      ubo:[{name:'groundWetAmount',size:1,type:'float'},{name:'groundWetClock',size:1,type:'float'},
        {name:'groundWetLight',size:1,type:'float'},{name:'groundWetFlash',size:1,type:'float'},
        {name:'groundWetGamma',size:1,type:'float'},{name:'groundWetSun',size:3,type:'vec3'},
        {name:'groundWetViewProjection',size:16,type:'mat4'}],
      fragment:`uniform float groundWetAmount,groundWetClock,groundWetLight,groundWetFlash,groundWetGamma;
        uniform vec3 groundWetSun;
        uniform mat4 groundWetViewProjection;`,
    };
  }
  override bindForSubMesh(buffer: UniformBuffer): void {
    const s=this.state;
    buffer.setTexture('groundWetMirror',s.reflection);
    buffer.updateFloat('groundWetAmount',s.amount);buffer.updateFloat('groundWetClock',s.clock);
    buffer.updateFloat('groundWetLight',s.light);buffer.updateFloat('groundWetFlash',s.flash);
    buffer.updateFloat('groundWetGamma',s.reflection.gammaSpace?1:0);
    buffer.updateFloat3('groundWetSun',s.sun.x,s.sun.y,s.sun.z);
    buffer.updateMatrix('groundWetViewProjection',s.viewProjection);
  }
  override getCustomCode(type: string): Record<string,string> | null {
    if(type!=='fragment')return null;
    return {
      CUSTOM_FRAGMENT_DEFINITIONS:`
        uniform sampler2D groundWetMirror;
        float groundWetHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
        float groundWetNoise(vec2 p) {
          vec2 i=floor(p),f=fract(p);
          f=f*f*f*(f*(f*6.0-15.0)+10.0);
          return mix(mix(groundWetHash(i),groundWetHash(i+vec2(1.,0.)),f.x),
            mix(groundWetHash(i+vec2(0.,1.)),groundWetHash(i+vec2(1.)),f.x),f.y);
        }
      `,
      CUSTOM_FRAGMENT_BEFORE_FOG:`
        if(groundWetAmount>.001) {
          vec2 wetWorld=vPositionW.xz;
          // Fixed, broad 6-18 metre variations; no threshold, border or isolated pools.
          float wetPattern=groundWetNoise(wetWorld*.075+vec2(3.2,7.4))*.7
            +groundWetNoise(mat2(.8,-.6,.6,.8)*wetWorld*.16)*.3;
          // Broad fades with denser interiors: quiet ground between stronger reflections.
          // The wide ramp and continuous noise keep this from outlining separate pools.
          float wetPatch=smoothstep(.15,.85,wetPattern);
          float wetStone=rangeStoneCoverage;
          vec2 wetSlope=vec2(sin(wetWorld.x*.9+groundWetClock*.3),
            cos(wetWorld.y*1.1-groundWetClock*.25))*mix(.012,.003,wetPatch);
          vec3 groundWetNormal=normalize(normalW+vec3(wetSlope.x,0.,wetSlope.y));
          vec3 groundWetView=normalize(viewDirectionW);
          vec3 groundWetRay=reflect(-groundWetView,groundWetNormal);
          float wetFresnel=pow(1.0-max(0.0,dot(groundWetNormal,groundWetView)),3.0);
          vec2 wetSkyUV=groundWetRay.xz/(max(.15,groundWetRay.y)+.35);
          float wetCloud=groundWetNoise(wetSkyUV*3.0+groundWetClock*.008);
          vec3 wetSkyColor=mix(vec3(.07,.16,.27),vec3(.28,.43,.58),wetCloud);
          // Use the same lightning pulse as the world lighting, before fog and grading.
          wetSkyColor=mix(wetSkyColor,vec3(.72,.82,.95),clamp(groundWetFlash*.65,0.0,1.0))*groundWetLight;
          vec4 wetClip=groundWetViewProjection*vec4(vPositionW,1.0);
          vec2 wetUV=wetClip.xy/wetClip.w*.5+.5+wetSlope*.012;
          vec4 wetMirror=texture2D(groundWetMirror,clamp(wetUV,vec2(.001),vec2(.999)));
          wetMirror.rgb=mix(wetMirror.rgb,pow(max(wetMirror.rgb,vec3(0.)),vec3(2.2)),groundWetGamma);
          // Polished wet stone carries a strong reflection; moss/soil stay restrained.
          // Density varies over broad patches, independently of the paving's texture.
          float wetCoat=groundWetAmount*mix(.025+.25*wetPatch,.20+.50*wetPatch,wetStone)*(.9+.1*wetFresnel);
          color.rgb=mix(color.rgb,wetSkyColor,wetCoat);
          float wetActorCoat=groundWetAmount*mix(.12+.50*wetPatch,.45+.50*wetPatch,wetStone)*wetMirror.a;
          color.rgb=mix(color.rgb,wetMirror.rgb,wetActorCoat);
          float groundWetShine=pow(max(0.0,dot(groundWetNormal,normalize(groundWetView+groundWetSun))),70.0);
          color.rgb+=vec3(.35,.49,.65)*groundWetShine*.12*groundWetAmount*groundWetLight*(.15+.85*wetPatch)*mix(.3,1.0,wetStone);
        }
      `,
    };
  }
}

/** Scene-wide floor reflections. Purely visual: walking, dashing and navigation stay unchanged. */
export class WaterLayer {
  readonly reflection: MirrorTexture;
  private readonly state: ReflectionState;
  private readonly plugin: GroundReflection;
  private readonly onSceneDispose: Observer<Scene> | null;
  private mode: WaterPreset='auto';
  private active=false;
  private disposed=false;
  constructor(private readonly scene: Scene,private readonly camera: Camera) {
    this.reflection=new MirrorTexture('wet-ground-reflections',512,scene,false,Constants.TEXTURETYPE_UNSIGNED_BYTE);
    this.reflection.mirrorPlane=new Plane(0,-1,0,0);
    this.reflection.clearColor=new Color4(0,0,0,0);
    this.reflection.activeCamera=camera;this.reflection.refreshRate=2;
    this.reflection.renderListPredicate=(mesh:AbstractMesh)=>!!(mesh.skeleton||mesh.bakedVertexAnimationManager)&&mesh.isEnabled();
    this.state={amount:0,clock:0,light:1,flash:0,viewProjection:new Matrix(),sun:new Vector3(.4,1,-.3).normalize(),reflection:this.reflection};
    const ground=scene.getMaterialByName('range-ground-mat');
    if(!(ground instanceof StandardMaterial))throw new Error('Wet ground requires the test-range floor material');
    this.plugin=new GroundReflection(ground,this.state);
    this.onSceneDispose=scene.onDisposeObservable.addOnce(()=>this.dispose());
    this.update(0,0);
  }
  get enabled(): boolean { return this.mode!=='off'; }
  get preset(): WaterPreset { return this.mode; }
  get amount(): number { return this.state.amount; }
  setPreset(preset: WaterPreset): void {
    this.mode=preset;
    if(preset==='off')this.state.amount=0;
    if(preset==='wet')this.state.amount=1;
    this.update(0,0,this.state.flash);
  }
  update(dt: number,rain: number,flash=0): void {
    if(this.disposed)return;
    const s=this.state;
    s.clock+=dt;
    if(this.mode==='off')s.amount=0;
    else if(this.mode==='wet')s.amount=1;
    else s.amount=rain>.001?Math.min(1,s.amount+dt/1.5):Math.max(0,s.amount-dt/90);
    s.flash=flash;
    const active=s.amount>.001;
    if(active!==this.active) {
      this.active=active;
      if(active){this.scene.customRenderTargets.push(this.reflection);this.reflection.resetRefreshCounter();}
      else {const i=this.scene.customRenderTargets.indexOf(this.reflection);if(i>=0)this.scene.customRenderTargets.splice(i,1);}
    }
    // Reflected actors must follow a strike on the same frame as their real counterparts.
    const refresh=flash>.001?1:2;
    if(this.reflection.refreshRate!==refresh){this.reflection.refreshRate=refresh;this.reflection.resetRefreshCounter();}
    this.camera.getViewMatrix().multiplyToRef(this.camera.getProjectionMatrix(),s.viewProjection);
    const sun=this.scene.getLightByName('sun') as DirectionalLight | null;
    if(sun)s.sun.copyFrom(sun.direction).negateInPlace().normalize();
    s.light=Math.min(2.5,.5+(sun?.intensity??1)*.4);
  }
  dispose(): void {
    if(this.disposed)return;this.disposed=true;this.state.amount=0;
    this.scene.onDisposeObservable.remove(this.onSceneDispose);
    const i=this.scene.customRenderTargets.indexOf(this.reflection);if(i>=0)this.scene.customRenderTargets.splice(i,1);
    this.plugin.dispose();this.reflection.dispose();
  }
}

