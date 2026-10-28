import { pumpkinGeometry } from './jack-o-lantern-geometry';
import { Color3, Mesh, MeshBuilder, StandardMaterial, Texture, TransformNode, Vector3, VertexData, type Scene } from '@babylonjs/core';

/** A reusable 1.1 m pumpkin; its carved face points along local -Z.
 * No quest state or observers: the easter egg can place/clone/dispose it like any prop. */
export function createJackOLantern(scene:Scene):TransformNode {
  const root=new TransformNode('forest-jack-o-lantern',scene);
  root.metadata={asset:'forest-jack-o-lantern',units:'metres',front:'-Z'};
  function material(name:string,color:string,surface?:string):StandardMaterial {
    const existing=scene.getMaterialByName(name);if(existing)return existing as StandardMaterial;
    const m=new StandardMaterial(name,scene);m.diffuseColor=Color3.FromHexString(color);
    m.specularColor.set(.12,.085,.045);m.specularPower=48;m.metadata={softEnvironment:true};
    if(surface){
      const url=`${import.meta.env?.BASE_URL??'/'}environment/forest-kit-v2/${surface}`;
      m.diffuseTexture=new Texture(`${url}.webp`,scene);m.diffuseTexture.anisotropicFilteringLevel=8;
      m.bumpTexture=new Texture(`${url}-normal.png`,scene);m.bumpTexture.level=.3;
    }
    return m;
  }
  const rind=material('jack-o-lantern-rind','#ffffff','pumpkin');
  const stemMat=material('jack-o-lantern-stem','#797450','wood');
  const ember=material('jack-o-lantern-candlelight','#000000');
  ember.emissiveColor.set(1,.68,.24);ember.disableLighting=true;
  function attach(mesh:Mesh,mat:StandardMaterial):Mesh {
    mesh.parent=root;mesh.material=mat;mesh.isPickable=false;mesh.receiveShadows=mat!==ember;return mesh;
  }
  const shell=new Mesh('jack-o-lantern-carved-shell',scene),data=new VertexData();
  Object.assign(data,pumpkinGeometry);data.applyToMesh(shell);attach(shell,rind);
  // A recessed warm source shows through the real openings, never a green face decal.
  const glow=attach(MeshBuilder.CreateSphere('jack-o-lantern-inner-glow',{diameter:1,segments:16},scene),ember);
  glow.scaling.set(.87,.70,.78);glow.position.y=.39;
  const stemPath=[new Vector3(0,.755,0),new Vector3(.015,.86,.015),new Vector3(.055,.98,.025),new Vector3(.13,1.035,.035)];
  attach(MeshBuilder.CreateTube('jack-o-lantern-stem',{path:stemPath,radiusFunction:(i)=>.068-i*.009,tessellation:12,cap:Mesh.CAP_ALL},scene),stemMat);
  // Sawn lid seam follows the lobed crown instead of floating above the pumpkin.
  const seam:Vector3[]=[];
  for(let i=0;i<=80;i++){
    const t=i/80*Math.PI*2,r=.24*(1+.075*Math.cos(t*10));seam.push(new Vector3(Math.cos(t)*r,.757,Math.sin(t)*r*.89));
  }
  attach(MeshBuilder.CreateTube('jack-o-lantern-lid-seam',{path:seam,radius:.003,tessellation:5},scene),material('jack-o-lantern-lid-cut','#502509'));
  return root;
}
