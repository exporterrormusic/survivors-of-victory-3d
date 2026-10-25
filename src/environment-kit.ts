import { Color3, Mesh, MeshBuilder, Quaternion, StandardMaterial, TransformNode, Vector3, VertexData, type Scene, type ShadowGenerator } from '@babylonjs/core';

export const KIT_FINISHES = ['clean', 'mossy', 'snowy'] as const;
export type KitFinish = typeof KIT_FINISHES[number];
export const KIT_ASSETS = [
  { id: 'rock-pebbles', label: 'Pebble cluster', category: 'Rocks' },
  { id: 'rock-boulder', label: 'Round boulder', category: 'Rocks' },
  { id: 'rock-flat', label: 'Flat rock', category: 'Rocks' },
  { id: 'cliff-face', label: 'Cliff face · 4 m', category: 'Rocks' },
  { id: 'rock-ledge', label: 'Rock ledge', category: 'Rocks' },
  { id: 'wall-straight', label: 'Wall · 2 m', category: 'Walls' },
  { id: 'wall-corner', label: 'Wall corner', category: 'Walls' },
  { id: 'wall-end', label: 'End pillar', category: 'Walls' },
  { id: 'wall-broken', label: 'Broken wall · 2 m', category: 'Walls' },
  { id: 'wall-gate', label: 'Gate · 4 m', category: 'Walls' },
  { id: 'path-stones', label: 'Stepping stones · 2 m', category: 'Ground' },
  { id: 'stairs-stone', label: 'Stone stairs · 2 m', category: 'Ground' },
  { id: 'patch-dirt', label: 'Dirt patch', category: 'Ground' },
  { id: 'patch-gravel', label: 'Gravel patch', category: 'Ground' },
  { id: 'patch-moss', label: 'Moss patch', category: 'Ground' },
  { id: 'patch-puddle', label: 'Shallow puddle', category: 'Ground' },
  { id: 'plant-grass', label: 'Grass tuft', category: 'Plants' },
  { id: 'plant-bush', label: 'Round bush', category: 'Plants' },
  { id: 'plant-fern', label: 'Fern', category: 'Plants' },
  { id: 'plant-reeds', label: 'Reeds', category: 'Plants' },
  { id: 'log-fallen', label: 'Fallen log', category: 'Plants' },
  { id: 'cover-crate', label: 'Wooden crate', category: 'Cover' },
  { id: 'cover-barrel', label: 'Metal barrel', category: 'Cover' },
  { id: 'cover-barrier', label: 'Concrete barrier · 2 m', category: 'Cover' },
  { id: 'cover-timber', label: 'Stacked timber', category: 'Cover' },
  { id: 'cover-scrap', label: 'Scrap pile', category: 'Cover' },
] as const;
export type KitAsset = typeof KIT_ASSETS[number]['id'];
const palettes = {
  clean: { stone:'#87939b', shade:'#65737d', light:'#acb6ba', soil:'#796152', wood:'#967156', end:'#c5a079', metal:'#607c88', dark:'#3d505b', green:'#659769', leaf:'#94b675', top:'#b7c5ae' },
  mossy: { stone:'#798c83', shade:'#526e67', light:'#9eada0', soil:'#645e49', wood:'#79664e', end:'#b59b73', metal:'#617a77', dark:'#3d5650', green:'#648755', leaf:'#94aa67', top:'#87a767' },
  snowy: { stone:'#8b9baa', shade:'#687d94', light:'#b7c5d2', soil:'#7a8190', wood:'#877981', end:'#b9a6a2', metal:'#738b9f', dark:'#495f76', green:'#648c8a', leaf:'#9bb5ac', top:'#e3edf4' },
};
type Paint = keyof typeof palettes.clean;
const materialCaches = new WeakMap<Scene,Map<string,StandardMaterial>>();

