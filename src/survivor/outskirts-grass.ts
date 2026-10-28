import { BoundingInfo, Color3, MaterialPluginBase, Matrix, Mesh, Quaternion, StandardMaterial, Vector3, VertexData, type Scene, type UniformBuffer } from '@babylonjs/core';
import { OUTSKIRTS_SCALE, rangeTreeRoadClearance } from './range-environments';
import { OUTSKIRTS_CRATER } from './outskirts-landmarks';
import { onElevatorFootprint } from './elevator-footprint';

/** Original implementation of the instanced, vertex-bent grass approach:
 * https://forum.babylonjs.com/t/stylized-animated-and-reactive-grass/62558
 * StandardMaterial retains the game's lighting, fog and received shadows. */
class GrassBending extends MaterialPluginBase {
  time=0;
  wind=1;
  readonly player=new Vector3(10000,0,10000);
  readonly wake=new Vector3(10000,0,10000);
  constructor(material:StandardMaterial){super(material,'OutskirtsGrassBending',210,{},true,true);}
  override getUniforms(){return {ubo:[
    {name:'grassMotion',size:2,type:'vec2'},
    {name:'grassPlayer',size:3,type:'vec3'},
    {name:'grassWake',size:3,type:'vec3'},
  ],vertex:'uniform vec2 grassMotion; uniform vec3 grassPlayer; uniform vec3 grassWake;'};}
  override bindForSubMesh(buffer:UniformBuffer){
    buffer.updateFloat2('grassMotion',this.time,this.wind);
    buffer.updateVector3('grassPlayer',this.player);buffer.updateVector3('grassWake',this.wake);
  }
  override getCustomCode(type:string):Record<string,string>|null {
    if(type==='fragment')return {CUSTOM_FRAGMENT_UPDATE_DIFFUSE:`
      baseColor.rgb*=1.-smoothstep(${(34*OUTSKIRTS_SCALE).toFixed(1)},${(34*OUTSKIRTS_SCALE+3).toFixed(1)},length(vPositionW.xz))*.55;
    `};
    if(type!=='vertex')return null;
    return {CUSTOM_VERTEX_UPDATE_WORLDPOS:`
      vec3 grassRoot=(finalWorld*vec4(0.,0.,0.,1.)).xyz;
      float grassHeight=positionUpdated.y;
      float bladeScale=length(finalWorld[1].xyz);
      vec2 away=grassRoot.xz-grassPlayer.xz;
      vec2 trail=grassRoot.xz-grassWake.xz;
      float push=(1.-smoothstep(.15,1.65,length(away)))*(1.-smoothstep(.5,2.,abs(grassPlayer.y-grassRoot.y)));
      float lingering=(1.-smoothstep(.15,1.45,length(trail)))*(1.-smoothstep(.5,2.,abs(grassWake.y-grassRoot.y)))*.65;
      vec2 bend=away/max(length(away),.08)*push+trail/max(length(trail),.08)*lingering;
      float wave=sin(grassMotion.x*1.7+grassRoot.x*.5+grassRoot.z*.31)*.13
        +sin(grassMotion.x*2.6+grassRoot.z*.9)*.045;
      worldPos.xz+=(bend*.65+vec2(wave,wave*.45)*grassMotion.y)*grassHeight*grassHeight*bladeScale;
      worldPos.y-=min(.72,push*.65+lingering*.35)*grassHeight*bladeScale;
    `};
  }
}

