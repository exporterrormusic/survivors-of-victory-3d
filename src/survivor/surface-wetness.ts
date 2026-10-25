import { type DirectionalLight, Material, type MaterialDefines, MaterialPluginBase, PBRMaterial,
  RegisterMaterialPlugin, type Scene, StandardMaterial, type UniformBuffer, Vector3 } from '@babylonjs/core';

interface WetState { amount: number; light: number; sun: Vector3 }
const states = new WeakMap<Scene,WetState>();

/** A thin wet coat on existing materials, after cel lighting and before fog. */
class WetSurface extends MaterialPluginBase {
  constructor(material: StandardMaterial | PBRMaterial, private readonly state: WetState) {
    super(material,'WeatherWetness',260,{ WEATHER_WETNESS: false },true,true);
    this.doNotSerialize=true;
  }
  override getClassName(): string { return 'WeatherWetness'; }
  override prepareDefines(defines: MaterialDefines): void {
    const material=this._material as StandardMaterial | PBRMaterial;
    (defines as MaterialDefines & { WEATHER_WETNESS: boolean }).WEATHER_WETNESS=
      !material.disableLighting && material.metadata?.anime!==false && material.metadata?.weatherWetness!==false;
  }
  override getUniforms() {
    return {
      ubo:[{name:'surfaceWetness',size:1,type:'float'},{name:'wetSurfaceLight',size:1,type:'float'},
        {name:'wetSurfaceSun',size:3,type:'vec3'}],
      fragment:'#ifdef WEATHER_WETNESS\nuniform float surfaceWetness;\nuniform float wetSurfaceLight;\nuniform vec3 wetSurfaceSun;\n#endif',
    };
  }
  override bindForSubMesh(buffer: UniformBuffer): void {
    const s=this.state;
    buffer.updateFloat('surfaceWetness',s.amount);buffer.updateFloat('wetSurfaceLight',s.light);
    buffer.updateFloat3('wetSurfaceSun',s.sun.x,s.sun.y,s.sun.z);
  }
  override getCustomCode(type: string): Record<string,string> | null {
    if(type!=='fragment')return null;
    const pbr=this._material instanceof PBRMaterial, color=pbr?'finalColor':'color', emission=pbr?'finalEmissive':'emissiveColor';
    return {CUSTOM_FRAGMENT_BEFORE_FOG:`
      #ifdef WEATHER_WETNESS
      if(surfaceWetness>.001) {
        vec3 wetNormal=normalize(normalW),wetView=normalize(viewDirectionW);
        float wetExposure=.45+.55*smoothstep(-.2,.75,wetNormal.y);
        float wetAmount=surfaceWetness*wetExposure;
        // Keep painted texture, cel contours and emissive reactor details intact.
        ${color}.rgb-=max(vec3(0.0),${color}.rgb-${emission})*(.065*wetAmount);
        float wetFacing=max(0.0,dot(wetNormal,normalize(wetView+wetSurfaceSun)));
        float wetHighlight=pow(wetFacing,48.0)*.075;
        vec3 wetReflection=reflect(-wetView,wetNormal);
        float wetSky=pow(max(0.0,dot(wetReflection,normalize(vec3(-.25,.72,.65)))),12.0)*.035;
        float wetGrain=.65+.35*sin(vPositionW.x*2.1+sin(vPositionW.z*1.3))*sin(vPositionW.z*1.9);
        #ifdef ANIME_TOON
          wetHighlight*=mix(.35,1.0,animeShadow);
        #endif
        ${color}.rgb+=vec3(.30,.47,.65)*(wetHighlight+wetSky)*wetGrain*wetAmount*wetSurfaceLight;
      }
      #endif
    `};
  }
}

function attach(material: Material): WetSurface | null {
  const state=states.get(material.getScene());
  return state&&(material instanceof StandardMaterial||material instanceof PBRMaterial)
    &&!material.pluginManager?.getPlugin('WeatherWetness')?new WetSurface(material,state):null;
}

export class SurfaceWetness {
  private readonly state: WetState={amount:0,light:1,sun:new Vector3(.4,1,-.3).normalize()};
  constructor(private readonly scene: Scene) {
    states.set(scene,this.state);RegisterMaterialPlugin('WeatherWetness',attach);
    for(const material of scene.materials)attach(material);
  }
  get amount(): number { return this.state.amount; }
  update(dt: number,rain: number,immediate=false): void {
    this.state.amount=rain>.001?(immediate?1:Math.min(1,this.state.amount+dt/1.5)):Math.max(0,this.state.amount-dt/90);
    const sun=this.scene.getLightByName('sun') as DirectionalLight | null;
    if(sun)this.state.sun.copyFrom(sun.direction).negateInPlace().normalize();
    this.state.light=Math.min(1.8,.55+(sun?.intensity??1)*.3);
  }
  dispose(): void { this.state.amount=0;states.delete(this.scene); }
}
