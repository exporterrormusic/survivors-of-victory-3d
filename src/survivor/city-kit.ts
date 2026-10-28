import { Mesh, MeshBuilder, TransformNode, VertexData, type Scene, type StandardMaterial } from '@babylonjs/core';
import { CITY_ASSETS, type CityAsset } from './city-layout';
import { cityUV } from './city-materials';

/** Low collapsed architecture: fractured floor plates, crushed masonry and bent reinforcement. */
export function createCityAsset(scene:Scene,asset:CityAsset,stone:StandardMaterial,steel:StandardMaterial,glass?:StandardMaterial):TransformNode {
  const root=new TransformNode(asset,scene),parts:Mesh[]=[];
  const {width:w,depth:d,height:h}=CITY_ASSETS[asset];
  const seed=Object.keys(CITY_ASSETS).indexOf(asset)+1;
  const slab=(name:string,x:number,y:number,z:number,sx:number,sy:number,sz:number,angle=0,metal=false)=>{
    const m=MeshBuilder.CreateBox(`${asset}-${name}`,{width:sx,height:sy,depth:sz,updatable:true},scene);
    m.position.set(x,y,z);cityUV(m,4);
    if(!metal){
      const positions=m.getVerticesData('position')!;
      // Shared corner coordinates get the same displacement: closed chipped wedges, no cracks between faces.
      for(let i=0;i<positions.length;i+=3){
        const px=positions[i],py=positions[i+1],pz=positions[i+2];
        const n=Math.sin((px>0?1:3)*2.7+(pz>0?2:5)*1.3+seed+x*1.7+z);
        positions[i]*= .91+.08*n;
        positions[i+2]*=.91+.06*n;
        if(py>0)positions[i+1]+=sy*.22*n;
      }
      const normals:number[]=[];VertexData.ComputeNormals(positions,m.getIndices()!,normals);
      m.updateVerticesData('position',positions);m.updateVerticesData('normal',normals);
    }
    m.position.set(x,y,z);m.rotation.y=angle;m.material=metal?steel:stone;
    m.parent=root;m.isPickable=false;parts.push(m);return m;
  };
  if(asset==='city-long-collapse'){
    // A fourteen-storey tower on its side. Original floors are now vertical ribs;
    // surviving columns run horizontally along the entire fallen building.
    slab('buried-facade',0,.30,0,w,.60,d);
    const core=slab('crushed-interior',0,h*.43,0,w-.7,h*.68,d-.6);
    core.material=glass??stone;
    const floors=14,spacing=(w-.6)/floors;
    for(let i=0;i<=floors;i++){
      const x=-w/2+.3+i*spacing;
      const damage=i>10?1-(i-10)*.065:1;
      slab('sideways-floor-plate',x,h*.49*damage,0,.22,h*.96*damage,d-.25);
      if(i<floors){
        for(const side of [-1,1]){
          // Long strips of facade frame recessed, dark window bays, never teal glass.
          slab('surviving-spandrel',x+spacing*.48,h*.52,side*(d/2-.18),spacing*.82,.32,.25);
          slab('window-pier',x+spacing*.48,h*.30,side*(d/2-.18),.17,h*.43,.25);
        }
        // The upward-facing side is a facade, with opaque recessed broken windows.
        slab('upper-facade',x+spacing*.48,h*.87*damage,0,spacing*.90,.25,d*.92);
        for(let bay=0;bay<3;bay++){
          const z=(bay-1)*d*.28;
          const panel=slab('dusty-window-infill',x+spacing*.48,h*.925*damage,z,spacing*.60,.08,d*.20,0,true);
          panel.material=glass??steel;
          // Broken diagonal mullions and fallen concrete partly cover the glazing.
          if((i+bay)%4===0){
            const shard=slab('chipped-window-cover',x+spacing*.39,h*.95*damage,z,spacing*.35,.12,d*.17,.23);
            shard.rotation.z=.07;
          }
          if((i+bay)%3===0)slab('bent-mullion',x+spacing*.48,h*.95*damage,z,.06,.07,d*.20,.26,true);
        }
      }
    }
    for(const z of [-d*.43,0,d*.43])slab('continuous-column',0,h*.82,z,w-.7,.28,.30);
    for(const y of [h*.23,h*.77])for(const side of [-1,1])
      slab('long-edge-beam',0,y,side*(d/2-.20),w-.5,.21,.25);
    // Surviving facade trim, torn conduit and a broken service grille anchor scale.
    for(const side of [-1,1]){
      slab('facade-trim',-w*.19,h*.18,side*(d/2-.08),w*.56,.16,.12,0,true);
      for(let j=0;j<6;j++)slab('service-grille',-w*.32+j*.19,h*.63,side*(d/2-.03),.07,.72,.08,0,true);
      for(let j=0;j<4;j++){
        const cable=slab('torn-conduit',w*.28+j*.6,h*.54,side*(d/2-.05),.055,h*.63,.055,0,true);
        cable.rotation.z=.24+j*.08;
      }
    }
    // Shattered crown at one end, still attached to the building body.
    for(let i=0;i<5;i++){
      const piece=slab('broken-crown',w*.40+i*.35,1.3,-d*.32+i*.65,1.7,.28,1.1,i*.31);
      piece.rotation.z=.25;
      slab('torn-reinforcement',w*.43,h*.52,-d*.30+i*.60,2.5,.055,.055,0,true);
    }
  }else{
  // A continuous buried mass makes the low obstacle's collision footprint legible.
  slab('crushed-base',0,.35,0,w,.7,d);
  const count=asset==='city-rubble'?2:3;
  for(let i=0;i<count;i++){
    const x=(i-(count-1)/2)*w/count;
    const z=Math.sin(i*2.3+seed)*d*.12;
    slab('fractured-floor',x,.8,z,w/count*.95,.32,d*.82,(i%2?1:-1)*.09);
    const top=slab('fallen-facade',x,1.12,z+.12,w/count*.82,.38,d*.63,(i%2?-.12:.14));
    top.rotation.z=(i%2?-.12:.12);
    if(h>2){
      slab('broken-wall-stump',x,h*.63,d*.22,w/count*.65,h*.52,.32,.09);
      const plate=slab('roof-fragment',x,h*.69,-d*.13,w/count*.69,.25,d*.42,-.18);
      plate.rotation.x=.20;
      for(let j=0;j<2;j++){
        const bar=slab('exposed-rebar',x+(j-.5)*.35,h*.86,d*.22,.045,.45,.045,0,true);
        bar.rotation.z=(j?-.24:.3);
      }
    }
    slab('fallen-steel',x,.95,-d*.26,w/count*.70,.12,.15,.22,true);
  }
  }
  for(const material of [...new Set([stone,steel,...(glass?[glass]:[])])]){
    const group=parts.filter(p=>p.material===material);if(!group.length)continue;
    const merged=Mesh.MergeMeshes(group,true,true)!;merged.parent=root;
    merged.name=`${asset}-${material===stone?'concrete':material===steel?'steel':'weathered-infill'}`;merged.isPickable=false;merged.receiveShadows=false;
  }
  root.metadata={asset,units:'metres',city:true};return root;
}

