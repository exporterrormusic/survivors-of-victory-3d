import { Color3, Mesh, MeshBuilder, StandardMaterial, TransformNode, Vector3, type Texture, type Scene } from '@babylonjs/core';
import type { SceneryObstacle } from './range-collision';

export const FROZEN_ARRIVAL={x:0,z:12};
/** The first quarter unseats the door; only then can its teeth roll along the rail. */
export function vaultDoorPose(open:number){
  const unseat=Math.min(1,Math.max(0,open)*4);
  const roll=Math.max(0,Math.min(1,(open-.25)/.75));
  return {x:roll*7.2,z:-3.1+unseat*.85,rotation:-roll*2.25};
}
export function vaultObstacles(closed:boolean):SceneryObstacle[]{
  const out:SceneryObstacle[]=[];
  const wall=(ax:number,az:number,bx:number,bz:number)=>{
    const n=Math.ceil(Math.hypot(bx-ax,bz-az)/.5);
    for(let i=0;i<=n;i++)out.push({x:ax+(bx-ax)*i/n,z:az+(bz-az)*i/n,r:.4,height:7});
  };
  wall(-3.7,-3,-3.7,3.7);wall(3.7,-3,3.7,3.7);wall(-3.7,3.7,3.7,3.7);
  if(closed)wall(-3.3,-3.1,3.3,-3.1);
  return out;
}

/** Ground-level arrival chamber: a geared blast door rolls into a rock-side pocket. */
export class FrozenVault {
  readonly root:TransformNode;
  readonly door:TransformNode;
  private materials:StandardMaterial[]=[];
  constructor(scene:Scene,parent:TransformNode,texture:Texture|null=null){
    this.root=new TransformNode('frozen-vault',scene);
    this.door=new TransformNode('vault-rolling-door',scene);this.door.parent=this.root;
    const mat=(name:string,hex:string,emissive=false)=>{const m=new StandardMaterial(`vault-${name}`,scene);m.diffuseColor=Color3.FromHexString(hex);m.specularColor.setAll(.12);if(emissive)m.emissiveColor=m.diffuseColor.scale(.6);this.materials.push(m);return m;};
    const steel=mat('steel','#677f8e'),dark=mat('recess','#1b2c39'),edge=mat('edge','#98a9af'),orange=mat('safety','#c78738'),light=mat('lights','#6edbea',true);
    if(texture){for(const material of [steel,dark,edge]){material.diffuseTexture=texture;material.diffuseColor.setAll(material===dark?.8:1);}}
    const parts:Mesh[]=[];
    const box=(name:string,x:number,y:number,z:number,w:number,h:number,d:number,m:StandardMaterial,p=this.root)=>{const mesh=MeshBuilder.CreateBox(`vault-${name}`,{width:w,height:h,depth:d},scene);mesh.position.set(x,y,z);mesh.material=m;mesh.parent=p;parts.push(mesh);return mesh;};
    const disc=(name:string,r:number,depth:number,z:number,m:StandardMaterial,p:TransformNode)=>{const mesh=MeshBuilder.CreateCylinder(`vault-${name}`,{diameter:r*2,height:depth,tessellation:48},scene);mesh.rotation.x=Math.PI/2;mesh.position.set(0,3.05,z);mesh.material=m;mesh.parent=p;parts.push(mesh);return mesh;};
    box('floor',0,-.08,.1,8,.25,8.5,dark);
    box('ceiling',0,7,.2,9,.8,8.5,steel);
    box('rear',0,3.5,3.8,8,7,.6,dark);
    for(const side of [-1,1]){
      box('chamber-wall',side*3.9,3.5,.2,.6,7,7.8,steel);
      box('portal-pier',side*4.5,3.5,-3.15,2,7.5,1.2,steel);
      box('safety-stripe',side*4.4,2.8,-3.8,.3,4,.08,orange);
      box('interior-light',side*3.55,2.8,.2,.08,.16,5.8,light);
    }
    box('portal-lintel',0,6.8,-3.15,11,1.1,1.2,steel);
    // Faceted annular frame, leaving a real circular opening through the façade.
    for(let i=0;i<32;i++){
      const a=i*Math.PI*2/32;
      const ring=box('ring',Math.sin(a)*3.55,3.05+Math.cos(a)*3.55,-3.25,.73,.46,.65,edge);ring.rotation.z=-a;
    }
    disc('door-body',3.35,.65,0,steel,this.door);
    disc('door-inset',2.8,.12,-.38,dark,this.door);
    disc('door-boss',1.05,.28,-.52,edge,this.door);
    for(let i=0;i<16;i++){
      const a=i*Math.PI*2/16;
      const tooth=box('gear-tooth',Math.sin(a)*3.36,3.05+Math.cos(a)*3.36,0,.56,.6,.68,edge,this.door);tooth.rotation.z=-a;
      const bolt=box('locking-bolt',Math.sin(a)*2.55,3.05+Math.cos(a)*2.55,-.48,.19,.19,.16,orange,this.door);bolt.rotation.z=-a;
    }
    for(const a of [0,Math.PI/2,Math.PI,Math.PI*1.5]){
      const rib=box('radial-brace',Math.sin(a)*1.85,3.05+Math.cos(a)*1.85,-.48,.24,1.5,.16,steel,this.door);rib.rotation.z=-a;
    }
    box('rolling-rail',3.5,-.02,-2.3,14,.18,.25,edge);
    box('door-pocket',7.5,3.5,-1.8,7.5,7.5,2.4,dark);
    box('control-terminal',-4.5,1.6,-4.1,.7,1.3,.55,dark);
    box('control-screen',-4.5,1.85,-4.4,.5,.5,.04,light);
    box('entry-light',0,6.25,-3.85,3.5,.15,.08,light);
    if(texture)for(const mesh of parts){
      if(![steel,dark,edge].includes(mesh.material as StandardMaterial))continue;
      const uv=mesh.getVerticesData('uv');if(!uv)continue;
      for(let i=0;i<uv.length;i+=2){uv[i]=(mesh.material===dark?.5:0)+.01+uv[i]*.48;uv[i+1]=.51+uv[i+1]*.48;}
      mesh.setVerticesData('uv',uv);
    }
    // One draw per material and moving group, rather than one per bolt.
    for(const group of [this.root,this.door])for(const material of this.materials){
      const meshes=parts.filter(m=>m.parent===group&&m.material===material);if(!meshes.length)continue;
      const merged=Mesh.MergeMeshes(meshes,true,true)!;merged.parent=group;merged.isPickable=false;merged.receiveShadows=true;
      merged.metadata={cameraOccluder:true,occlusionGroup:group.uniqueId};
    }
    this.door.setPivotPoint(new Vector3(0,3.05,0));
    this.root.parent=parent;this.pose(1);
  }
  pose(open:number):void{
    const p=vaultDoorPose(open);this.door.position.set(p.x,0,p.z);
    this.door.rotation.z=p.rotation;
  }
  dispose():void{this.root.dispose();this.materials.forEach(m=>m.dispose());}
}
