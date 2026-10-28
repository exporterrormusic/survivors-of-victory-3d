import { Mesh, MeshBuilder, StandardMaterial, TransformNode, Vector3, VertexData, type Scene, type ShaderMaterial, type ShadowGenerator } from '@babylonjs/core';
import { CALDERA_MAX_ADVANCE, CALDERA_SHORE, calderaShoreRadius } from './caldera-layout';
import { calderaRockMaterial, calderaTexture, createCalderaLava } from './caldera-materials';

function geometry(scene:Scene,name:string,positions:number[],indices:number[],uvs:number[]):Mesh {
  const normals:number[]=[];VertexData.ComputeNormals(positions,indices,normals);
  const mesh=new Mesh(name,scene),data=new VertexData();Object.assign(data,{positions,indices,normals,uvs});data.applyToMesh(mesh);
  mesh.isPickable=false;mesh.receiveShadows=true;return mesh;
}

/** Replace each existing obstacle in place, retaining its footprint and layout. */
export function createCalderaProp(scene:Scene,asset:string):TransformNode {
  const root=new TransformNode(`caldera-${asset}`,scene),rock=calderaRockMaterial(scene),parts:Mesh[]=[];
  const attach=(m:Mesh)=>{m.parent=root;m.material=rock;m.isPickable=false;m.receiveShadows=true;parts.push(m);return m;};
  const column=(x:number,z:number,r:number,h:number,seed:number)=>{
    const p:number[]=[],uv:number[]=[],idx:number[]=[];
    for(let row=0;row<5;row++)for(let side=0;side<=6;side++){
      const a=side/6*Math.PI*2+.15,rr=r*(1-.12*row/4)*(1+.06*Math.sin(row*3+seed));
      const y=row/4*h+(row===4?.12*Math.sin(side*2+seed):0);
      p.push(x+Math.cos(a)*rr+.05*row*Math.sin(seed),y,z+Math.sin(a)*rr);uv.push(side/6,row*h*.35);
      if(row<4&&side<6){const k=row*7+side;idx.push(k,k+1,k+7,k+1,k+8,k+7);}
    }
    p.push(x,h,z);uv.push(.5,.5);for(let i=0;i<6;i++)idx.push(35,28+i,29+i);
    return attach(geometry(scene,'caldera-column',p,idx,uv));
  };
  if(asset==='dead-pine'){
    const char=new StandardMaterial('caldera-charred-wood',scene);char.diffuseTexture=calderaTexture(scene,'basalt.webp');char.diffuseColor.set(.19,.16,.14);char.specularColor.set(.02,.02,.02);char.metadata={softEnvironment:true};
    const stem=attach(MeshBuilder.CreateTube('caldera-charred-snag',{path:[new Vector3(0,0,0),new Vector3(.15,1.7,0),new Vector3(-.15,3.7,.1),new Vector3(.25,5.9,.05)],radiusFunction:i=>.29-i*.065,tessellation:9,cap:Mesh.CAP_ALL},scene));stem.material=char;
    for(let i=0;i<5;i++){
      const a=i*2.4,y=1.3+i*.75,m=attach(MeshBuilder.CreateTube('caldera-burnt-branch',{path:[new Vector3(0,y,0),new Vector3(Math.cos(a)*.65,y+.28,Math.sin(a)*.65),new Vector3(Math.cos(a)*.95,y+.7,Math.sin(a)*.95)],radiusFunction:j=>.095-j*.035,tessellation:6,cap:Mesh.CAP_ALL},scene));m.material=char;
    }
  }else if(asset==='cliff-face'){
    for(let i=0;i<9;i++)column((i%3-1)*.95,Math.floor(i/3)*.42-.42,.55,1.5+((i*7)%5)*.43,i*1.7);
  }else if(asset==='rock-flat'){
    for(let i=0;i<4;i++)column(Math.cos(i*2.4)*.45,Math.sin(i*2.4)*.32,.42,.25+(i%3)*.12,i);
  }else{
    // Jointed rock rather than a uniformly faceted grey sphere.
    for(const [x,z,r,h,s] of [[0,0,.88,1.6,1],[-.73,.35,.58,.9,2],[.62,.1,.5,1.1,4],[.1,-.65,.48,.65,6]])column(x,z,r,h,s);
  }
  for(const mat of new Set(parts.map(p=>p.material))){const group=parts.filter(p=>p.material===mat);const m=Mesh.MergeMeshes(group,true,true)!;m.parent=root;m.isPickable=false;m.receiveShadows=true;}
  return root;
}

