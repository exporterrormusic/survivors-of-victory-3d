import { Color3, Material, Mesh, MeshBuilder, StandardMaterial, Texture, TransformNode, Vector3, VertexData, type Scene } from '@babylonjs/core';
import { RockSurface } from './rock-surface';

/** Reuse established painted assets with the shared palette and soft light transitions.
 * No whole-building projection onto unrelated shapes, no emissive color fill. */
export class RangeMaterials {
  private materials=new Map<string,StandardMaterial>();
  private textures=new Map<string,Texture>();
  constructor(private scene:Scene){}
  private texture(file:string):Texture {
    let t=this.textures.get(file);if(t)return t;
    t=new Texture(`${import.meta.env.BASE_URL}environment/${file}`,this.scene);t.anisotropicFilteringLevel=8;
    this.textures.set(file,t);return t;
  }
  material(kind:string):StandardMaterial {
    let m=this.materials.get(kind);if(m)return m;
    m=new StandardMaterial(`range-painted-${kind}`,this.scene);m.metadata={softEnvironment:true};
    m.diffuseColor.set(.92,.92,.92);m.emissiveColor.set(0,0,0);m.specularColor.set(.035,.035,.035);
    m.backFaceCulling=false;m.twoSidedLighting=true;
    if(kind==='stone'||kind==='mossy-stone'||kind==='snowy-stone'){
      m.diffuseTexture=this.texture('ruin-concrete.webp');
      if(kind!=='stone')new RockSurface(m,this.texture('forest-floor-tile.webp'),kind==='snowy-stone');
    }
    else if(kind==='wood'||kind==='metal')m.diffuseTexture=this.texture('prop-material-atlas.webp');
    else if(kind==='soil'||kind==='moss'){
      m.diffuseTexture=this.texture('forest-floor-tile.webp');m.diffuseColor=kind==='moss'?new Color3(.52,.62,.48):new Color3(.52,.48,.41);
    } else if(kind==='snow'){m.diffuseColor.set(.90,.94,.98);m.specularColor.set(.05,.06,.08);}
    else if(kind==='foliage'){
      m.diffuseTexture=this.texture('foliage-atlas.webp');m.diffuseTexture.hasAlpha=true;
      m.diffuseColor.set(.88,.94,.86);m.transparencyMode=Material.MATERIAL_ALPHATEST;m.alphaCutOff=.4;m.useAlphaFromDiffuseTexture=true;
    } else if(kind==='blossoms'){
      m.diffuseTexture=this.texture('sakura-v1/blossoms-painted.webp');m.diffuseTexture.hasAlpha=true;
      m.diffuseColor.set(.96,.91,.93);m.transparencyMode=Material.MATERIAL_ALPHATEST;m.alphaCutOff=.4;m.useAlphaFromDiffuseTexture=true;
    } else if(kind==='pine'){
      m.diffuseTexture=this.texture('range-style-v2/pine-boughs.webp');m.diffuseTexture.hasAlpha=true;
      m.diffuseColor.set(.92,.95,.98);m.transparencyMode=Material.MATERIAL_ALPHATEST;m.alphaCutOff=.4;m.useAlphaFromDiffuseTexture=true;
    }
    this.materials.set(kind,m);return m;
  }
  /** Independent UVs per triangle with consistent metre-scale projection.
   * Atlas materials sample only inside their own panel; concrete/soil tile freely. */
  private project(mesh:Mesh,kind:string):void {
    mesh.makeGeometryUnique();
    const old=mesh.getVerticesData('position')!,normal=mesh.getVerticesData('normal')!,indices=mesh.getIndices()!;
    const colors=mesh.getVerticesData('color');
    const pos:number[]=[],norm:number[]=[],uv:number[]=[],out:number[]=[],projectedColors:number[]=[];
    for(let t=0;t<indices.length;t+=3){
      const a=indices[t]*3,b=indices[t+1]*3,c=indices[t+2]*3;
      const face=Vector3.Cross(new Vector3(old[b]-old[a],old[b+1]-old[a+1],old[b+2]-old[a+2]),new Vector3(old[c]-old[a],old[c+1]-old[a+1],old[c+2]-old[a+2]));
      const ax=Math.abs(face.x),ay=Math.abs(face.y),az=Math.abs(face.z);
      for(let k=0;k<3;k++){
        const i=indices[t+k]*3,x=old[i],y=old[i+1],z=old[i+2];
        pos.push(x,y,z);norm.push(normal[i],normal[i+1],normal[i+2]);out.push(out.length);
        if(colors){const ci=indices[t+k]*4;projectedColors.push(colors[ci],colors[ci+1],colors[ci+2],colors[ci+3]);}
        else projectedColors.push(1,1,1,1);
        let u=(ay>=ax&&ay>=az?x:ax>=az?z:x),v=ay>=ax&&ay>=az?z:y;
        if(kind==='wood'||kind==='metal'){
          // Smooth bounded mapping across an entire local face, never modulo across a triangle.
          const bounds=mesh.getBoundingInfo().boundingBox;
          const min=ay>=ax&&ay>=az?bounds.minimum.x:ax>=az?bounds.minimum.z:bounds.minimum.x;
          const max=ay>=ax&&ay>=az?bounds.maximum.x:ax>=az?bounds.maximum.z:bounds.maximum.x;
          const vmin=ay>=ax&&ay>=az?bounds.minimum.z:bounds.minimum.y;
          const vmax=ay>=ax&&ay>=az?bounds.maximum.z:bounds.maximum.y;
          u=(u-min)/Math.max(.001,max-min);v=(v-vmin)/Math.max(.001,vmax-vmin);
          uv.push((kind==='wood'?.01:.51)+u*.475,.015+v*.97);
        }else uv.push(u/2.4,v/2.4);
      }
    }
    const data=new VertexData();Object.assign(data,{positions:pos,normals:norm,uvs:uv,indices:out});data.applyToMesh(mesh);
    // Painted kit props and landmarks share materials and are merged together.
    // Keep their attributes compatible even when only rocks carry coverage data.
    mesh.setVerticesData('color',projectedColors);
  }
  paint(root:TransformNode,asset:string,finish:string):void {
    for(const mesh of root.getChildMeshes() as Mesh[]){
      const name=mesh.material?.name??'';
      const coatedRock=(asset.startsWith('rock-')||asset==='cliff-face')&&finish!=='clean';
      // Blend on the actual rock surface, without separate hard-edged caps.
      if(coatedRock&&name.endsWith('-top')){mesh.dispose();continue;}
      if(name.endsWith('-top')&&asset.startsWith('cover-')&&finish!=='snowy'){mesh.dispose();continue;}
      if(asset.startsWith('rock-')||asset==='cliff-face'){
        // Preserve silhouette, blend normals across coincident rock vertices.
        const p=mesh.getVerticesData('position')!,n=mesh.getVerticesData('normal')!;
        const sums=new Map<string,Vector3>(),keys:string[]=[];
        for(let i=0;i<p.length;i+=3){const key=`${p[i].toFixed(4)},${p[i+1].toFixed(4)},${p[i+2].toFixed(4)}`;keys.push(key);const sum=sums.get(key)??Vector3.Zero();sum.addInPlaceFromFloats(n[i],n[i+1],n[i+2]);sums.set(key,sum);}
        for(const sum of sums.values())sum.normalize();
        for(let i=0;i<keys.length;i++){const sum=sums.get(keys[i])!;n[i*3]=sum.x;n[i*3+1]=sum.y;n[i*3+2]=sum.z;}
        mesh.setVerticesData('normal',n);
      }
      const kind=asset==='sakura'&&name.includes('blossom')?'blossoms':name==='range-snow'||name.endsWith('-top')&&finish==='snowy'?'snow':asset==='cover-crate'?'metal':
        name.endsWith('-top')||name.endsWith('-green')||name.endsWith('-leaf')?'moss':
        name.endsWith('-wood')||name.endsWith('-end')||name.includes('bark')?'wood':
        name.endsWith('-metal')||name.endsWith('-dark')||name.includes('column')||asset==='cover-crate'?'metal':
        asset.startsWith('patch-')?'soil':'stone';
      if(kind!=='blossoms')this.project(mesh,kind);
      mesh.material=this.material(coatedRock?`${finish}-stone`:kind);
    }
  }
  /** Painted sprays replace geometric leaf diamonds and solid polygon bushes. */
  foliage(kind:'bush'|'fern'|'tree'|'pine'):TransformNode {
    const root=new TransformNode(`painted-range-${kind}`,this.scene);
    const spray=(x:number,y:number,z:number,w:number,h:number,yaw:number,tilt:number,cell:number)=>{
      const positions:number[]=[],uvs:number[]=[],indices:number[]=[],normals:number[]=[];
      const [u0,v0,u1,v1]=kind==='pine'?[.51,.01,.995,.99]:[[.008,.515,.513,.995],[.523,.515,.995,.995],[.005,.02,.576,.515]][cell];
      for(let j=0;j<=3;j++)for(let i=0;i<=3;i++){
        const u=i/3,v=j/3;positions.push((u-.5)*w,v*h,-.2*Math.sin(u*Math.PI)*Math.sin(v*Math.PI));uvs.push(u0+u*(u1-u0),v0+v*(v1-v0));
      }
      for(let j=0;j<3;j++)for(let i=0;i<3;i++){const a=j*4+i;indices.push(a,a+1,a+4,a+1,a+5,a+4);}
      VertexData.ComputeNormals(positions,indices,normals);const mesh=new Mesh('painted-leaf-spray',this.scene),data=new VertexData();
      Object.assign(data,{positions,uvs,indices,normals});data.applyToMesh(mesh);mesh.position.set(x,y,z);mesh.rotation.set(tilt,yaw,0);mesh.parent=root;mesh.material=this.material(kind==='pine'?'pine':'foliage');
    };
    if(kind==='pine'){
      const trunk=MeshBuilder.CreateCylinder('painted-pine-trunk',{height:5.1,diameterBottom:.43,diameterTop:.10,tessellation:10},this.scene);
      trunk.position.y=2.5;this.project(trunk,'wood');trunk.material=this.material('wood');trunk.parent=root;
      for(let layer=0;layer<5;layer++)for(let i=0;i<5;i++){
        const a=i*2.399+layer*.63,r=1.05-layer*.19,y=.75+layer*.85;
        spray(Math.cos(a)*r,y,Math.sin(a)*r,2.6-layer*.35,1.9-layer*.22,a,.65,0);
      }
    }else if(kind==='tree'){
      const trunk=MeshBuilder.CreateTube('painted-tree-trunk',{path:[new Vector3(0,-.1,0),new Vector3(-.2,2,0),new Vector3(.1,4.5,0)],radius:.27,tessellation:9,cap:Mesh.CAP_ALL},this.scene);
      this.project(trunk,'wood');trunk.material=this.material('wood');trunk.parent=root;
      for(let i=0;i<9;i++){const a=i*2.399,r=i<6?1.7:.7,y=i<6?3.6:4.5;
        spray(Math.cos(a)*r,y,Math.sin(a)*r,3.1,2.1,a,.6,i%2);spray(Math.cos(a)*r,y+.1,Math.sin(a)*r,3.0,2,a+1.2,1.35,(i+1)%2);
      }
    }else for(let i=0;i<5;i++)spray(0,kind==='fern'?0:.1,0,kind==='fern'?1.8:2.0,kind==='fern'?1.15:1.55,i*2.399,.1+(i%2)*.65,kind==='fern'?2:i%2);
    for(const mesh of root.getChildMeshes()){mesh.isPickable=false;mesh.receiveShadows=true;}
    return root;
  }
}
