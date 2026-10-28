import { Color3, Mesh, MeshBuilder, StandardMaterial, Texture, TransformNode, Vector3, VertexData, type Scene } from '@babylonjs/core';

import type { SakuraAsset } from './sakura-assets';
type Surface = 'red'|'tile'|'stone'|'wood'|'paper'|'brass';

/** One original painted atlas shared by all shrine-garden architecture. */
export class SakuraMaterials {
  readonly materials = new Map<Surface,StandardMaterial>();
  constructor(scene:Scene){
    const texture=new Texture(`${import.meta.env.BASE_URL}environment/sakura-kit-v1/material-atlas.png`,scene);
    texture.anisotropicFilteringLevel=8;
    for(const kind of ['red','tile','stone','wood','paper','brass'] as const){
      const m=new StandardMaterial(`sakura-${kind}`,scene);
      m.metadata={softEnvironment:true};m.specularColor.set(.06,.06,.06);
      if(kind==='paper'){
        m.diffuseColor=Color3.FromHexString('#e4c398');m.emissiveColor.set(.32,.20,.08);
      }else if(kind==='brass'){
        m.diffuseColor=Color3.FromHexString('#b09961');m.specularColor.set(.2,.17,.1);
      }else m.diffuseTexture=texture;
      this.materials.set(kind,m);
    }
  }
  get(kind:Surface):StandardMaterial{return this.materials.get(kind)!;}
}

