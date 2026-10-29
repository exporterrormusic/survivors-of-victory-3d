import { Color3, Mesh, MeshBuilder, StandardMaterial, Texture, TransformNode, Vector3, VertexData, type Scene } from '@babylonjs/core';

/** 28 cm porcelain tokkuri and 9 cm red ochoko. Both faces read 誤り輸出. A single piece stands centred on its own origin. */
export function createSakeSet(scene:Scene,pieces:'both'|'cup'|'jug'='both'):TransformNode {
  const root=new TransformNode(pieces==='both'?'forest-sake-set':`sake-${pieces}`,scene);
  const jugX=pieces==='both'?-.06:0,cupX=pieces==='both'?.095:0,jugOn=pieces!=='cup',cupOn=pieces!=='jug';
  root.metadata={asset:'forest-sake-set',displayName:'Sake cup & jug',units:'metres',front:'-Z',inscription:'誤り輸出'};
  const material=(name:string,color:string)=>{
    const existing=scene.getMaterialByName(name);if(existing)return existing as StandardMaterial;
    const m=new StandardMaterial(name,scene);m.diffuseColor=Color3.FromHexString(color);m.specularColor.set(.32,.32,.32);m.specularPower=100;return m;
  };
  const white=material('sake-white-porcelain','#f7f4eb'),red=material('sake-red-glaze','#ad172e'),rim=material('sake-blue-rim','#293f54');
  const attach=(m:Mesh,mat:StandardMaterial,x=0)=>{m.parent=root;m.material=mat;m.position.x=x;m.isPickable=false;m.receiveShadows=true;return m;};
  const jug:number[][]=[[0,0],[.042,0],[.052,.008],[.059,.025],[.064,.060],[.065,.100],[.061,.140],[.052,.175],[.038,.210],[.026,.236],[.028,.250],[.037,.276],[.036,.280],[.030,.280],[.022,.250],[.020,.236],[.032,.207],[.046,.172],[.055,.138],[.059,.100],[.058,.060],[.052,.025],[.044,.012],[0,.012]];
  const cup:number[][]=[[0,0],[.022,0],[.025,.005],[.025,.012],[.030,.016],[.039,.025],[.046,.042],[.050,.065],[.050,.084],[.048,.088],[.044,.088],[.044,.067],[.040,.046],[.033,.030],[.023,.022],[0,.022]];
  for(const [name,profile,mat,x,on] of [['jug',jug,white,jugX,jugOn],['cup',cup,red,cupX,cupOn]] as const){
    if(!on)continue;
    attach(MeshBuilder.CreateLathe(`sake-${name}`,{shape:profile.map(([r,y])=>new Vector3(r,y,0)),tessellation:64,cap:Mesh.NO_CAP,closed:false},scene),mat,x);
  }
  if(jugOn){const ring=attach(MeshBuilder.CreateTorus('sake-jug-lip',{diameter:.067,thickness:.004,tessellation:64},scene),rim,jugX);ring.position.y=.279;}
  if(cupOn){
    // Continuous porcelain band wraps over the lip and down the inside edge.
    const band=[[.0502,.080],[.0502,.084],[.0482,.0882],[.0438,.0882],[.0438,.081]];
    attach(MeshBuilder.CreateLathe('sake-cup-white-rim',{shape:band.map(([r,y])=>new Vector3(r,y,0)),tessellation:64,cap:Mesh.NO_CAP,closed:false},scene),white,cupX);
  }
  // Conformal decals follow the curved exterior; separate opposing faces keep text readable.
  function decorate(name:string,profile:number[][],x:number,low:number,high:number,span:number){
    const mat=material(`sake-${name}-ink`,'#ffffff');mat.backFaceCulling=false;
    if(!mat.diffuseTexture){const t=new Texture(`${import.meta.env.BASE_URL}environment/easter-egg-props/sake-${name}-decoration.png`,scene);t.hasAlpha=true;t.anisotropicFilteringLevel=8;mat.diffuseTexture=t;mat.useAlphaFromDiffuseTexture=true;}
    const radius=(y:number)=>{for(let i=1;i<profile.length;i++){const [r0,y0]=profile[i-1],[r1,y1]=profile[i];if(y>=y0&&y<=y1&&y1>y0)return r0+(r1-r0)*(y-y0)/(y1-y0);}return 0;};
    for(const [side,rotation] of [['front',0],['back',Math.PI]] as const){
      const positions:number[]=[],uvs:number[]=[],indices:number[]=[],normals:number[]=[];
      for(let j=0;j<=32;j++)for(let i=0;i<=48;i++){
        const u=i/48,v=j/32,y=low+v*(high-low),a=(u-.5)*span,r=radius(y)+.00015;
        positions.push(Math.sin(a)*r,y,-Math.cos(a)*r);uvs.push(u,v);
        if(j<32&&i<48){const k=j*49+i;indices.push(k,k+1,k+49,k+1,k+50,k+49);}
      }
      VertexData.ComputeNormals(positions,indices,normals);const data=new VertexData();Object.assign(data,{positions,indices,normals,uvs});
      const mesh=new Mesh(`sake-${name}-inscription-${side}`,scene);data.applyToMesh(mesh);attach(mesh,mat,x);mesh.rotation.y=rotation;
    }
  }
  if(jugOn)decorate('jug',jug,jugX,.030,.205,2.45);if(cupOn)decorate('cup',cup,cupX,.024,.079,2.0);
  return root;
}
