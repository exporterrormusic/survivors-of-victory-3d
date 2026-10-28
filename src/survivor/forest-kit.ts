import { Color3, Mesh, MeshBuilder, StandardMaterial, Texture, TransformNode, Vector3, VertexData, type Scene } from '@babylonjs/core';
import { createJackOLantern } from './jack-o-lantern';
import { createVapausVial } from './vapaus-vial';

export const FOREST_ASSETS=['forest-lamp','forest-lychgate','forest-chapel','forest-grave','forest-cross','forest-fence',
  'forest-menhir','forest-altar','forest-cabin','forest-woodpile','forest-well','forest-thorn','forest-jack-o-lantern','forest-vapaus-vial'] as const;
export type ForestAsset=typeof FOREST_ASSETS[number];
export function isForestAsset(asset:string):asset is ForestAsset{return (FOREST_ASSETS as readonly string[]).includes(asset);}
type Surface='stone'|'wood'|'shingle'|'iron'|'ghost'|'moss'|'thorn'|'rope'|'water';

/** Dedicated weathered surfaces, shared by every forest prop. Only lanterns/runes emit light. */
export class ForestMaterials {
  readonly materials=new Map<Surface,StandardMaterial>();
  constructor(scene:Scene){
    const tint:Record<Surface,string>={stone:'#d4d8db',wood:'#d9cbb9',shingle:'#c7d0d8',iron:'#b3b6b8',ghost:'#000000',moss:'#b0b49b',thorn:'#796b5b',rope:'#d8cbb4',water:'#8997a3'};
    for(const kind of Object.keys(tint) as Surface[]){
      const m=new StandardMaterial(`forest-${kind}`,scene);
      m.metadata={softEnvironment:true};m.specularColor.set(.05,.05,.05);m.diffuseColor=Color3.FromHexString(tint[kind]);
      if(kind==='ghost'){m.emissiveColor.set(.42,.95,.86);m.disableLighting=true;}
      else {
        const surface=kind==='thorn'?'wood':kind;
        const base=`${import.meta.env.BASE_URL}environment/forest-kit-v2/${surface}`;
        m.diffuseTexture=new Texture(`${base}.webp`,scene);
        m.diffuseTexture.anisotropicFilteringLevel=8;
        m.bumpTexture=new Texture(`${base}-normal.png`,scene);m.bumpTexture.level=.45;
        if(kind==='iron'){m.specularColor.set(.22,.24,.25);m.specularPower=48;}
        if(kind==='water'){m.specularColor.set(.38,.43,.49);m.specularPower=96;m.bumpTexture.level=.25;}
      }
      this.materials.set(kind,m);
    }
  }
  get(kind:Surface):StandardMaterial{return this.materials.get(kind)!;}
}

