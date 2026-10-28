import { Color3, MaterialPluginBase, ShaderMaterial, StandardMaterial, Texture, type BaseTexture, type Scene, type UniformBuffer } from '@babylonjs/core';

export const CALDERA_TEXTURE_ROOT=`${import.meta.env.BASE_URL}environment/caldera-v1/`;
export function calderaTexture(scene:Scene,name:string):Texture {
  const url=CALDERA_TEXTURE_ROOT+name;
  const cached=scene.textures.find(t=>t.name===url);if(cached)return cached as Texture;
  const t=new Texture(url,scene);t.anisotropicFilteringLevel=8;return t;
}

/** World projection keeps large cliffs and small boulders at the same texture scale. */
class BasaltSurface extends MaterialPluginBase {
  constructor(material:StandardMaterial,private basalt:Texture,private ash:Texture){super(material,'CalderaBasalt',185,{},true,true);}
  override getSamplers(names:string[]):void{names.push('calderaBasalt','calderaAsh');}
  override isReadyForSubMesh():boolean{return this.basalt.isReady()&&this.ash.isReady();}
  override bindForSubMesh(ubo:UniformBuffer):void{ubo.setTexture('calderaBasalt',this.basalt);ubo.setTexture('calderaAsh',this.ash);}
  override getActiveTextures(textures:BaseTexture[]):void{textures.push(this.basalt,this.ash);}
  override hasTexture(t:BaseTexture):boolean{return t===this.basalt||t===this.ash;}
  override getCustomCode(type:string):Record<string,string>|null {
    if(type!=='fragment')return null;
    return {CUSTOM_FRAGMENT_DEFINITIONS:`uniform sampler2D calderaBasalt;uniform sampler2D calderaAsh;${lavaNoiseGLSL}`,
      CUSTOM_FRAGMENT_UPDATE_DIFFUSE:`
        vec3 cw=pow(abs(normalize(vNormalW)),vec3(4.));cw/=max(.001,cw.x+cw.y+cw.z);
        vec3 cp=vPositionW*.19;
        vec3 cb=texture2D(calderaBasalt,cp.zy).rgb*cw.x+texture2D(calderaBasalt,cp.xz).rgb*cw.y+texture2D(calderaBasalt,cp.xy).rgb*cw.z;
        float band=.5+.5*sin(vPositionW.y*2.7+sin(vPositionW.x*.35)*1.6+sin(vPositionW.z*.6));
        float ca=smoothstep(.55,.94,normalW.y)*(.13+.14*band);
        vec3 ash=texture2D(calderaAsh,vPositionW.xz*.23).rgb;
        ash=mix(ash,vec3(dot(ash,vec3(.299,.587,.114))),.6);
        baseColor.rgb=mix(cb*mix(vec3(.74,.71,.69),vec3(.9,.8,.72),band*.6),ash*.8,ca);
      `};
  }
}

export function calderaRockMaterial(scene:Scene):StandardMaterial {
  const cached=scene.getMaterialByName('caldera-weathered-basalt');if(cached)return cached as StandardMaterial;
  const m=new StandardMaterial('caldera-weathered-basalt',scene);m.metadata={softEnvironment:true};
  m.specularColor.set(.075,.07,.065);m.specularPower=28;
  new BasaltSurface(m,calderaTexture(scene,'basalt.webp'),calderaTexture(scene,'ash.webp'));
  return m;
}

