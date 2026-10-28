import { Color3, Material, Mesh, StandardMaterial, Texture, type Scene } from '@babylonjs/core';
/** City-only painted surfaces. Shared per scene; UVs below use physical metres. */
export class CityMaterials {
  readonly concrete:StandardMaterial;
  readonly steel:StandardMaterial;
  readonly glass:StandardMaterial;
  readonly sidewalk:StandardMaterial;
  constructor(scene:Scene){
    const make=(name:string,file:string|null,color:string)=>{
      const m=new StandardMaterial(`city-${name}`,scene);m.metadata={softEnvironment:true};
      m.alpha=1;m.transparencyMode=Material.MATERIAL_OPAQUE;m.disableDepthWrite=false;
      m.backFaceCulling=false;
      m.diffuseColor=Color3.FromHexString(color);m.specularColor.set(.015,.015,.015);
      if(file){const t=new Texture(`${import.meta.env.BASE_URL}environment/grey-ruins-v1/${file}.png`,scene);t.wrapU=t.wrapV=Texture.WRAP_ADDRESSMODE;t.anisotropicFilteringLevel=8;t.hasAlpha=false;m.useAlphaFromDiffuseTexture=false;m.diffuseTexture=t;}
      return m;
    };
    this.concrete=make('cement','cement','#b7b9bb');
    this.steel=make('painted-steel','asphalt','#74777b');
    this.glass=make('dark-window','cement','#53575a');this.glass.specularColor.set(.12,.17,.18);
    this.sidewalk=make('sidewalk','cement','#96989a');
  }
}
export function cityUV(mesh:Mesh,metres=9):void{
  const p=mesh.getVerticesData('position')!,n=mesh.getVerticesData('normal')!,uv:number[]=[];
  for(let i=0;i<p.length;i+=3){
    const x=p[i]+mesh.position.x,y=p[i+1]+mesh.position.y,z=p[i+2]+mesh.position.z;
    const ax=Math.abs(n[i]),ay=Math.abs(n[i+1]),az=Math.abs(n[i+2]);
    uv.push((ay>ax&&ay>az?x:ax>az?z:x)/metres,(ay>ax&&ay>az?z:y)/metres);
  }
  mesh.setVerticesData('uv',uv);
}
