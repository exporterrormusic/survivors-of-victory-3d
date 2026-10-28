import { Color3, FresnelParameters, Material, Mesh, MeshBuilder, StandardMaterial, Texture, TransformNode, Vector3, VertexData, type Scene } from '@babylonjs/core';

/** Small sealed medical specimen, 14 cm tall. Label faces local -Z.
 * Shared materials and static geometry work with the scenery template/merge pipeline. */
export function createVapausVial(scene:Scene):TransformNode {
  const root=new TransformNode('forest-vapaus-vial',scene);
  root.metadata={asset:'forest-vapaus-vial',displayName:'Vapaus vial',units:'metres',front:'-Z'};
  const mat=(name:string,color:string)=>{
    const found=scene.getMaterialByName(name);if(found)return found as StandardMaterial;
    const m=new StandardMaterial(name,scene);m.diffuseColor=Color3.FromHexString(color);m.specularColor.set(.25,.25,.25);m.specularPower=96;
    return m;
  };
  const glass=mat('vapaus-clear-glass','#a1c2cc');
  glass.alpha=.08;glass.transparencyMode=Material.MATERIAL_ALPHABLEND;glass.specularColor.set(.45,.55,.6);glass.specularPower=160;
  // StandardMaterial adds Fresnel opacity to alpha; keep the face clear and only
  // strengthen grazing edges instead of accidentally making the bottle opaque.
  glass.opacityFresnelParameters=new FresnelParameters({leftColor:new Color3(.015,.015,.015),rightColor:new Color3(.25,.25,.25),power:3,bias:0});
  const edge=mat('vapaus-glass-edges','#849ca5');edge.alpha=.24;edge.transparencyMode=Material.MATERIAL_ALPHABLEND;
  const blood=mat('vapaus-blood','#a30719');blood.specularColor.set(.32,.12,.12);blood.specularPower=80;
  const meniscus=mat('vapaus-blood-surface','#790616');meniscus.specularColor.set(.6,.34,.34);meniscus.specularPower=128;
  const metal=mat('vapaus-crimp-aluminium','#a4adb6');metal.specularColor.set(.8,.85,.9);metal.specularPower=64;
  const rubber=mat('vapaus-rubber-stopper','#63252c');rubber.specularColor.set(.08,.05,.05);rubber.specularPower=24;
  const ink=mat('vapaus-measurement-ink','#c6ceca');ink.specularColor.set(0,0,0);
  const label=mat('vapaus-specimen-label','#ffffff');label.specularColor.set(.025,.025,.025);
  if(!label.diffuseTexture){label.diffuseTexture=new Texture(`${import.meta.env.BASE_URL}environment/easter-egg-props/vapaus-label.png`,scene);label.diffuseTexture.anisotropicFilteringLevel=8;}
  const attach=(mesh:Mesh,m:StandardMaterial)=>{mesh.parent=root;mesh.material=m;mesh.isPickable=false;mesh.receiveShadows=m!==glass&&m!==edge;return mesh;};
  const lathe=(name:string,profile:number[][],m:StandardMaterial)=>attach(MeshBuilder.CreateLathe(name,{shape:profile.map(([r,y])=>new Vector3(r,y,0)),tessellation:64,closed:false,cap:Mesh.NO_CAP},scene),m);
  const cylinder=(name:string,y:number,height:number,diameter:number,m:StandardMaterial)=>{
    const mesh=attach(MeshBuilder.CreateCylinder(name,{height,diameter,tessellation:48},scene),m);mesh.position.y=y;return mesh;
  };
  const ring=(name:string,y:number,diameter:number,thickness:number,m:StandardMaterial)=>{
    const mesh=attach(MeshBuilder.CreateTorus(name,{diameter,thickness,tessellation:24},scene),m);mesh.position.y=y;return mesh;
  };
  // Continuous outer/inner profile includes a thick bottom and narrowed neck.
  lathe('vapaus-glass-body',[[0,.002],[.017,.002],[.022,.005],[.024,.01],[.024,.104],[.022,.11],[.017,.116],[.017,.126],
    [.015,.126],[.015,.117],[.020,.109],[.0218,.103],[.0218,.012],[.019,.008],[0,.008]],glass);
  ring('vapaus-bottom-glass',.007,.043,.0025,edge);
  ring('vapaus-neck-lip',.122,.033,.002,edge);
  // Opaque red fluid inside the glass, including a curved liquid edge and headspace.
  lathe('vapaus-blood-volume',[[0,.009],[.018,.009],[.021,.013],[.021,.092],[.020,.093],[0,.093]],blood);
  cylinder('vapaus-blood-meniscus',.093,.0005,.0405,meniscus);
  ring('vapaus-liquid-edge',.0933,.0405,.0007,meniscus);
  cylinder('vapaus-stopper-seal',.124,.011,.033,rubber);
  cylinder('vapaus-crimp-collar',.124,.013,.039,metal);
  cylinder('vapaus-cap-top',.133,.006,.041,metal);
  cylinder('vapaus-red-septum',.137,.004,.029,rubber);
  ring('vapaus-cap-rim',.134,.039,.0017,metal);
  for(let i=0;i<32;i++){
    const a=i*Math.PI*2/32,mesh=attach(MeshBuilder.CreateBox('vapaus-cap-crimp',{width:.0008,height:.008,depth:.00065},scene),metal);
    mesh.position.set(Math.sin(a)*.0195,.124,Math.cos(a)*.0195);mesh.rotation.y=a;
  }
  // Curved partial paper label leaves the sides and upper red liquid exposed.
  const positions:number[]=[],normals:number[]=[],uvs:number[]=[],indices:number[]=[];
  for(let i=0;i<=32;i++){
    const t=i/32,a=-.98+t*1.96;
    for(const [y,v] of [[.036,0],[.073,1]]){
      positions.push(Math.sin(a)*.02425,y,-Math.cos(a)*.02425);normals.push(Math.sin(a),0,-Math.cos(a));uvs.push(t,v);
    }
    if(i<32){const k=i*2;indices.push(k,k+2,k+1,k+1,k+2,k+3);}
  }
  const mesh=new Mesh('vapaus-curved-label',scene),data=new VertexData();Object.assign(data,{positions,normals,uvs,indices});data.applyToMesh(mesh);attach(mesh,label);
  // Fine glass graduations on the side opposite the label.
  for(let i=0;i<5;i++){
    const line=attach(MeshBuilder.CreateBox('vapaus-graduation',{width:i%2===0?.009:.005,height:.00065,depth:.0003},scene),ink);
    line.position.set(0,.045+i*.01,.0242);
  }
  // Merge compatible opaque detail pieces; keep glass separate for correct alpha sorting.
  for(const m of [metal,rubber,meniscus,ink]){
    const pieces=root.getChildMeshes().filter(p=>p.material===m) as Mesh[];
    if(pieces.length>1){const merged=Mesh.MergeMeshes(pieces,true,true)!;merged.parent=root;merged.name=m.name;merged.isPickable=false;merged.receiveShadows=true;}
  }
  return root;
}
