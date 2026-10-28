import { Color3, Mesh, MeshBuilder, StandardMaterial, Texture, TransformNode, Vector3, VertexData, type Scene } from '@babylonjs/core';
import type { FrozenAsset } from './frozen-assets';
type Kind='steel'|'dark'|'ice'|'orange'|'snow'|'light'|'crystal';
export class FrozenMaterials{
 readonly mats=new Map<Kind,StandardMaterial>();
 constructor(scene:Scene){
  const texture=new Texture(`${import.meta.env.BASE_URL}environment/frozen-kit-v1/material-atlas.png`,scene);texture.anisotropicFilteringLevel=4;
  for(const kind of ['steel','dark','ice','orange','snow','light','crystal'] as const){
   const m=new StandardMaterial(`frozen-${kind}`,scene);m.metadata={softEnvironment:true};m.specularColor.setAll(.05);
   if(kind==='snow')m.diffuseColor=new Color3(.86,.93,.98);
   else if(kind==='light'){m.diffuseColor=new Color3(.38,.8,.94);m.emissiveColor.set(.15,.5,.65);}
   // Untextured until an ice-crystal texture exists; glossy cyan reads against the snow.
   else if(kind==='crystal'){m.diffuseColor=new Color3(.6,.85,.97);m.emissiveColor.set(.1,.24,.32);m.specularColor.set(.7,.8,.9);m.specularPower=64;}
   else m.diffuseTexture=texture;
   this.mats.set(kind,m);
  }
 }
}
export function createFrozenAsset(scene:Scene,asset:FrozenAsset,mats:FrozenMaterials):TransformNode{
 const root=new TransformNode(asset,scene),parts:Mesh[]=[];
 const finish=(mesh:Mesh,kind:Kind)=>{
  mesh.parent=root;mesh.material=mats.mats.get(kind)!;mesh.isPickable=false;mesh.receiveShadows=true;parts.push(mesh);
  if(!['snow','light','crystal'].includes(kind)){
   const uv=mesh.getVerticesData('uv');const [u,v]=kind==='steel'?[0,.5]:kind==='dark'?[.5,.5]:kind==='ice'?[0,0]:[.5,0];
   if(uv){for(let i=0;i<uv.length;i+=2){uv[i]=u+.01+uv[i]*.48;uv[i+1]=v+.01+uv[i+1]*.48;}mesh.setVerticesData('uv',uv);}
  }
  return mesh;
 };
 const box=(name:string,x:number,y:number,z:number,w:number,h:number,d:number,kind:Kind)=>{
  const m=MeshBuilder.CreateBox(`${asset}-${name}`,{width:w,height:h,depth:d},scene);m.position.set(x,y,z);return finish(m,kind);
 };
 const tube=(name:string,path:Vector3[],radius:number,kind:Kind)=>finish(MeshBuilder.CreateTube(`${asset}-${name}`,{path,radius,tessellation:6,cap:Mesh.CAP_ALL},scene),kind);
 const cylinder=(name:string,x:number,y:number,z:number,h:number,bottom:number,top:number,kind:Kind,sides=6)=>{
  const m=MeshBuilder.CreateCylinder(`${asset}-${name}`,{height:h,diameterBottom:bottom,diameterTop:top,tessellation:sides},scene);m.position.set(x,y,z);return finish(m,kind);
 };
 if(asset==='frozen-mountain'){
  const rx=17,rz=20,h=22,positions:number[]=[],indices:number[]=[],uvs:number[]=[],normals:number[]=[],n=22;
  for(let ring=0;ring<3;ring++)for(let i=0;i<n;i++){
   const a=i*Math.PI*2/n,s=ring===0?1:ring===1?.65:.12,rough=1+.07*Math.sin(i*3.4);
   positions.push(Math.cos(a)*rx*s*rough,ring===0?0:ring===1?h*.42+(i%3)*.3:h+Math.sin(i*2)*1.6,Math.sin(a)*rz*s*rough);
   uvs.push(.5+Math.cos(a)*s*.48,.5+Math.sin(a)*s*.48);
  }
  for(let ring=0;ring<2;ring++)for(let i=0;i<n;i++){const a=ring*n+i,b=ring*n+(i+1)%n,c=a+n,d=b+n;indices.push(a,c,b,b,c,d);}
  positions.push(0,h*1.3,0);uvs.push(.5,.5);for(let i=0;i<n;i++)indices.push(2*n+i,3*n,2*n+(i+1)%n);
  for(let i=0;i<indices.length;i+=3){const b=indices[i+1];indices[i+1]=indices[i+2];indices[i+2]=b;}
  VertexData.ComputeNormals(positions,indices,normals);const data=new VertexData();Object.assign(data,{positions,indices,uvs,normals});const m=new Mesh(`${asset}-rock`,scene);data.applyToMesh(m);m.convertToFlatShadedMesh();finish(m,'ice');
  // Irregular snow plates follow the upper silhouette, with blue rock left exposed.
  const capPositions=positions.map((v,i)=>i%3===1?v+.16:v*1.008);
  const capIndices=indices.slice(n*6),capNormals:number[]=[];
  VertexData.ComputeNormals(capPositions,capIndices,capNormals);
  const capData=new VertexData();Object.assign(capData,{positions:capPositions,indices:capIndices,normals:capNormals,uvs});
  const cap=new Mesh(`${asset}-snow`,scene);capData.applyToMesh(cap);cap.convertToFlatShadedMesh();finish(cap,'snow');
 }else if(asset==='frozen-outcrop'){
  // A low rock plinth bristling with tilted hexagonal ice crystals. Solid core about 4.5 m across.
  box('plinth',0,.45,0,6.4,.9,5.6,'dark').rotation.y=.3;
  box('plinth-snow',0,.95,0,6.6,.14,5.8,'snow').rotation.y=.3;
  const crystals:[number,number,number,number,number,number][]=[
   [0,0,6.2,1.5,0,0],[1.6,.6,4.1,1.1,.32,.6],[-1.5,.9,4.6,1.2,-.28,-.4],[.7,-1.6,3.4,1,.22,2.2],
   [-1.1,-1.3,2.6,.85,-.35,3.6],[2.5,-.8,2.2,.75,.5,1.4],[-2.6,.1,1.8,.7,-.55,4.4],
  ];
  for(const [i,[x,z,h,d,tilt,yaw]] of crystals.entries()){
   const shaft=cylinder(`crystal-${i}`,0,h/2,0,h,d,d*.82,'crystal');
   const tip=cylinder(`tip-${i}`,0,h+d*.45,0,d*.9,d*.82,0,'crystal');
   for(const m of [shaft,tip]){const pivot=new TransformNode(`pivot-${i}`,scene);pivot.parent=root;pivot.position.set(x,.8,z);pivot.rotation.set(tilt*Math.cos(yaw),yaw,tilt*Math.sin(yaw));m.parent=pivot;}
  }
  for(const [x,z,s] of [[2.9,1.9,1],[-2.2,2.4,.8],[1.2,-2.9,.9]] as const){
   const rock=MeshBuilder.CreateIcoSphere(`${asset}-rock`,{radius:s,subdivisions:1,flat:true},scene);rock.position.set(x,s*.45,z);rock.scaling.y=.6;finish(rock,'dark');
  }
 }else if(asset==='frozen-barrier'){
  // Jersey barrier, 3.2 m, with a wind-packed snow crest and one safety band.
  box('foot',0,.22,0,3.2,.44,.9,'steel');box('body',0,.72,0,3.2,.6,.6,'steel');box('crest',0,1.1,0,3.2,.18,.36,'steel');
  box('band',0,.68,-.31,3.0,.16,.02,'orange');box('band-back',0,.68,.31,3.0,.16,.02,'orange');
  const drift=box('snow-crest',.1,1.26,.02,3.0,.18,.5,'snow');drift.rotation.z=.03;
  box('snow-foot',0,.07,.55,3.3,.14,.5,'snow');
 }else if(asset==='frozen-beacon'){
  // Survey mast: navigation light ring at 4 m. Reads at night and in whiteout.
  cylinder('base',0,.25,0,.5,1.1,.9,'dark',8);box('base-snow',0,.53,0,.95,.08,.95,'snow');
  cylinder('mast',0,2.3,0,3.6,.22,.16,'steel',8);
  for(const y of [1.2,2.4])cylinder(`stripe-${y}`,0,y,0,.28,.24,.24,'orange',8);
  cylinder('lamp-housing',0,4.25,0,.4,.5,.5,'dark',8);cylinder('lamp',0,4.25,0,.22,.56,.56,'light',8);
  cylinder('cap',0,4.55,0,.2,.6,.15,'snow',8);
 }else if(asset==='frozen-hangar'){
  box('foundation',0,.3,0,12,.6,10,'dark');
  box('back',0,2.8,4.6,11,5,.5,'steel');
  for(const side of [-1,1]){
   box('side',side*5.3,2.8,0,.5,5,9.4,'steel');
   box('front-pier',side*4.4,2.8,-4.6,2.2,5,.5,'steel');
   box('door-stripe',side*3.22,2.6,-4.91,.25,4.5,.12,'orange');
   for(const z of [-4,-1,2,4])box('reinforcement',side*5.6,2.7,z,.2,5,.25,'dark');
   const roof=box('sloped-roof',side*2.8,5.7,0,6.1,.25,11,'steel');roof.rotation.z=side*-.19;
   const snow=box('roof-drift',side*2.8,5.94,.15,6,.3,10.8,'snow');snow.rotation.z=side*-.19;
  }
  box('door-dark-inset',0,2.4,-4.2,6.1,4.2,.2,'dark');
  for(const x of [-2,0,2])box('door-seam',x,2.4,-4.34,.065,4.1,.05,'steel');
  box('lintel',0,5,-4.7,12,.8,.7,'dark');box('entry-light',0,4.7,-5.1,5.7,.14,.1,'light');
  box('service-wing',7,1.6,1.6,3.5,3.2,5,'steel');box('wing-snow',7,3.3,1.6,3.7,.25,5.2,'snow');
  box('vent',6.8,3.85,2,.8,1,.8,'dark');
 }else{
  box('station',0,1.7,0,8,3.4,7,'steel');box('station-roof',0,3.5,0,8.4,.3,7.4,'snow');
  box('door',0,1.45,-3.56,1.6,2.9,.1,'dark');box('door-light',0,3,-3.63,2,.12,.1,'light');
  for(const x of [-2.6,2.6]){box('window-frame',x,2.1,-3.57,1.7,1.1,.14,'dark');box('window',x,2.1,-3.66,1.4,.8,.05,'light');}
  for(const x of [-1,1])for(const z of [-1,1]){
   tube('antenna-leg',[new Vector3(x,3.7,z),new Vector3(x*.35,7,z*.35)],.08,'orange');
  }
  const dish=MeshBuilder.CreateSphere('relay-dish',{diameter:3.8,segments:12,slice:.28,sideOrientation:Mesh.DOUBLESIDE},scene);dish.scaling.y=.35;dish.position.set(0,7.3,0);dish.rotation.x=-.45;finish(dish,'steel');
  tube('receiver',[new Vector3(0,7,0),new Vector3(0,8.5,-.7)],.06,'dark');
  for(const x of [6,8]){box('battery',x,1.3,2,1.5,2.6,2.3,'dark');box('battery-stripe',x,1.6,.82,1.2,.4,.08,'orange');}
 }
 for(const material of mats.mats.values()){
  const group=parts.filter(p=>p.material===material);if(!group.length)continue;
  const merged=Mesh.MergeMeshes(group,true,true)!;merged.parent=root;merged.isPickable=false;merged.receiveShadows=true;
 }
 return root;
}
