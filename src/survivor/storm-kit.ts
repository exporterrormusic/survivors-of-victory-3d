import {MaterialPluginBase,Mesh,MeshBuilder,StandardMaterial,Texture,TransformNode,Vector3,VertexData,type Scene,type UniformBuffer} from '@babylonjs/core';
import type {StormAsset} from './storm-layout';
/** Textured surfaces sample one quadrant of storm-kit-v2/material-atlas.png in world space:
 * top-left concrete, top-right asphalt, bottom-left painted steel, bottom-right rust. */
type Textured='concrete'|'asphalt'|'steel'|'rust';
type Flat='moss'|'paint'|'yellow'|'sign'|'dark'|'lamp'|'red'|'sodium'|'pool';
type Surface=Textured|Flat;
const SURFACES:Surface[]=['concrete','asphalt','steel','rust','moss','paint','yellow','sign','dark','lamp','red','sodium','pool'];
const PANEL:Record<Textured,[number,number,number]>={concrete:[0,.5,.3],asphalt:[.5,.5,.22],steel:[0,0,.45],rust:[.5,0,.4]};
/** Box-projected atlas lookup: tiles stay square on 38 m decks and 0.1 m rails alike. */
// Babylon reads the shader code inside super(), before constructor parameters are stored.
let nextPanel:[number,number,number]=[0,0,1];
class StormAtlas extends MaterialPluginBase{
  private readonly panel=nextPanel;
  constructor(private surface:StandardMaterial,panel:[number,number,number]){nextPanel=panel;super(surface,'StormAtlas',210,{},true,true);}
  override getSamplers(s:string[]):void{s.push('stormAtlas');}
  override bindForSubMesh(b:UniformBuffer):void{b.setTexture('stormAtlas',this.surface.diffuseTexture);}
  override getCustomCode(type:string){
    if(type!=='fragment')return null;
    const [u,v,k]=(this.panel??nextPanel).map(n=>n.toFixed(3));
    return {
      CUSTOM_FRAGMENT_DEFINITIONS:'uniform sampler2D stormAtlas;',
      CUSTOM_FRAGMENT_UPDATE_DIFFUSE:`
        vec3 axis=abs(normalize(cross(dFdx(vPositionW),dFdy(vPositionW))));axis=pow(axis,vec3(4.));axis/=max(.001,axis.x+axis.y+axis.z);
        vec2 panel=vec2(${u},${v})+.012;
        vec3 ax=texture2D(stormAtlas,panel+fract(vPositionW.zy*${k})*.476).rgb;
        vec3 ay=texture2D(stormAtlas,panel+fract(vPositionW.xz*${k})*.476).rgb;
        vec3 az=texture2D(stormAtlas,panel+fract(vPositionW.xy*${k})*.476).rgb;
        baseColor.rgb=ax*axis.x+ay*axis.y+az*axis.z;
      `,
    };
  }
}
export class StormMaterials{
  readonly all=new Map<Surface,StandardMaterial>();
  constructor(scene:Scene){
    const atlas=new Texture(`${import.meta.env.BASE_URL}environment/storm-kit-v2/material-atlas.png`,scene);
    atlas.anisotropicFilteringLevel=8;
    const flat:Record<Flat,[number,number,number]>={moss:[.3,.42,.3],paint:[.86,.86,.82],yellow:[.9,.68,.16],sign:[.12,.36,.24],
      dark:[.06,.07,.08],lamp:[.12,.55,.6],red:[.7,.06,.05],sodium:[1,.62,.25],pool:[1,.72,.38]};
    for(const s of SURFACES){
      const m=new StandardMaterial(`storm-${s}`,scene);m.metadata={softEnvironment:true};
      m.specularColor.set(.16,.22,.24);m.specularPower=48;
      if(s in PANEL){m.diffuseTexture=atlas;m.diffuseColor.set(.92,.94,.96);new StormAtlas(m,PANEL[s as Textured]);}
      else m.diffuseColor.set(...flat[s as Flat]);
      if(s==='lamp')m.emissiveColor.set(.12,.8,.85);
      if(s==='red')m.emissiveColor.set(1,.08,.05);
      if(s==='sodium')m.emissiveColor.set(1,.6,.22);
      if(s==='paint'||s==='yellow')m.emissiveColor.copyFrom(m.diffuseColor.scale(.12));
      if(s==='pool'){m.emissiveColor.set(.5,.36,.16);m.disableLighting=true;m.alpha=.09;m.metadata={};}
      this.all.set(s,m);
    }
  }
  get(s:Surface){return this.all.get(s)!;}
  dispose(){for(const m of this.all.values())m.dispose(false,true);}
}

