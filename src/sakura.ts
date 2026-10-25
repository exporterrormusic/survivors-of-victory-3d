import { Color3, Material, Mesh, MeshBuilder, Quaternion, StandardMaterial, Texture, TransformNode, Vector3, VertexData, type Scene, type ShadowGenerator } from '@babylonjs/core';

/** Simple anime tree: real branching wood and curved, painted blossom cards.
 * Stable UVs and alpha-tested silhouettes work from every camera angle. */
export function createSakuraTree(scene: Scene, shadows?: ShadowGenerator): TransformNode {
  const root = new TransformNode('sakura-tree', scene);
  root.metadata = { asset: 'sakura-v1', style: 'simple anime', heightMetres: 7.6 };
  const bark = new StandardMaterial('sakura-plum-bark', scene);
  bark.diffuseColor = Color3.FromHexString('#654451');
  bark.specularColor = Color3.Black();
  const blossoms = new StandardMaterial('sakura-painted-blossoms', scene);
  const atlas = new Texture(`${import.meta.env.BASE_URL}environment/sakura-v1/blossoms.webp`, scene);
  atlas.hasAlpha = true;atlas.wrapU = atlas.wrapV = Texture.CLAMP_ADDRESSMODE;
  atlas.anisotropicFilteringLevel = 8;
  blossoms.diffuseTexture = atlas;blossoms.useAlphaFromDiffuseTexture = true;
  blossoms.transparencyMode = Material.MATERIAL_ALPHATEST;blossoms.alphaCutOff = .45;
  blossoms.backFaceCulling = false;blossoms.twoSidedLighting = true;
  blossoms.specularColor = Color3.Black();blossoms.emissiveColor.set(.13,.10,.11);
  const wood: Mesh[] = [], flowers: Mesh[] = [];
  function branch(path: number[][], radius: number): void {
    const mesh = MeshBuilder.CreateTube('sakura-branch', { path: path.map(p=>Vector3.FromArray(p)),
      tessellation: 7, radiusFunction: i => radius * (1 - i/(path.length-1)*.86), cap: Mesh.CAP_ALL },scene);
    mesh.material = bark;wood.push(mesh);
  }
  function spray(at: Vector3, width: number, height: number, yaw: number, pitch: number, kind: number): void {
    const positions: number[] = [], uvs: number[] = [], indices: number[] = [], normals: number[] = [];
    // Measured artwork bounds: the wide upper spray extends beyond the midpoint.
    const [u0,v0,u1,v1]=[[.006,.54,.575,.995],[.585,.54,.995,.995],[.005,.005,.47,.515],[.51,.005,.995,.515]][kind];
    for(let y=0;y<=3;y++)for(let x=0;x<=3;x++) {
      const u=x/3,v=y/3;
      positions.push((u-.5)*width,(v-.5)*height,-Math.sin(u*Math.PI)*Math.sin(v*Math.PI)*.25);
      uvs.push(u0+u*(u1-u0),v0+v*(v1-v0));
    }
    for(let y=0;y<3;y++)for(let x=0;x<3;x++) {
      const a=y*4+x;indices.push(a,a+1,a+4,a+1,a+5,a+4);
    }
    VertexData.ComputeNormals(positions,indices,normals);
    const data=new VertexData();Object.assign(data,{positions,uvs,indices,normals});
    const mesh=new Mesh('sakura-blossom-spray',scene);data.applyToMesh(mesh);
    mesh.position.copyFrom(at);mesh.rotationQuaternion=Quaternion.RotationYawPitchRoll(yaw,pitch,0);
    mesh.material=blossoms;flowers.push(mesh);
  }
  branch([[0,0,0],[-.22,1.1,.06],[-.08,2.5,0],[.32,3.6,.12],[.1,5.4,.08]],.48);
  for(let i=0;i<5;i++) {
    const a=i*Math.PI*2/5+.3;
    // Smooth buttress roots arc into the soil. End caps sit below ground level.
    const path=Array.from({length:17},(_,j)=>{
      const t=j/16,u=1-t;
      const r=3*u*u*t*.28+3*u*t*t*.86+t*t*t*1.28;
      const y=u*u*u*.58+3*u*u*t*.18+3*u*t*t*.10-t*t*t*.22;
      return [Math.cos(a)*r,y,Math.sin(a)*r];
    });
    branch(path,.19);
  }
  // Asymmetric spreading tiers leave the fork visible under the rounded crown.
  for(let i=0;i<9;i++) {
    const a=i*2.399+.3, r=i<5?2.5+(i%2)*.4:1.6;
    const y=i<5?4.5+(i%3)*.28:5.8+(i%2)*.3;
    const tip=new Vector3(Math.cos(a)*r,y,Math.sin(a)*r);
    branch([[.08,2.5+i*.18,0],[tip.x*.48,y-.55,tip.z*.48],tip.asArray()],i<5?.21:.14);
    for(let j=0;j<3;j++) {
      const b=a+(j-1)*.6;
      const end=tip.add(new Vector3(Math.cos(b)*.65,.4+(j%2)*.2,Math.sin(b)*.65));
      branch([tip.scale(.84).add(new Vector3(0,.15,0)).asArray(),tip.asArray(),end.asArray()],.065);
      spray(end,2.6,1.9,b,.35+(j%2)*.45,(i+j)%4);
      spray(end.add(new Vector3(0,.22,0)),2.7,2.1,b+1.1,1.3,(i+j+1)%4);
    }
  }
  spray(new Vector3(.1,6.6,0),3.2,2.5,.4,1.4,1);
  spray(new Vector3(.1,6.45,0),3,2.1,1.8,.3,0);
  for(const [parts,name] of [[wood,'sakura-trunk'],[flowers,'sakura-canopy']] as const) {
    const mesh=Mesh.MergeMeshes(parts,true,true)!;mesh.name=name;mesh.parent=root;
    mesh.isPickable=false;mesh.receiveShadows=true;shadows?.addShadowCaster(mesh);
  }
  return root;
}
