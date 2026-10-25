import { MaterialPluginBase, type BaseTexture, type StandardMaterial, type Texture, type UniformBuffer } from '@babylonjs/core';

/** Opaque surface mixing avoids cap silhouettes and transparent sorting seams. */
export class RockSurface extends MaterialPluginBase {
  constructor(material:StandardMaterial,private cover:Texture,snow:boolean){
    super(material,'RockSurface',180,{ROCK_SNOW:snow},true,true);
  }
  override isReadyForSubMesh():boolean{return this.cover.isReady();}
  override getSamplers(samplers:string[]):void{samplers.push('rockCover');}
  override bindForSubMesh(buffer:UniformBuffer):void{buffer.setTexture('rockCover',this.cover);}
  override getActiveTextures(textures:BaseTexture[]):void{textures.push(this.cover);}
  override hasTexture(texture:BaseTexture):boolean{return texture===this.cover;}
  override getCustomCode(type:string):Record<string,string>|null{
    if(type==='vertex')return {
      CUSTOM_VERTEX_DEFINITIONS:'varying float rockHeight;',
      CUSTOM_VERTEX_MAIN_END:`rockHeight=0.0;
        #ifdef VERTEXCOLOR
          rockHeight=colorUpdated.a;
        #endif`,
    };
    if(type!=='fragment')return null;
    return {
      CUSTOM_FRAGMENT_DEFINITIONS:`
        uniform sampler2D rockCover;
        varying float rockHeight;
        float coatHash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
        float coatNoise(vec3 p){
          vec3 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
          return mix(mix(mix(coatHash(i),coatHash(i+vec3(1,0,0)),f.x),
                         mix(coatHash(i+vec3(0,1,0)),coatHash(i+vec3(1,1,0)),f.x),f.y),
                     mix(mix(coatHash(i+vec3(0,0,1)),coatHash(i+vec3(1,0,1)),f.x),
                         mix(coatHash(i+vec3(0,1,1)),coatHash(i+vec3(1,1,1)),f.x),f.y),f.z);
        }`,
      CUSTOM_FRAGMENT_UPDATE_DIFFUSE:`
        #ifdef VERTEXCOLOR
          float coatBreakup=(coatNoise(vPositionW*2.3)-.5)*.24
                           +(coatNoise(vPositionW*9.0)-.5)*.07;
          float coatMask=smoothstep(.42,.79,rockHeight+coatBreakup);
          #ifdef ROCK_SNOW
            vec3 coatColor=vec3(.90,.94,.98);
          #else
            vec3 coatColor=texture2D(rockCover,vPositionW.xz/2.4).rgb*vec3(.52,.62,.48);
          #endif
          baseColor.rgb=mix(baseColor.rgb,coatColor,coatMask);
        #endif`,
    };
  }
}