export const lavaNoiseGLSL=`
 float chash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
 float cnoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(chash(i),chash(i+vec2(1,0)),f.x),mix(chash(i+vec2(0,1)),chash(i+vec2(1,1)),f.x),f.y);}
 vec3 flowingLava(sampler2D tex,vec2 uv,float clock,vec2 direction){
   // Continuous advection: direction is the direction features travel in UV space.
   vec2 q=uv-direction*clock*.10;
   vec2 distortion=vec2(cnoise(q*2.),cnoise(q*2.+8.))-.5;
   vec3 detail=texture2D(tex,q+distortion*.18).rgb;
   float rafts=cnoise(q*5.+distortion*2.);
   float seams=1.-smoothstep(.035,.13,abs(rafts-.51));
   return mix(detail*.52,vec3(1.,.43,.025),seams*.85);
 }
 // Lava-sea shoreline, mirrored by calderaShoreDepth(): slowly drifting lobes, and an inward advance.
 float calderaShoreDepth(vec2 p,float clock,float advance){
   vec2 drift=vec2(clock*.011,-clock*.007);
   float lobes=(cnoise(p*.11+drift)-.5)*4.2+(cnoise(p*.37+3.-drift*1.7)-.5)*1.6+(cnoise(p*1.3+drift*3.)-.5)*.5;
   float a=atan(p.y,p.x);
   return length(p)-(45.5+1.1*sin(a*5.)+.6*sin(a*11.)-advance)+lobes;
 }
 vec2 crackHash(vec2 p){return vec2(chash(p),chash(p+vec2(71.2,19.8)));}
 float crackSeam(vec2 p){vec2 i=floor(p),f=fract(p);float d1=8.,d2=8.;
 for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){vec2 g=vec2(x,y),r=g+crackHash(i+g)-f;float d=dot(r,r);if(d<d1){d2=d1;d1=d;}else if(d<d2)d2=d;}
 return sqrt(d2)-sqrt(d1);}
 vec3 lavaColor(vec3 tex,float heat){
   float molten=clamp((tex.r-tex.b)*1.9,0.,1.);
   vec3 crust=vec3(.047,.044,.046)+vec3(dot(tex,vec3(.299,.587,.114))*.10);
   vec3 fire=mix(vec3(.9,.065,.006),vec3(1.6,.65,.10),smoothstep(.35,.85,tex.g/max(.01,tex.r)));
   return mix(crust,fire,molten*heat);
 }
 vec3 calderaFog(vec3 color,vec3 worldPos,vec3 eye,vec3 fogColor,float density){
   float transmission=exp(-pow(length(worldPos-eye)*density,2.));
   return mix(fogColor,color,transmission);
 }`;

/** `bank`: 0 none, 1 lava sea (ragged, drifting, advancing world-space shoreline). */
export function createCalderaLava(scene:Scene,name:string,scale=1,channel=false,bank=0):ShaderMaterial {
  const m=new ShaderMaterial(name,scene,{vertexSource:`precision highp float;
    attribute vec3 position;attribute vec2 uv;uniform mat4 world,worldViewProjection;uniform float time,channel;varying vec2 vUV;varying vec3 vWorld;
    void main(){vUV=uv;vec3 p=position;
    float bank=sin(clamp(uv.x,0.,1.)*3.14159);
    p.y+=channel*bank*.045*sin(uv.y*12.+time*1.2);
    vWorld=(world*vec4(p,1.)).xyz;gl_Position=worldViewProjection*vec4(p,1.);}`,
    fragmentSource:`precision highp float;varying vec2 vUV;varying vec3 vWorld;
    uniform sampler2D lavaTex;uniform float time,heat,scale,fogDensity,channel,bankMode,advance;uniform vec3 eye,fogColor;${lavaNoiseGLSL}
    void main(){vec3 t=flowingLava(lavaTex,vUV*scale,time,vec2(.1,-1.));vec3 color=lavaColor(t,heat);
    float bank=smoothstep(.0,.12,vUV.x)*smoothstep(.0,.12,1.-vUV.x);
    color=mix(vec3(.055,.045,.048),color,mix(1.,bank,channel));
    // Lava skins over where it meets cold ground: a dark crust edge with a bright hot seam inside it.
    if(bankMode>.5){
      // The advancing front: a hot lip that pulses, then cooling skins that drift and break up behind it.
      float metres=calderaShoreDepth(vWorld.xz,time,advance);
      if(metres<0.)discard;
      float pulse=.8+.2*sin(time*1.7+cnoise(vWorld.xz*.4)*9.);
      float lip=1.-smoothstep(0.,.7,metres);
      float skins=smoothstep(.48,.62,cnoise(vWorld.xz*.55+vec2(time*.04,time*.025)))*smoothstep(.4,1.,metres)*(1.-smoothstep(1.5,4.,metres));
      color=mix(color,vec3(.06,.035,.03),skins*.85);
      color=mix(color,vec3(1.5,.62,.12)*pulse,lip*.85);
    }
    gl_FragColor=vec4(calderaFog(color,vWorld,eye,fogColor,fogDensity),1.);}`},
    {attributes:['position','uv'],uniforms:['world','worldViewProjection','time','heat','scale','eye','fogColor','fogDensity','channel','bankMode','advance'],samplers:['lavaTex']});
  m.setTexture('lavaTex',calderaTexture(scene,'lava.webp'));m.setFloat('scale',scale);m.setFloat('heat',1);m.setFloat('time',0);m.setFloat('channel',channel?1:0);m.setFloat('bankMode',bank);m.setFloat('advance',0);
  m.onBindObservable.add(()=>{const camera=scene.activeCamera;if(camera)m.setVector3('eye',camera.globalPosition);m.setColor3('fogColor',scene.fogColor);m.setFloat('fogDensity',scene.fogEnabled?scene.fogDensity:0);});
  return m;
}