/** Original metre-scale prop meshes. Origin at ground level. Graybox stand-ins until the hero pass. */
export function createStormAsset(scene:Scene,asset:StormAsset,mats:StormMaterials):TransformNode{
  const root=new TransformNode(`storm-${asset}`,scene),parts:Mesh[]=[];
  const finish=(m:Mesh,s:Surface)=>{m.material=mats.get(s);m.parent=root;m.isPickable=false;m.receiveShadows=s!=='pool';parts.push(m);return m;};
  const box=(name:string,x:number,y:number,z:number,w:number,h:number,d:number,s:Surface='concrete',rx=0,ry=0,rz=0)=>{
    const m=MeshBuilder.CreateBox(name,{width:w,height:h,depth:d},scene);m.position.set(x,y,z);m.rotation.set(rx,ry,rz);return finish(m,s);
  };
  const tube=(name:string,path:Vector3[],radius:number,s:Surface='steel')=>finish(MeshBuilder.CreateTube(name,{path,radius,tessellation:7,cap:Mesh.CAP_ALL},scene),s);
  const cylinder=(name:string,x:number,y:number,z:number,h:number,b:number,t:number,s:Surface='steel',rx=0,rz=0)=>{
    const m=MeshBuilder.CreateCylinder(name,{height:h,diameterBottom:b,diameterTop:t,tessellation:12},scene);m.position.set(x,y,z);m.rotation.set(rx,0,rz);return finish(m,s);
  };
  const v=(x:number,y:number,z:number)=>new Vector3(x,y,z);
  {
    // Original downed bipedal walker: tilted hull, red sensor eye and a cannon arm raised at the sky.
    box('hull',0,1.6,0,4,2.6,3.2,'steel',.1,0,.25);box('hull-armor',-.3,3.05,0,3.4,.42,3.5,'rust',.08,0,.25);
    for(const z of [-1.7,1.7])box('side-plate',.2,1.7,z,3.2,1.8,.25,'rust',0,0,.25);
    box('head',2.4,2.5,.2,1.4,1.1,1.5,'steel',0,.1,.4);box('visor',3.06,2.75,.2,.1,.36,1.1,'dark',0,.1,.4);box('sensor-eye',3.12,2.78,.2,.06,.22,.42,'red',0,.1,.4);
    box('shoulder',-.4,2.6,2,1.3,1.3,1.3,'steel');
    tube('cannon',[v(-.4,2.8,2.2),v(-3.4,5.6,2.7)],.34);cylinder('muzzle',-3.6,5.8,2.73,.7,.85,.85,'dark',0,.79);
    tube('thigh',[v(-1.2,1.1,-1.5),v(-3.4,.5,-2.6)],.42,'rust');cylinder('knee',-3.4,.5,-2.6,.8,.9,.9,'steel',Math.PI/2);
    box('foot',-4.1,.3,-3,1.7,.6,1.2,'steel',0,.4,0);box('buried-foot',1.3,.3,-1.9,1.3,.6,1.7,'steel',0,-.3,.1);
    for(let i=0;i<4;i++)tube('cable',[v(-1+i*.6,1,1.4),v(-1.5+i*.8,.2,2.4+i*.3)],.06,'dark');
    for(const [x,z,r] of [[2.8,-2,.4],[-2,3.4,1.1],[3.4,1.8,-.7]])box('armor-shard',x,.12,z,1,.12,.7,'rust',.05,r,.08);
    for(const z of [-.6,.6])box('core-crack',1.6,1.4,z*1.4,.6,.08,.08,'red',0,0,.25);
  }
  // Merge per material to keep the detailed kit inexpensive in the full map.
  root.computeWorldMatrix(true);
  for(const surface of SURFACES){
    const meshes=parts.filter(p=>p.material===mats.get(surface));
    for(const m of meshes)m.computeWorldMatrix(true);
    if(meshes.length){
      const merged=Mesh.MergeMeshes(meshes,true,true)!;merged.name=`${asset}-${surface}`;merged.parent=root;
      merged.metadata={rangeDressing:true,theme:'storm',cameraOcclusionDisabled:surface==='pool'};
    }
  }
  return root;
}