/** Metre-scale haunted-forest architecture. Local -Z is each asset's front. */
export function createForestAsset(scene:Scene,asset:ForestAsset,materials:ForestMaterials):TransformNode{
  if(asset==='forest-jack-o-lantern')return createJackOLantern(scene);
  if(asset==='forest-vapaus-vial')return createVapausVial(scene);
  const root=new TransformNode(asset,scene),parts:Mesh[]=[];
  const finish=(m:Mesh,kind:Surface)=>{
    m.parent=root;m.material=materials.get(kind);m.isPickable=false;m.receiveShadows=true;
    // Local metre-scale projection: walls and beams no longer stretch one atlas panel
    // over their entire length. Project before rotation so wood grain follows each beam.
    if(kind!=='ghost'){
      const pos=m.getVerticesData('position')!,norm=m.getVerticesData('normal')!,uv:number[]=[];
      const scale=kind==='stone'?1.4:kind==='wood'?1.8:1;
      const size=m.getBoundingInfo().boundingBox.extendSize;
      const grainX=kind==='wood'&&size.x>size.y&&size.x>size.z;
      const grainZ=kind==='wood'&&size.z>size.y&&size.z>size.x;
      for(let i=0;i<pos.length;i+=3){
        const ax=Math.abs(norm[i]),ay=Math.abs(norm[i+1]),az=Math.abs(norm[i+2]);
        if(grainX)uv.push((ay>=az?pos[i+2]:pos[i+1])/scale,pos[i]/scale);
        else if(grainZ)uv.push((ay>=ax?pos[i]:pos[i+1])/scale,pos[i+2]/scale);
        else uv.push((ay>=ax&&ay>=az?pos[i]:ax>=az?pos[i+2]:pos[i])/scale,
          (ay>=ax&&ay>=az?pos[i+2]:pos[i+1])/scale);
      }
      m.setVerticesData('uv',uv);
    }
    parts.push(m);return m;
  };
  const box=(x:number,y:number,z:number,w:number,h:number,d:number,kind:Surface='wood',ry=0,rz=0,rx=0)=>{
    const m=MeshBuilder.CreateBox(asset,{width:w,height:h,depth:d},scene);m.position.set(x,y,z);m.rotation.set(rx,ry,rz);return finish(m,kind);
  };
  const cyl=(x:number,y:number,z:number,h:number,bottom:number,top:number,kind:Surface='stone',sides=10,rz=0,rx=0)=>{
    const m=MeshBuilder.CreateCylinder(asset,{height:h,diameterBottom:bottom,diameterTop:top,tessellation:sides},scene);m.position.set(x,y,z);m.rotation.set(rx,0,rz);return finish(m,kind);
  };
  const sphere=(x:number,y:number,z:number,d:number,kind:Surface)=>{const m=MeshBuilder.CreateSphere(asset,{diameter:d,segments:6},scene);m.position.set(x,y,z);return finish(m,kind);};
  // Separate radial masonry blocks, including the inner faces of an open shaft.
  const ring=(y:number,inner:number,outer:number,height:number,count:number,offset=0,kind:Surface='stone')=>{
    for(let i=0;i<count;i++){
      const a=(i+offset)*Math.PI*2/count+.012,b=(i+1+offset)*Math.PI*2/count-.012;
      const points:number[]=[];
      for(const h of [-height/2,height/2])for(const [r,t] of [[inner,a],[outer,a],[outer,b],[inner,b]])points.push(Math.cos(t)*r,y+h,Math.sin(t)*r);
      const indices=[0,2,1,0,3,2,4,5,6,4,6,7,0,1,5,0,5,4,1,2,6,1,6,5,2,3,7,2,7,6,3,0,4,3,4,7];
      const normals:number[]=[];VertexData.ComputeNormals(points,indices,normals);
      const m=new Mesh(`${asset}-masonry`,scene),data=new VertexData();
      Object.assign(data,{positions:points,indices,normals});data.applyToMesh(m);m.convertToFlatShadedMesh();finish(m,kind);
    }
  };
  const tube=(points:Vector3[],radius:number,kind:Surface)=>finish(MeshBuilder.CreateTube(asset,{path:points,radius,tessellation:8,cap:Mesh.CAP_ALL},scene),kind);
  // Gabled shingle roof from two tilted slabs; the ridge runs along Z, or along X when `alongX`.
  const gable=(y:number,w:number,d:number,pitch:number,z=0,alongX=false)=>{
    const half=w/2/Math.cos(pitch),rise=y+Math.tan(pitch)*w/4;
    for(const s of [-1,1]){
      if(alongX)box(0,rise,z+s*w/4,d,.16,half+.25,'shingle',0,0,s*pitch);
      else box(s*w/4,rise,z,half+.25,.16,d,'shingle',0,-s*pitch);
    }
    box(0,y+Math.tan(pitch)*w/2+.05,z,alongX?d+.1:.22,.22,alongX?.22:d+.1,'wood');
    // Overlapping slate courses break the slab silhouette, including visible eaves.
    const courses=Math.max(3,Math.ceil(half/.38)),columns=Math.ceil(d/.48);
    for(const s of [-1,1])for(let row=0;row<courses;row++)for(let col=0;col<columns;col++){
      const t=(row+.5)/courses*w/2,u=-d/2+(col+.5)*d/columns;
      const h=y+Math.tan(pitch)*(w/2-t)+.13+(col%3)*.008;
      if(alongX)box(u,h,z+s*t,d/columns-.012,.055,half/courses+.1,'shingle',0,0,s*pitch);
      else box(s*t,h,z+u,half/courses+.1,.055,d/columns-.012,'shingle',0,-s*pitch);
    }
  };
  // Iron cage lantern holding a ghost-light.
  const lantern=(x:number,y:number,z:number,size=1)=>{
    box(x,y,z,.26*size,.34*size,.26*size,'ghost');
    for(const a of [-1,1])for(const b of [-1,1])box(x+a*.15*size,y,z+b*.15*size,.04,.42*size,.04,'iron');
    cyl(x,y+.25*size,z,.12,.42*size,.12,'iron',4);
    box(x,y-.21*size,z,.36*size,.05,.36*size,'iron');
  };

  if(asset==='forest-lamp'){
    cyl(0,.15,0,.3,.9,.8,'stone',8);
    box(0,1.0,0,.34,1.7,.34,'stone');
    box(0,1.9,0,.5,.12,.5,'stone');
    box(.28,2.05,0,.7,.08,.08,'iron');
    lantern(.55,1.72,0,1);
    sphere(-.05,1.95,.12,.18,'moss');
  }else if(asset==='forest-lychgate'){
    for(const x of [-3.4,3.4]){
      cyl(x,.2,0,.4,.85,.75,'stone',8);
      box(x,2.1,0,.38,3.6,.38,'wood');
      for(const z of [-1,1])box(x,2.0,z*.55,.24,3.3,.24,'wood',0,0,z*.18);
      box(x+Math.sign(x)*-.45,3.55,0,.9,.18,.22,'wood',0,Math.sign(x)*.6);
    }
    box(0,3.95,0,7.6,.32,.32,'wood');
    box(0,4.35,0,7.2,.22,1.6,'wood');
    gable(4.3,3.4,8.6,.75,0,true);
    box(0,3.5,-.2,.04,.6,.04,'iron');lantern(0,3.05,-.2,1.15);
    box(0,4.0,-.2,1.6,.5,.08,'wood');
  }else if(asset==='forest-chapel'){
    // Nave 7 x 11, open doorway in the front gable, roof fallen in at the back.
    box(0,.15,0,7.6,.3,11.6,'stone');
    for(const s of [-1,1]){
      box(s*3.4,1.9,1,.6,3.4,9,'stone');
      for(const z of [-1.5,1.8,4.6])box(s*3.42,2.3,z,.64,1.2,.7,'ghost');
      for(const z of [-4.8,-1.5,1.8,5.2])box(s*3.9,1.4,z,.5,2.6,.6,'stone');
      box(s*2.6,2.0,-5.3,1.8,3.6,.6,'stone');
    }
    box(0,3.6+.05,-5.3,1.6,.6,.6,'stone');
    // Front gable.
    for(let i=0;i<4;i++)box(0,3.95+i*.45,-5.3,7-i*1.7,.45,.6,'stone');
    cyl(0,5.85,-5.35,.2,.8,.8,'ghost',12,0,Math.PI/2);
    box(0,6.9,-5.3,.18,1.1,.18,'iron');box(0,7.15,-5.3,.6,.14,.14,'iron');
    // Surviving front half of the roof; bare rafters behind it.
    gable(3.6,7.4,5,.55,-2.8);
    for(const z of [1,2.6,4.2])for(const s of [-1,1])box(s*1.8,4.6,z,4.4,.2,.2,'wood',0,-s*.55);
    box(0,5.6,2.2,.24,.24,4.2,'wood',0,0,.25);
    // Fallen beam and rubble beside the rear wall.
    box(4.8,.35,3.5,.35,.35,4.4,'wood',.5,0,.15);
    for(const [x,z] of [[4.6,1],[-4.4,4.8],[-4.6,.6]] as const)box(x,.25,z,.8,.5,.7,'stone',x);
    box(0,.8,4.6,1.6,1,1,'stone');lantern(0,1.6,4.6,.9);
    sphere(-3.4,3.7,3,.9,'moss');sphere(3.4,3.6,-3,.7,'moss');
  }else if(asset==='forest-grave'){
    box(0,.06,0,.95,.12,1.7,'moss');
    box(0,.62,-.6,.72,1.0,.18,'stone',0,.04,-.06);
    cyl(0,1.12,-.6,.18,.72,.72,'stone',12,0,Math.PI/2);
    box(0,.18,-.6,.86,.18,.32,'stone');
    box(0,.73,-.705,.045,.34,.018,'iron');box(0,.8,-.705,.22,.035,.018,'iron');
    for(let i=0;i<3;i++)box(0,.48-i*.07,-.708,.32-i*.05,.012,.012,'iron');
    for(let i=0;i<4;i++)sphere(-.3+i*.17,.13,-.55,.19,'moss').scaling.y=.25;
  }else if(asset==='forest-cross'){
    box(0,.06,0,.95,.12,1.7,'moss');
    box(0,.75,-.6,.16,1.4,.16,'wood',0,.08);
    box(.04,1.15,-.6,.8,.14,.14,'wood',0,.08);
    for(let i=0;i<4;i++)box(0,1.06+i*.045,-.69,.23,.024,.025,'rope',0,.32);
  }else if(asset==='forest-fence'){
    for(const x of [-1.6,1.6]){box(x,.55,0,.42,1.1,.42,'stone');box(x,1.15,0,.5,.12,.5,'stone');}
    for(const y of [.35,1.05])box(0,y,0,3.2,.06,.06,'iron');
    for(let i=0;i<9;i++){const x=-1.25+i*.31;box(x,.7,0,.05,1.3,.05,'iron');box(x,1.4,0,.08,.14,.08,'iron',0,0,Math.PI/4);}
  }else if(asset==='forest-menhir'){
    box(0,1.65,0,1.1,3.3,.7,'stone',0,.05);
    box(0,3.3,0,.8,.5,.55,'stone',0,.2);
    box(0,1.9,-.36,.12,1.6,.03,'ghost');box(0,2.2,-.36,.5,.1,.03,'ghost');box(0,1.5,-.36,.36,.1,.03,'ghost',0,.5);
    sphere(.4,.4,.1,.7,'moss');
  }else if(asset==='forest-altar'){
    box(0,.08,0,3.0,.16,1.65,'stone');
    for(const x of [-.9,.9])box(x,.45,0,.6,.9,1.0,'stone');
    box(0,1.0,0,2.8,.28,1.4,'stone',0,.02);
    box(0,.83,0,2.65,.1,1.3,'stone');
    for(const [x,z] of [[-1,-.4],[.2,.4],[1.1,-.3]] as const){cyl(x,1.22,z,.18,.12,.12,'stone',6);box(x,1.38,z,.06,.12,.06,'ghost');}
  }else if(asset==='forest-cabin'){
    // Walk-in 6 x 5 cabin. The roof is individual supported shingles, never a
    // tilted slab pushed through the walls. Local -Z doorway is 1.8 m clear.
    for(let row=0;row<7;row++){
      const y=.24+row*.38;
      cyl(0,y,2.5,6.35,.39,.36,'wood',12,Math.PI/2);
      if(row<6)for(const s of [-1,1])cyl(s*1.99,y,-2.5,2.18,.39,.36,'wood',12,Math.PI/2);
      else cyl(0,y,-2.5,6.35,.39,.36,'wood',12,Math.PI/2);
      for(const x of [-3,3]){
        // Actual window apertures through both side walls.
        if(row>=3&&row<=4){
          cyl(x,y,-1.96,1.35,.39,.36,'wood',12,0,Math.PI/2);
          cyl(x,y,1.26,2.85,.39,.36,'wood',12,0,Math.PI/2);
        }else cyl(x,y,0,5.4,.39,.36,'wood',12,0,Math.PI/2);
      }
    }
    // Flush floorboards follow gameplay ground height; the threshold has no step.
    for(let i=0;i<15;i++)box(-2.8+i*.4,.005,0,.385,.04,4.85,'wood');
    for(const x of [-.96,.96])box(x,1.22,-2.54,.14,2.44,.22,'wood');
    box(0,2.46,-2.54,2.1,.17,.26,'wood');
    box(0,.015,-2.7,1.8,.045,.5,'wood');
    // Door hangs open against the outer wall, away from the entrance corridor.
    for(let i=0;i<5;i++)box(-1.19-i*.17,1.1,-2.83,.16,2.08,.09,'wood');
    for(const y of [.4,1.75])box(-1.53,y,-2.91,.82,.1,.08,'iron');
    for(const x of [-3.02,3.02]){
      for(const z of [-1.31,-.14])box(x,1.59,z,.2,.94,.1,'wood');
      for(const y of [1.13,2.03])box(x,y,-.72,.24,.12,1.3,'wood');
      box(x,1.6,-.72,.12,.78,.045,'iron');
    }
    // Surviving gable at the back, with a broken front gable above the lintel.
    for(let row=0;row<4;row++){
      const w=5.6-row*1.3;
      box(0,2.82+row*.35,2.5,w,.33,.22,'wood');
      if(row<2)box(-.4,2.82+row*.35,-2.5,w-.8,.33,.22,'wood');
    }
    const pitch=.49,halfWidth=3.35,ridge=2.85+Math.tan(pitch)*halfWidth;
    for(const x of [-3,3])box(x,2.77,0,.22,.22,5.7,'wood');
    box(0,ridge,0,.22,.24,5.65,'wood');
    for(const z of [-2.5,-.85,.8,2.5]){
      // The missing front-right rafter ends near the ridge; all others meet wall plates.
      for(const side of [-1,1]){
        const broken=side===1&&z===-.85,span=broken?1.05:halfWidth;
        box(side*span/2,ridge-Math.tan(pitch)*span/2,z,span/Math.cos(pitch),.16,.16,'wood',0,-side*pitch);
      }
      if(z>=.8)box(0,2.8,z,6.1,.16,.17,'wood');
    }
    for(const side of [-1,1])for(let row=0;row<8;row++)for(let col=0;col<12;col++){
      // Broad roof collapse on the approach side, ragged but structurally legible.
      if(side===1&&col<7&&row>1+(col%3))continue;
      if(side===-1&&col<2&&row>4)continue;
      if(side===-1&&col===5&&row===5)continue;
      const t=(row+.5)*halfWidth/8,z=-2.8+(col+.5)*5.6/12;
      box(side*t,ridge-Math.tan(pitch)*t+.14,z,halfWidth/8/Math.cos(pitch)+.065,.055,5.6/12-.015,'shingle',0,-side*pitch);
    }
    // Roof battens under the surviving tile runs; short exposed ends show the collapse.
    for(const side of [-1,1])for(let row=0;row<8;row++){
      const t=(row+.5)*halfWidth/8;
      const front=side===1&&row>1?.43:side===-1&&row>4?-1.86:-2.8;
      box(side*t,ridge-Math.tan(pitch)*t+.06,(front+2.8)/2,.09,.07,2.8-front,'wood',0,-side*pitch);
    }
    // Chimney is outside the wall. Courses and an open, soot-dark flue cap.
    for(let row=0;row<11;row++)box(3.48,.2+row*.37,1.7,.72,.35,.85,'stone');
    for(const x of [3.12,3.84])box(x,4.22,1.7,.16,.18,1.03,'stone');
    for(const z of [1.26,2.14])box(3.48,4.22,z,.58,.18,.15,'stone');
    box(3.48,4.08,1.7,.5,.03,.65,'iron');
    // Low collapsed timber rests at the rear; the central walkable floor stays clear.
    for(let i=0;i<4;i++)box(1.5-i*.22,.09+i*.045,1.75,.12,.12,1.1+i*.16,'wood',.45+i*.23);
    for(let i=0;i<5;i++)box(1.8-i*.25,.06,1.1+(i%2)*.3,.32,.045,.4,'shingle',i*.7);
    for(let i=0;i<6;i++){
      const m=sphere(-2.8+i*.24,.14,2.66,.25,'moss');m.scaling.y=.22;
    }
  }else if(asset==='forest-woodpile'){
    for(let row=0;row<3;row++)for(let i=0;i<5-row;i++)cyl(-1.1+row*.26+i*.52,.27+row*.44,0,1.7,.5,.5,'wood',8,0,Math.PI/2);
    for(const x of [-1.5,1.5])box(x,.7,0,.16,1.4,.16,'wood');
    box(1.9,.3,-.6,.6,.6,.6,'wood');box(1.95,.75,-.6,.06,.5,.06,'iron',0,.4);
  }else if(asset==='forest-thorn'){
    // Dead briar: bare, crooked canes arching out of one root, each with a few spurs.
    for(let i=0;i<9;i++){
      const a=i*2.399,lean=.45+(i%3)*.18,h=.9+((i*5)%4)*.22;
      const cane=cyl(Math.cos(a)*.25,h/2*Math.cos(lean),Math.sin(a)*.25,h,.07,.02,'thorn',5);
      cane.rotation.set(Math.sin(a)*lean,0,-Math.cos(a)*lean);
      for(const t of [.35,.65]){
        const spur=cyl(Math.cos(a)*(.25+Math.sin(lean)*h*t),h*t*Math.cos(lean),Math.sin(a)*(.25+Math.sin(lean)*h*t),.32,.035,.005,'thorn',4);
        spur.rotation.set(Math.sin(a+1.4)*1.1,0,-Math.cos(a+1.4)*1.1);
      }
    }
    sphere(0,.08,0,.5,'thorn').scaling.y=.4;
  }else if(asset==='forest-well'){
    // Open well: staggered stone courses, thick coping and water far below the rim.
    ring(.08,.76,1.22,.16,14);
    for(let row=0;row<4;row++)ring(.21+row*.22,.77,1.1,.205,14,(row%2)*.5);
    ring(1.03,.72,1.18,.22,14,.25);
    cyl(0,.105,0,.015,1.51,1.51,'water',48);
    for(const x of [-1.02,1.02]){
      box(x,1.65,0,.2,2.5,.24,'wood');
      for(const y of [.5,1.15,2.15])box(x,y,0,.22,.065,.26,'iron');
      box(x-Math.sign(x)*.19,2.57,0,.12,.7,.14,'wood',0,-Math.sign(x)*.55);
      for(const y of [1.15,2.15])sphere(x,y,-.14,.065,'iron');
    }
    box(0,2.9,0,2.5,.2,.25,'wood');gable(2.88,2.65,1.85,.55);
    cyl(0,2.05,0,2.42,.16,.16,'wood',16,Math.PI/2);
    for(const x of [-1.14,1.14])cyl(x,2.05,0,.1,.27,.27,'iron',16,Math.PI/2);
    box(1.28,1.89,0,.09,.4,.09,'iron');cyl(1.42,1.7,0,.3,.09,.09,'wood',12,Math.PI/2);
    const coil:Vector3[]=[];
    for(let i=0;i<=160;i++){const t=i/160;coil.push(new Vector3(-.25+t*.5,2.05+Math.cos(t*Math.PI*20)*.105,Math.sin(t*Math.PI*20)*.105));}
    tube(coil,.022,'rope');tube([new Vector3(.25,2.05,.105),new Vector3(.25,.48,.105)],.018,'rope');
    // Staved bucket rests on the coping, with an open mouth and forged handle.
    const start=parts.length;
    ring(.22,.145,.19,.38,12,0,'wood');
    ring(.08,.14,.202,.04,24,0,'iron');ring(.36,.14,.202,.04,24,0,'iron');
    cyl(0,.04,0,.035,.31,.31,'wood',16);
    const handle:Vector3[]=[];
    for(let i=0;i<=16;i++){const a=i/16*Math.PI;handle.push(new Vector3(Math.cos(a)*.18,.38+Math.sin(a)*.23,0));}
    tube(handle,.013,'iron');
    for(const p of parts.slice(start))p.position.addInPlace(new Vector3(-.46,1.15,-.83));
    for(let i=0;i<9;i++){
      const a=i*2.4,m=sphere(Math.cos(a)*1.06,.14+(i%3)*.22,Math.sin(a)*1.06,.17+(i%2)*.08,'moss');m.scaling.y=.32;
    }
  }
  for(const material of materials.materials.values()){
    const group=parts.filter(p=>p.material===material);
    if(group.length){const merged=Mesh.MergeMeshes(group,true,true)!;merged.name=`${asset}-${material.name}`;merged.parent=root;merged.isPickable=false;merged.receiveShadows=true;}
  }
  root.metadata={asset,units:'metres'};return root;
}