/** Metre-scale, ground-origin props. Wall straight/end sockets sit on a 2 m grid.
 * Separate surface colors, merged by material, keep every asset reusable in GLB. */
export function createEnvironmentProp(scene: Scene, id: KitAsset, finish: KitFinish = 'clean', shadows?: ShadowGenerator): TransformNode {
  const root=new TransformNode(id,scene);
  root.metadata={asset:id,finish,kit:'environment-kit-v1',units:'metres',groundY:0};
  const parts:Mesh[]=[];
  const palette=palettes[finish];
  let seed=Array.from(id).reduce((n,c)=>Math.imul(n,31)+c.charCodeAt(0),97)>>>0;
  const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  let cache=materialCaches.get(scene);if(!cache){cache=new Map();materialCaches.set(scene,cache);}
  function material(paint:Paint):StandardMaterial {
    const key=`${finish}-${paint}`;let mat=cache!.get(key);if(mat)return mat;
    mat=new StandardMaterial(`kit-${key}`,scene);mat.diffuseColor=Color3.FromHexString(palette[paint]);
    mat.specularColor.set(.035,.035,.035);mat.emissiveColor=mat.diffuseColor.scale(.08);
    mat.backFaceCulling=false;mat.twoSidedLighting=true;cache!.set(key,mat);return mat;
  }
  function add(mesh:Mesh,paint:Paint,x=0,y=0,z=0):Mesh {
    // Procedural leaf/solid meshes need the same attribute set as Babylon primitives.
    if(!mesh.isVerticesDataPresent('uv'))mesh.setVerticesData('uv',new Float32Array(mesh.getTotalVertices()*2));
    if(!mesh.isVerticesDataPresent('color'))mesh.setVerticesData('color',new Float32Array(mesh.getTotalVertices()*4).fill(1));
    mesh.hasVertexAlpha=false;
    mesh.position.set(x,y,z);mesh.material=material(paint);parts.push(mesh);return mesh;
  }
  function box(w:number,h:number,d:number,x:number,y:number,z:number,paint:Paint='stone'):Mesh {
    return add(MeshBuilder.CreateBox(id,{width:w,height:h,depth:d},scene),paint,x,y,z);
  }
  function stone(x:number,y:number,z:number,w:number,h:number,d:number,paint:Paint='stone',variant=0):Mesh {
    const mesh=MeshBuilder.CreateIcoSphere(id,{radius:1,subdivisions:2,flat:true},scene);
    // Low-frequency deformation preserves shared vertices and broad anime facets.
    const positions=mesh.getVerticesData('position')!;
    for(let i=0;i<positions.length;i+=3){
      const px=positions[i],py=positions[i+1],pz=positions[i+2];
      const f=1+.08*Math.sin(px*3.1+pz*2.7+variant)*Math.cos(py*3.7+variant);
      positions[i]=px*w*.5*f;positions[i+1]=Math.max(-.48,py*.5)*h*f;positions[i+2]=pz*d*.5*f;
    }
    mesh.setVerticesData('position',positions);mesh.convertToFlatShadedMesh();add(mesh,paint,x,y,z);
    // Store continuous local height for painted surface blending, before merging
    // stones of different sizes and elevations. Alpha is data, not transparency.
    const surfacePoints=mesh.getVerticesData('position')!;
    const coverage:number[]=[];
    for(let i=0;i<surfacePoints.length;i+=3)coverage.push(1,1,1,.5+surfacePoints[i+1]/h);
    mesh.setVerticesData('color',coverage);mesh.hasVertexAlpha=false;
    if(finish!=='clean'&&(id.startsWith('rock-')||id==='cliff-face'||id==='plant-bush')){
      // Follow the actual upper facets so moss/snow cannot form floating discs.
      const points=mesh.getVerticesData('position')!,sourceNormals=mesh.getVerticesData('normal')!,sourceIndices=mesh.getIndices()!;
      const coverPositions:number[]=[],coverNormals:number[]=[],coverIndices:number[]=[];
      for(let t=0;t<sourceIndices.length;t+=3){
        const a=sourceIndices[t],b=sourceIndices[t+1],c=sourceIndices[t+2];
        if((points[a*3+1]+points[b*3+1]+points[c*3+1])/3<h*.10||sourceNormals[a*3+1]<.3)continue;
        for(const index of [a,b,c]){
          coverIndices.push(coverIndices.length);
          coverPositions.push(points[index*3],points[index*3+1]+.015,points[index*3+2]);
          coverNormals.push(sourceNormals[index*3],sourceNormals[index*3+1],sourceNormals[index*3+2]);
        }
      }
      if(coverIndices.length){const cover=new Mesh(`${id}-surface-cover`,scene),data=new VertexData();Object.assign(data,{positions:coverPositions,normals:coverNormals,indices:coverIndices});data.applyToMesh(cover);add(cover,'top',x,y,z);}
    }
    return mesh;
  }
  function cylinder(r:number,h:number,x:number,y:number,z:number,paint:Paint='wood',top=r):Mesh {
    return add(MeshBuilder.CreateCylinder(id,{diameter:2*r,diameterTop:2*top,height:h,tessellation:10},scene),paint,x,y,z);
  }
  function beam(a:Vector3,b:Vector3,r:number,paint:Paint='wood',tip=r*.85):Mesh {
    const delta=b.subtract(a),mesh=cylinder(r,delta.length(),...a.add(b).scale(.5).asArray() as [number,number,number],paint,tip);
    mesh.rotationQuaternion=Quaternion.FromUnitVectorsToRef(Vector3.Up(),delta.normalize(),new Quaternion());return mesh;
  }
  function cap(x:number,y:number,z:number,w:number,d:number):void {
    if(id.startsWith('rock-')||id==='cliff-face'||id==='plant-bush')return;
    if(finish!=='clean')stone(x,y,z,w,finish==='snowy'?.16:.08,d,'top',1);
  }
  function slab(x:number,y:number,z:number,w:number,d:number,paint:Paint='stone',h=.12):void {
    const mesh=cylinder(1,h,x,y,z,paint),positions=mesh.getVerticesData('position')!;
    for(let i=0;i<positions.length;i+=3){const a=Math.atan2(positions[i+2],positions[i]),f=1+.09*Math.sin(a*3+.4)+.06*Math.cos(a*5);positions[i]*=f;positions[i+2]*=f;}
    mesh.setVerticesData('position',positions);mesh.scaling.set(w*.5,1,d*.5);mesh.rotation.y=.18;
  }
  function wall(x:number,z:number,yaw=0,broken=false):void {
    const start=parts.length;
    for(let row=0;row<3;row++)for(let col=0;col<4;col++) {
      if(broken && row>0 && col>=(row===2?1:3))continue;
      box(.486,.425,.52,-.75+col*.5,.222+row*.44,0,(row+col)%3===0?'shade':'stone');
    }
    if(!broken){box(2,.16,.64,0,1.4,0,'light');if(finish!=='clean')box(2,.07,.63,0,1.515,0,'top');}
    else {stone(.45,.13,.36,.55,.26,.40,'light',3);stone(.85,.09,-.35,.35,.18,.30,'shade',2);}
    for(const part of parts.slice(start)){
      const px=part.position.x,pz=part.position.z;
      part.position.x=x+Math.cos(yaw)*px+Math.sin(yaw)*pz;
      part.position.z=z-Math.sin(yaw)*px+Math.cos(yaw)*pz;part.rotation.y+=yaw;
    }
  }
  function leaf(base:Vector3,tip:Vector3,width:number,paint:Paint):void {
    const axis=tip.subtract(base),side=Vector3.Cross(axis,Vector3.Up()).normalize().scale(width);
    if(side.lengthSquared()<.001)side.set(width,0,0);
    const middle=Vector3.Lerp(base,tip,.48),ridge=middle.add(new Vector3(0,.07,0));
    const vertices=[base,middle.add(side),tip,middle.subtract(side),ridge];
    const positions=vertices.flatMap(v=>v.asArray()),indices=[0,1,4,1,2,4,2,3,4,3,0,4],normals:number[]=[];
    VertexData.ComputeNormals(positions,indices,normals);
    const data=new VertexData();Object.assign(data,{positions,indices,normals});const mesh=new Mesh(id,scene);data.applyToMesh(mesh);add(mesh,paint);
  }
  function log(x:number,y:number,z:number,length:number,r:number,yaw=0):void {
    const direction=new Vector3(Math.sin(yaw),0,Math.cos(yaw)),center=new Vector3(x,y,z);
    beam(center.subtract(direction.scale(length/2)),center.add(direction.scale(length/2)),r,'wood',r);
    for(const sign of [-1,1]){
      const at=center.add(direction.scale(sign*(length/2+.004)));
      const end=cylinder(r*.87,.014,at.x,at.y,at.z,'end');end.rotation.x=Math.PI/2;end.rotation.z=-yaw;
      const ring=cylinder(r*.53,.017,at.x,at.y,at.z,'wood');ring.rotation.copyFrom(end.rotation);
      const core=cylinder(r*.43,.021,at.x,at.y,at.z,'end');core.rotation.copyFrom(end.rotation);
    }
    if(finish!=='clean'){const m=box(r*1.5,.065,length*.91,x,y+r*.9,z,'top');m.rotation.y=yaw;}
  }

  switch(id) {
    case 'rock-pebbles':
      for(let i=0;i<8;i++){const a=i*2.399,r=.2+rand()*.6,w=.25+rand()*.45;stone(Math.cos(a)*r,w*.19,Math.sin(a)*r,w,w*.5,w*.8,i%3?'stone':'light',i);}
      cap(0,.19,0,.8,.6);break;
    case 'rock-boulder':
      stone(0,.78,0,2.5,1.8,2.05,'stone',1);stone(-.90,.2,.55,.8,.5,.7,'shade',4);cap(-.12,1.55,0,1.7,1.35);break;
    case 'rock-flat':
      stone(0,.26,0,2.1,.63,1.5,'stone',4);cap(0,.57,0,1.6,1.1);break;
    case 'cliff-face':
      stone(-.9,1.35,0,2.4,2.9,1.65,'shade',3);stone(.9,1.55,.08,2.5,3.3,1.7,'stone',1);
      stone(.2,.35,.8,2.6,.9,.9,'light',6);cap(.8,3.07,.05,1.5,1.1);cap(-.9,2.7,0,1.3,1);break;
    case 'rock-ledge':
      stone(0,.5,0,2.9,1.1,1.9,'shade',4);stone(-.1,1.05,-.1,3.3,.55,2,'stone',8);cap(-.1,1.3,-.1,2.6,1.6);break;
    case 'wall-straight':wall(0,0);break;
    case 'wall-corner':wall(-1,0);wall(0,1,Math.PI/2);box(.62,1.58,.62,0,.79,0,'light');cap(0,1.6,0,.62,.62);break;
    case 'wall-end':box(.64,1.58,.64,0,.79,0);box(.76,.16,.76,0,1.58,0,'light');cap(0,1.7,0,.76,.76);break;
    case 'wall-broken':wall(0,0,0,true);break;
    case 'wall-gate':
      for(const x of [-1.75,1.75]){box(.5,2.5,.65,x,1.25,0);box(.68,.18,.8,x,2.53,0,'light');cap(x,2.65,0,.7,.8);}
      box(4,.24,.60,0,2.28,0,'wood');box(4.1,.14,.78,0,2.47,0,'end');
      for(let i=0;i<9;i++)box(.12,1.9,.12,-1.32+i*.33,1.05,0,'wood');
      for(const y of [.35,1.65])box(2.9,.13,.17,0,y,-.03,'end');break;
    case 'path-stones':
      for(let i=0;i<4;i++){slab((i%2-.5)*.55,.06,-.75+i*.5,.9,.62,i%2?'stone':'light');cap((i%2-.5)*.55,.13,-.75+i*.5,.72,.48);}break;
    case 'stairs-stone':
      for(let i=0;i<4;i++){box(2,(i+1)*.25,.5,0,(i+1)*.125,-.75+i*.5,i%2?'stone':'shade');box(2,.06,.5,0,(i+1)*.25,-.75+i*.5,'light');if(finish!=='clean')box(2,.035,.46,0,(i+1)*.25+.05,-.75+i*.5,'top');}break;
    case 'patch-dirt':case 'patch-gravel':case 'patch-moss':case 'patch-puddle': {
      const paint=id==='patch-moss'?'green':id==='patch-puddle'?'shade':'soil';
      slab(0,.018,0,2.7,2,paint,.035);
      for(let i=0;i<10;i++){
        const a=i*2.399,r=.35+rand()*.75,x=Math.cos(a)*r,z=Math.sin(a)*r*.65;
        if(id==='patch-puddle'){if(i<4)slab(x,.044,z,.45,.06,'metal',.008);}
        else if(id==='patch-gravel')stone(x,.06,z,.15+rand()*.17,.10,.14,i%2?'stone':'light',i);
        else slab(x,.042,z,.5+rand()*.3,.4,id==='patch-moss'?'leaf':'wood',.014);
      }
      if(finish==='snowy'){slab(-.75,.065,.2,.85,.7,'top',.035);slab(.7,.065,-.35,.75,.5,'top',.035);}
      break;
    }
    case 'plant-grass':
      for(let i=0;i<15;i++){const a=i*2.399,r=rand()*.3;leaf(new Vector3(Math.cos(a)*r,0,Math.sin(a)*r),new Vector3(Math.cos(a)*(.4+rand()*.3),.35+rand()*.5,Math.sin(a)*.5),.07,i%3?'green':'leaf');}break;
    case 'plant-bush':
      for(let i=0;i<6;i++){const a=i*2.399;stone(Math.cos(a)*.43,.48+rand()*.18,Math.sin(a)*.4,.95,1,1,i%2?'green':'leaf',i);}
      cap(0,1.05,0,1.2,1.1);break;
    case 'plant-fern':
      cylinder(.065,.20,0,.10,0,'green',.035);
      for(let i=0;i<7;i++){
        const a=i*2.399,dir=new Vector3(Math.cos(a),0,Math.sin(a));
        const points=Array.from({length:7},(_,j)=>dir.scale(j*.15).add(new Vector3(0,.12+Math.sin(j/6*Math.PI*.8)*.55,0)));
        for(let j=0;j<6;j++)beam(points[j],points[j+1],.018,'green',.012);
        for(let j=1;j<6;j++)for(const sign of [-1,1]){
          const side=new Vector3(-dir.z,0,dir.x).scale(sign*(.28-j*.027));
          leaf(points[j],points[j].add(side).add(dir.scale(.10)).add(new Vector3(0,.06,0)),.07,j%2?'green':'leaf');
        }
      }break;
    case 'plant-reeds':
      for(let i=0;i<8;i++){
        const a=i*2.399,x=Math.cos(a)*.35,z=Math.sin(a)*.35,h=1.1+rand()*.6;
        beam(new Vector3(x,0,z),new Vector3(x+.07,h,z),.025,'green',.018);
        cylinder(.065,.32,x+.07,h-.05,z,'wood');leaf(new Vector3(x,.1,z),new Vector3(x+Math.cos(a)*.55,h*.7,z+Math.sin(a)*.55),.07,'leaf');
      }break;
    case 'log-fallen':log(0,.30,0,2.6,.30);beam(new Vector3(.1,.4,.3),new Vector3(.65,.65,.35),.09,'wood',.035);break;
    case 'cover-crate':
      box(1.15,1.1,1.15,0,.55,0,'shade');
      for(let i=0;i<5;i++){
        const x=-.46+i*.23;
        for(const z of [-.59,.59])box(.215,1.08,.065,x,.56,z,i%2?'wood':'end');
        for(const side of [-.59,.59])box(.065,1.08,.215,side,.56,x,i%2?'wood':'end');
        box(.215,.07,1.15,x,1.13,0,'wood');
      }
      for(const y of [.12,1.02])for(const z of [-.64,.64])box(1.3,.14,.10,0,y,z,'end');
      for(const z of [-.65,.65]){const brace=box(1.36,.12,.09,0,.56,z,'end');brace.rotation.z=.65;}
      cap(0,1.22,0,1.2,1.15);break;
    case 'cover-barrel':
      cylinder(.43,1.15,0,.575,0,'metal');
      for(const y of [.08,.31,.84,1.10])cylinder(.455,.065,0,y,0,'dark');
      cylinder(.42,.035,0,1.17,0,'light');cylinder(.07,.025,.19,1.2,0,'dark');cap(-.05,1.22,0,.72,.72);break;
    case 'cover-barrier': {
      const positions=[-1,0,-.4,1,0,-.4,1,0,.4,-1,0,.4,-1,1.05,-.19,1,1.05,-.19,1,1.05,.19,-1,1.05,.19];
      const indices=[0,2,1,0,3,2,0,1,5,0,5,4,1,2,6,1,6,5,2,3,7,2,7,6,3,0,4,3,4,7,4,5,6,4,6,7],normals:number[]=[];
      VertexData.ComputeNormals(positions,indices,normals);const data=new VertexData();Object.assign(data,{positions,indices,normals});
      const mesh=new Mesh(id,scene);data.applyToMesh(mesh);mesh.convertToFlatShadedMesh();add(mesh,'stone');
      box(2.08,.12,.85,0,.06,0,'shade');for(const x of [-.65,0,.65])box(.24,.12,.405,x,.94,0,'light');
      if(finish!=='clean')box(2,.065,.4,0,1.075,0,'top');break;
    }
    case 'cover-timber':for(let row=0;row<2;row++)for(let col=0;col<3-row;col++)log((col-(2-row)*.5)*.48,.24+row*.42,0,2.4,.235);break;
    case 'cover-scrap':
      for(let i=0;i<7;i++){const m=box(.5+rand()*.5,.14,.5+rand()*.6,(rand()-.5)*1.4,.14+i*.055,(rand()-.5)*.8,i%2?'metal':'dark');m.rotation.set(rand()*.5,rand()*3,rand()*.4);}
      for(let i=0;i<3;i++)beam(new Vector3(-.7+i*.35,.15,-.6),new Vector3(-.4+i*.35,.4,.7),.09,'shade',.09);
      cap(0,.65,0,.75,.55);break;
  }
  // Bake and merge each color group, retaining stable origin and modular sockets.
  const groups=new Map<StandardMaterial,Mesh[]>();
  for(const part of parts){const mat=part.material as StandardMaterial;const group=groups.get(mat)??[];group.push(part);groups.set(mat,group);}
  for(const [mat,group] of groups){const mesh=Mesh.MergeMeshes(group,true,true)!;mesh.name=`${id}-${mat.name}`;mesh.parent=root;mesh.isPickable=false;mesh.receiveShadows=true;shadows?.addShadowCaster(mesh);}
  if(id.startsWith('wall-'))root.metadata.sockets=id==='wall-straight'||id==='wall-broken'?[[-1,0,0],[1,0,0]]:id==='wall-corner'?[[-2,0,0],[0,0,2]]:id==='wall-gate'?[[-2,0,0],[2,0,0]]:[[0,0,0]];
  return root;
}