export class OutskirtsGrass {
  private readonly meshes:Mesh[]=[];
  private readonly material:StandardMaterial;
  private readonly bending:GrassBending;
  private initialized=false;
  constructor(scene:Scene){
    const material=this.material=new StandardMaterial('outskirts-grass',scene);
    material.diffuseColor=new Color3(.38,.52,.23);material.specularColor.set(0,0,0);
    material.backFaceCulling=false;material.twoSidedLighting=true;
    this.bending=new GrassBending(material);
    const data=new VertexData();
    // A tapered, jointed blade: roots stay anchored while tips bend.
    data.positions=[-.055,0,0,.055,0,0,-.038,.48,.025,.038,.48,.025,0,1,.09];
    data.indices=[0,1,2,1,3,2,2,3,4];
    data.normals=Array.from({length:5},()=>[0,.35,-.94]).flat();
    data.colors=[.48,.60,.34,1,.48,.60,.34,1,.8,.9,.55,1,.8,.9,.55,1,1,1,.75,1];
    let seed=417;
    const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
    const playableRadius=34*OUTSKIRTS_SCALE,radius=playableRadius+36,chunk=12;
    const extent=Math.ceil(radius/chunk)*chunk;
    for(let cx=-extent;cx<extent;cx+=chunk)for(let cz=-extent;cz<extent;cz+=chunk){
      const matrices:number[]=[];
      for(let i=0;i<7200;i++){
        const x=cx+random()*chunk,z=cz+random()*chunk;
        // Keep blades and their wind/bending envelope outside the painted road.
        const edgeWander=Math.sin(x*.73+z*.51)*.65+Math.sin(z*1.37-x*.42)*.35+Math.sin(x*2.1+z*.83)*.2;
        const roadDistance=rangeTreeRoadClearance(x,z);
        const distance=Math.hypot(x,z);
        const blastDistance=Math.hypot(x-OUTSKIRTS_CRATER.x,z-OUTSKIRTS_CRATER.z);
        const regrowth=Math.max(0,Math.min(1,(blastDistance+edgeWander-OUTSKIRTS_CRATER.radius-3)/(OUTSKIRTS_CRATER.scorchRadius-OUTSKIRTS_CRATER.radius-3)));
        if(regrowth<1&&random()>regrowth*regrowth*(3-2*regrowth))continue;
        if(distance>radius||onElevatorFootprint(x,z))continue;
        if(roadDistance<.8)continue;
        // Carry the meadow well past the dark gameplay boundary. Only the distant
        // scenery thins out, avoiding a visible circular cut at the map edge.
        const outer=Math.max(0,Math.min(1,(distance-playableRadius-12)/24));
        if(outer>0&&random()<outer*outer*(3-2*outer))continue;
        // Short verge tufts reach into the feathered road edge, then rise smoothly
        // over a broad, irregular verge so there is no uniform strip of short grass.
        const t=Math.max(0,Math.min(1,(roadDistance-.8)/6.5));
        const verge=t*t*(3-2*t);
        const height=(.35+random()*.4)*(.45+.55*verge);
        const width=(.85+random()*.65)*(.65+.35*verge);
        const matrix=Matrix.Compose(new Vector3(width,height,1),Quaternion.RotationAxis(Vector3.Up(),random()*Math.PI*2),new Vector3(x,.035,z));
        matrices.push(...matrix.asArray());
      }
      if(!matrices.length)continue;
      const mesh=new Mesh(`outskirts-grass-${cx}-${cz}`,scene);data.applyToMesh(mesh);
      mesh.material=material;mesh.isPickable=false;mesh.receiveShadows=true;
      mesh.metadata={outskirtsGrass:true,cameraOcclusionDisabled:true};
      mesh.thinInstanceSetBuffer('matrix',new Float32Array(matrices),16,true);
      // Include shader displacement in the CPU culling envelope.
      mesh.setBoundingInfo(new BoundingInfo(new Vector3(cx-1,0,cz-1),new Vector3(cx+chunk+1,1.2,cz+chunk+1)));
      mesh.freezeWorldMatrix();this.meshes.push(mesh);
    }
  }
  update(dt:number,focus:Vector3|undefined,reducedMotion:boolean){
    this.bending.wind=reducedMotion?0:1;
    if(!reducedMotion)this.bending.time+=dt;
    if(!focus)return;
    if(!this.initialized||Vector3.DistanceSquared(focus,this.bending.player)>100){this.bending.wake.copyFrom(focus);this.initialized=true;}
    this.bending.player.copyFrom(focus);
    Vector3.LerpToRef(this.bending.wake,focus,1-Math.exp(-Math.max(0,dt)*7),this.bending.wake);
  }
  dispose(){for(const mesh of this.meshes)mesh.dispose();this.material.dispose();}
}