/** Metre-scale authored meshes; open portals have no hidden floor or doorway collider. */
export function createSakuraAsset(scene:Scene,asset:SakuraAsset,materials:SakuraMaterials):TransformNode {
  const root=new TransformNode(asset,scene),parts:Mesh[]=[];
  const finish=(m:Mesh,kind:Surface)=>{
    m.parent=root;m.material=materials.get(kind);m.isPickable=false;m.receiveShadows=true;
    if(kind!=='paper'&&kind!=='brass'){
      // Inset UVs keep mip filtering away from adjacent atlas panels.
      const uv=m.getVerticesData('uv');
      const [u,v]=kind==='red'?[0,.5]:kind==='tile'?[.5,.5]:kind==='stone'?[0,0]:[.5,0];
      if(uv){for(let i=0;i<uv.length;i+=2){uv[i]=u+.012+uv[i]*.476;uv[i+1]=v+.012+uv[i+1]*.476;}m.setVerticesData('uv',uv);}
    }
    parts.push(m);return m;
  };
  const box=(name:string,x:number,y:number,z:number,w:number,h:number,d:number,kind:Surface='wood')=>{
    const m=MeshBuilder.CreateBox(name,{width:w,height:h,depth:d},scene);m.position.set(x,y,z);return finish(m,kind);
  };
  const cylinder=(name:string,x:number,y:number,z:number,h:number,bottom:number,top:number,kind:Surface='stone',sides=12)=>{
    const m=MeshBuilder.CreateCylinder(name,{height:h,diameterBottom:bottom,diameterTop:top,tessellation:sides},scene);m.position.set(x,y,z);return finish(m,kind);
  };
  const tube=(name:string,path:Vector3[],radius:number,kind:Surface)=>finish(MeshBuilder.CreateTube(name,{path,radius,tessellation:6,cap:Mesh.CAP_ALL},scene),kind);
  const beam=(name:string,x:number,y:number,z:number,w:number,h:number,d:number,kind:Surface='red')=>box(name,x,y,z,w,h,d,kind);
  // Solid swept roof: a shallow concave pitch, lifted eave corners, tiled ribs and ridge caps.
  const roof=(name:string,x:number,y:number,z:number,w:number,d:number,rise:number,stone=false)=>{
    const nx=Math.ceil(w/.45),nz=12,positions:number[]=[],uvs:number[]=[],indices:number[]=[],normals:number[]=[];
    const height=(px:number,pz:number)=>y+rise*(1-Math.abs(pz)/(d/2))+.25*Math.pow(Math.abs(pz)/(d/2),4)+.18*Math.pow(Math.abs(px)/(w/2),6);
    for(let layer=0;layer<2;layer++)for(let j=0;j<=nz;j++)for(let i=0;i<=nx;i++){
      const px=(i/nx-.5)*w,pz=(j/nz-.5)*d;
      positions.push(x+px,height(px,pz)-layer*.15,z+pz);uvs.push(i/nx,j/nz);
    }
    const count=(nx+1)*(nz+1);
    for(let j=0;j<nz;j++)for(let i=0;i<nx;i++){
      const a=j*(nx+1)+i,b=a+1,c=a+nx+1,e=c+1;
      indices.push(a,c,b,b,c,e,a+count,b+count,c+count,b+count,e+count,c+count);
    }
    const edge=(a:number,b:number)=>indices.push(a,b,a+count,b,b+count,a+count);
    for(let i=0;i<nx;i++){edge(i,i+1);edge(nz*(nx+1)+i+1,nz*(nx+1)+i);}
    for(let j=0;j<nz;j++){edge((j+1)*(nx+1),j*(nx+1));edge(j*(nx+1)+nx,(j+1)*(nx+1)+nx);}
    VertexData.ComputeNormals(positions,indices,normals);
    const data=new VertexData();Object.assign(data,{positions,indices,normals,uvs});
    const mesh=new Mesh(name,scene);data.applyToMesh(mesh);finish(mesh,stone?'stone':'tile');
    for(let i=0;i<=nx;i++){
      const px=(i/nx-.5)*w;
      const path=Array.from({length:nz+1},(_,j)=>{const pz=(j/nz-.5)*d;return new Vector3(x+px,height(px,pz)+.025,z+pz);});
      tube(`${name}-tile-roll`,path,stone?.025:.052,stone?'stone':'tile');
    }
    for(const side of [-1,1]){
      const path=Array.from({length:nx+1},(_,i)=>{const px=(i/nx-.5)*w;return new Vector3(x+px,height(px,side*d/2)-.05,z+side*d/2);});
      tube(`${name}-eave`,path,.10,stone?'stone':'wood');
    }
    tube(`${name}-ridge`,[new Vector3(x-w/2,y+rise+.19,z),new Vector3(x,y+rise+.12,z),new Vector3(x+w/2,y+rise+.19,z)],.12,stone?'stone':'tile');
  };
  if(asset==='sakura-roofed-gate'){
    for(const x of [-6.6,6.6])for(const z of [-.9,.9]){
      cylinder('granite-foot',x,.25,z,.5,1.05,.9);
      cylinder('vermilion-pillar',x,2.75,z,5,.52,.46,'red');
      cylinder('iron-foot-collar',x,.65,z,.3,.57,.57,'tile');
      beam('capital',x,5.0,z,1.2,.22,.8);
      beam('bracket-arm',x,5.25,z,1.8,.20,.65);
      beam('bracket-block',x,5.42,z,.7,.18,.65);
    }
    for(const z of [-.9,.9]){
      beam('lintel',0,4.7,z,14.1,.48,.42);
      beam('upper-purlin',0,5.55,z,14.8,.25,.36);
      for(let x=-6;x<=6;x+=1.5)beam('open-transom-strut',x,5.15,z,.14,.65,.18);
    }
    for(let x=-6.6;x<=6.61;x+=2.2)beam('rafter-end',x,5.55,0,.16,.22,3.1,'wood');
    roof('swept-tiled-gate-roof',0,5.65,0,15.7,3.8,1.0);
    box('blank-dedication-plaque',0,4.65,-1.16,.85,1.1,.13,'wood');
    for(const x of [-.47,.47])box('plaque-frame',x,4.65,-1.24,.065,1.22,.06,'brass');
    for(const y of [4.05,5.25])box('plaque-frame',0,y,-1.24,1,.06,.06,'brass');
  }else if(asset==='sakura-torii'){
    for(const x of [-5.5,5.5]){
      cylinder('stone-socket',x,.18,0,.36,1.05,.9);
      // Join the red shaft to its boot instead of running a full red cylinder
      // through it. Both follow the same lean, with a single seam at y=.9.
      const lean=Math.sign(x)*.035;
      const post=cylinder('tapered-torii-post',x-Math.sin(lean)*.45,3.05,0,4.3,.622,.49,'red');post.rotation.z=lean;
      const boot=cylinder('dark-post-boot',x+Math.sin(lean)*2.05,.55,0,.7,.7,.67,'tile');boot.rotation.z=lean;
    }
    beam('through-tie',0,3.75,0,12.5,.32,.37);
    beam('upper-tie',0,4.9,0,12.8,.34,.55);
    // A gently upswept solid lintel rather than an angular rectangular bar.
    for(let i=0;i<16;i++){
      const x=(i-7.5)*.85,y=5.3+.35*Math.pow(Math.abs(x)/6.4,3);
      const m=beam('curved-crown',x,y,0,.88,.28,.70,'tile');m.rotation.z=.16*Math.sign(x)*Math.pow(Math.abs(x)/6.4,2);
    }
    beam('central-strut',0,4.33,0,.4,.95,.28);
    const rope=Array.from({length:25},(_,i)=>{const x=-5+i*10/24;return new Vector3(x,3.45-.45*(1-x*x/25),-.28);});
    tube('hanging-rope',rope,.055,'wood');
    for(const x of [-3,-1,1,3]){
      const y=3.45-.45*(1-x*x/25);
      for(let j=0;j<3;j++){const p=box('folded-paper-streamer',x+(j%2)*.1,y-.15-j*.17,-.28,.14,.24,.025,'paper');p.rotation.z=j%2?.4:-.4;}
    }
  }else if(asset==='sakura-lantern'){
    cylinder('lantern-foot',0,.12,0,.24,1.1,.95,'stone',8);
    cylinder('lantern-pedestal',0,.38,0,.3,.75,.48,'stone',8);
    cylinder('lantern-stem',0,.87,0,.72,.32,.42,'stone',8);
    cylinder('lantern-tray',0,1.28,0,.18,.85,1.05,'stone',8);
    box('warm-paper-core',0,1.66,0,.57,.62,.57,'paper');
    for(const x of [-.36,.36])for(const z of [-.36,.36])box('window-post',x,1.66,z,.12,.72,.12,'stone');
    for(const z of [-.37,.37])for(const x of [-.14,.14])box('window-lattice',x,1.66,z,.035,.55,.035,'wood');
    roof('lantern-cap',0,2.03,0,1.30,1.30,.27,true);
    cylinder('finial-base',0,2.42,0,.16,.28,.22);
    finish(MeshBuilder.CreateSphere('lotus-finial',{diameter:.25,segments:8},scene),'stone').position.set(0,2.57,0);
  }else if(asset==='sakura-shrine'){
    box('granite-plinth',0,.22,0,6.4,.44,4.6,'stone');
    for(let i=0;i<3;i++)box('approach-step',0,.08+i*.12,-2.95+i*.30,2.8,.16+i*.24,.62,'stone');
    box('raised-wood-floor',0,.56,0,6.0,.25,4.2);
    box('rear-wall',0,2.03,1.65,5.4,2.7,.22);
    for(const x of [-2.6,2.6])box('side-wall',x,2.03,.1,.22,2.7,3.3);
    for(const x of [-2.7,-1.15,1.15,2.7])for(const z of [-1.65,1.65])beam('shrine-post',x,2.1,z,.28,3.0,.28);
    for(const x of [-1.55,-.55,.55,1.55]){
      box('door-panel',x,1.95,-1.40,.95,2.5,.15);
      box('door-paper',x,2.24,-1.50,.78,1.45,.035,'paper');
      for(let j=0;j<5;j++)box('door-slats',x-.36+j*.18,2.24,-1.54,.035,1.5,.035);
      for(const y of [1.65,2.2,2.85])box('door-crossbar',x,y,-1.55,.85,.055,.04);
    }
    beam('front-lintel',0,3.48,-1.65,5.9,.32,.4);
    for(let x=-2.7;x<=2.71;x+=.6)beam('roof-bracket',x,3.65,-1.65,.18,.32,.8);
    roof('shrine-main-roof',0,3.75,0,7.7,5.5,1.15);
    roof('entry-canopy',0,3.02,-2.05,3.25,2,.42);
    box('offering-box',0,.97,-2.0,1.05,.65,.55);
    for(let i=0;i<7;i++)box('offering-slats',-.45+i*.15,1.32,-2,.075,.06,.55,'tile');
    tube('bell-rope',[new Vector3(0,3.0,-2.45),new Vector3(.06,1.5,-2.45)],.035,'wood');
    cylinder('bell',0,2.95,-2.45,.24,.25,.14,'brass');
  }else if(asset==='sakura-wall'){
    box('masonry-foot',0,.2,0,4.2,.4,.85,'stone');
    for(let row=0;row<3;row++)for(let i=0;i<5;i++){
      const x=-1.65+i*.82;
      box('hand-set-stone',x,.52+row*.34,0,.78,.31,.65,'stone');
    }
    for(const x of [-2,2])box('wall-end-post',x,.92,0,.32,1.45,.78,'stone');
    roof('wall-tile-cap',0,1.48,0,4.6,1.15,.25);
  }else{
    for(const x of [-1.1,1.1]){
      box('stone-bench-foot',x,.16,0,.45,.32,.85,'stone');
      box('bench-leg',x,.49,0,.23,.55,.55);
    }
    box('bench-stretcher',0,.44,0,2.4,.15,.15);
    for(const z of [-.30,0,.30])box('worn-seat-plank',0,.81,z,3.0,.16,.27,'red');
    for(const x of [-1.1,1.1])for(const z of [-.30,.30])cylinder('seat-pin',x,.895,z,.015,.04,.04,'brass',6);
  }
  // Keep each asset to a handful of draw calls, retaining material-specific UVs.
  for(const material of materials.materials.values()){
    const group=parts.filter(p=>p.material===material);
    if(group.length){const merged=Mesh.MergeMeshes(group,true,true)!;merged.name=`${asset}-${material.name}`;merged.parent=root;merged.isPickable=false;merged.receiveShadows=true;}
  }
  root.metadata={asset,units:'metres'};return root;
}