/** The basin is ringed by a lava sea that creeps inward over the round, under a basalt massif. */
export class CalderaArt {
  readonly moatLava:ShaderMaterial;
  readonly rock:StandardMaterial;
  constructor(private scene:Scene,root:TransformNode,shadows:ShadowGenerator,edge:number){
    this.rock=calderaRockMaterial(scene);this.moatLava=createCalderaLava(scene,'caldera-moat-lava',1,false,1);
    // A continuous rock massif, not spaced decorative columns: no sightline gaps.
    const wp:number[]=[],wu:number[]=[],wi:number[]=[],count=256;
    for(let row=0;row<5;row++)for(let i=0;i<=count;i++){
      const a=i/count*Math.PI*2,r=[edge+5,edge+6,edge+11,edge+26,edge+45][row]+Math.sin(a*19)*.7;
      const h=[-2,11,18,24,16][row]+(row===0?0:2*Math.sin(a*7)+1.4*Math.sin(a*17));
      wp.push(Math.cos(a)*r,h,Math.sin(a)*r);wu.push(i/count*40,row*2);
      if(row<4&&i<count){const k=row*(count+1)+i;wi.push(k,k+count+1,k+1,k+1,k+count+1,k+count+2);}
    }
    const boundary=geometry(scene,'caldera-basalt-escarpment',wp,wi,wu);boundary.material=this.rock;boundary.parent=root;boundary.metadata={cameraOcclusionDisabled:true};
    const lp:number[]=[],lu:number[]=[],li:number[]=[];
    for(let row=0;row<=8;row++)for(let i=0;i<=count;i++){
      // Starts inside the furthest advance: the shader cuts the ragged, moving edge; it runs under the massif.
      const a=i/count*Math.PI*2,f=row/8,r=(calderaShoreRadius(a)-3-CALDERA_MAX_ADVANCE)*(1-f)+(edge+12)*f;
      lp.push(Math.cos(a)*r,.08,Math.sin(a)*r);lu.push(i/count*32,f*2);
      if(row<8&&i<count){const k=row*(count+1)+i;li.push(k,k+count+1,k+1,k+1,k+count+1,k+count+2);}
    }
    const moat=geometry(scene,'caldera-perimeter-lava',lp,li,lu);moat.material=this.moatLava;moat.parent=root;
    // This silhouette is outside gameplay and does not enlarge the navigation bounds.
    shadows.addShadowCaster(boundary);
  }
  update(time:number):void{this.moatLava.setFloat('time',time);this.moatLava.setFloat('advance',CALDERA_SHORE.advance);}
  dispose():void{this.moatLava.dispose();}
}

export function createCalderaImpactRim(scene:Scene):Mesh {
  const p:number[]=[],uv:number[]=[],idx:number[]=[],sectors=24;
  // Separate wedges let the solid rim fracture into individual falling pieces.
  for(let sector=0;sector<sectors;sector++){
    const start=p.length/3;
    for(let row=0;row<3;row++)for(let j=0;j<3;j++){
      const a=(sector+j/2)/sectors*Math.PI*2,r=[1.65,2.05,2.48][row]*(1+.07*Math.sin(a*7)+.04*Math.sin(a*13));
      p.push(Math.cos(a)*r,row===1?.14+.1*(.5+.5*Math.sin(a*11)):.025,Math.sin(a)*r);uv.push(Math.cos(a)*r*.4,Math.sin(a)*r*.4);
      if(row<2&&j<2){const k=start+row*3+j;idx.push(k,k+3,k+1,k+1,k+3,k+4);}
    }
  }
  const mesh=geometry(scene,'caldera-impact-rim',p,idx,uv);mesh.setVerticesData('position',p,true);
  mesh.metadata={restPositions:p,chunkStride:27};mesh.material=calderaRockMaterial(scene);return mesh;
}

export function crumbleCalderaRim(mesh:Mesh,progress:number):void {
  if(progress<=0)return;
  const rest=mesh.metadata.restPositions as number[],p=rest.slice();
  for(let i=0;i<p.length;i+=3){
    const stride=mesh.metadata.chunkStride as number,sector=Math.floor(i/stride),start=sector*stride;
    let cx=0,cz=0;for(let k=start;k<start+stride;k+=3){cx+=rest[k];cz+=rest[k+2];}cx/=stride/3;cz/=stride/3;
    const a=Math.atan2(cz,cx);
    const delay=(Math.sin(sector*17.3)*.5+.5)*.38;
    const t=Math.max(0,(progress-delay)/(1-delay));
    const shrink=1-t*t;
    const dx=rest[i]-cx,dz=rest[i+2]-cz,turn=t*.5*Math.sin(sector*2.4);
    p[i]=cx+(dx*Math.cos(turn)-dz*Math.sin(turn))*shrink+Math.cos(a)*t*.18;
    p[i+2]=cz+(dx*Math.sin(turn)+dz*Math.cos(turn))*shrink+Math.sin(a)*t*.18;
    p[i+1]+=Math.sin(t*Math.PI)*.12-t*t*.85;
  }
  mesh.updateVerticesData('position',p);
}

/** Independent irregular triangular chips, with a continuous surface until breakup. */
export function createCalderaCraterFloor(scene:Scene):Mesh {
  const p:number[]=[],uv:number[]=[],idx:number[]=[],grid:number[][][]=[];
  // Staggered jittered tessellation avoids both square pixels and radial pizza slices.
  const n=14,step=6.4/n;
  for(let row=0;row<=n;row++){
    const line:number[][]=[];
    for(let j=0;j<=n;j++){
      const jitter=Math.sin(row*47+j*13)*.095;
      line.push([-3.2+j*step+(row%2)*step*.5+jitter,0,-3.2+row*step+Math.sin(j*29+row*11)*.095]);
    }grid.push(line);
  }
  const tri=(a:number[],b:number[],c:number[])=>{for(const v of [a,b,c]){idx.push(p.length/3);p.push(...v);uv.push(v[0]/5.76+.5,v[2]/5.76+.5);}};
  for(let row=0;row<n;row++)for(let j=0;j<n;j++){
    const a=grid[row][j],b=grid[row+1][j],c=grid[row+1][j+1],d=grid[row][j+1];
    if(row%2){tri(a,b,d);tri(b,c,d);}else{tri(a,b,c);tri(a,c,d);}
  }
  const m=geometry(scene,'volcano-crater',p,idx,uv);m.setVerticesData('position',p,true);m.metadata={restPositions:p,chunkStride:9};return m;
}
