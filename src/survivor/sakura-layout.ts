import type { RangePlacement } from './range-environments.ts';

export const SAKURA_SCALE=1.5;

/** Authored garden plan. Architectural pairs must never be relocated by a packing pass. */
export function sakuraPlacements():RangePlacement[]{
  const list:RangePlacement[]=[];
  const put=(asset:RangePlacement['asset'],x:number,z:number,scale=1,yaw=0)=>list.push({asset,x:x*SAKURA_SCALE,z:z*SAKURA_SCALE,scale:scale*SAKURA_SCALE,yaw});
  // South entrance -> open lift plaza -> torii -> shrine court, all on one axis.
  put('sakura-roofed-gate',0,-24);
  put('sakura-torii',0,16,1.1);
  put('sakura-shrine',0,30,1.1);
  // Four east/west portals, 12 m apart along each approach. A quarter turn
  // aligns their openings with the cross-road; posts stand beyond its shoulders.
  for(const x of [-24,-12,12,24])put('sakura-torii',x,-7,1.15,Math.PI/2);
  for(const z of [-31,-17,10,21])for(const x of [-6.9,6.9])put('sakura-lantern',x,z,.9);
  for(const x of [-4.7,4.7])put('sakura-lantern',x,26,.85);
  // Low court walls run in parallel and turn behind the shrine. The south is open.
  for(const x of [-8.6,8.6])for(const z of [24.2,28.8,33.4])put('sakura-wall',x,z,1,Math.PI/2);
  for(const x of [-6.3,-2.1,2.1,6.3])put('sakura-wall',x,36,.91);
  // Paired resting gardens beside the main approach. Benches face a clear paved pocket.
  for(const side of [-1,1]){
    put('sakura-bench',side*18,11);
    put('sakura-bench',side*22,7,1,Math.PI/2);
    put('sakura-lantern',side*13,7,.8);
    for(const x of [16,20])put('sakura-wall',side*x,14.8,.85);
    // Two short boundary runs mark the southern orchard, leaving exits at both ends.
    for(const z of [-20,-24.6])put('sakura-wall',side*24,z,1,Math.PI/2);
    put('sakura-bench',side*18,-27,1);
  }
  // Curated groves: frame paths and courts without putting blossom canopies on the road.
  const trees:[number,number,number][]=[
    [-13,-30,.78],[13,-30,.83],[-16,-19,.85],[16,-19,.8],
    [-29,-18,.8],[29,-18,.8],[-30,3.5,.85],[30,3.5,.82],
    [-15,19,.8],[15,19,.84],[-22,23,.9],[22,23,.85],
    [-15,30,.8],[15,30,.8],
    [-29,12,.8],[29,12,.75],[-26,-29,.7],[26,-29,.72],
    [-16,38,.65],[16,38,.65],[-36,-17,.7],[36,-17,.7],
  ];
  for(const [i,[x,z,scale]] of trees.entries()){
    put('sakura',x,z,scale,i*2.399);
    // Small underplanting belongs to a tree bed, never to the road or a paved court.
    put('plant-fern',x+1.5,z+1,.55,i*.9);
    if(i%2===0)put('plant-grass',x-1.4,z+.8,.55,i);
  }
  // Asymmetric stone groupings in the outer gardens; no loose rubble on the approach.
  // Small permanent northern grove for gameplay views behind the shrine.
  // The much larger cinematic orchard remains temporary.
  for(const [i,[x,z,scale]] of ([[-11,43,.9],[-5,46,1.05],[2,42,.85],[8,47,.95],[14,43,.8]] as const).entries()){
    list.push({asset:'sakura',x:x*SAKURA_SCALE,z:z*SAKURA_SCALE,
      scale:scale*SAKURA_SCALE,yaw:i*2.399,walkable:true});
  }
  for(const side of [-1,1]){
    put('rock-boulder',side*26,5,.65,side*.5);
    put('rock-flat',side*27.8,7,.65,side);
    put('rock-pebbles',side*25,7.8,.8);
    put('rock-flat',side*21,-16,.8,side*.6);
  }
  return list;
}

/** Extra paved areas share these exact bounds with the ground shader and layout tests. */
export const SAKURA_PAVING = [
  {x:0,z:27,halfX:7.8,halfZ:8.2},
  {x:-11,z:7,halfX:11,halfZ:1.8},
  {x:11,z:7,halfX:11,halfZ:1.8},
  {x:-18,z:8,halfX:4.8,halfZ:4.0},
  {x:18,z:8,halfX:4.8,halfZ:4.0},
] as const;

/** Scenery built only while preparing the shrine cinematic. */
export function sakuraBackdropPlacements():RangePlacement[]{
  const list:RangePlacement[]=[];
  // A layered orchard beyond the playable garden closes the low cinematic horizon.
  // Offset rows and varied radii avoid a visibly circular fence of identical trees.
  for(let row=0;row<3;row++){
    const count=28+row*8;
    for(let i=0;i<count;i++){
      const angle=(i+.37*row)*Math.PI*2/count;
      const radius=70+row*19+Math.sin(i*2.17+row)*4;
      list.push({asset:'sakura',x:Math.cos(angle)*radius,z:Math.sin(angle)*radius,
        scale:2.1+row*.35+.35*Math.sin(i*1.73),yaw:i*2.399+row,walkable:true});
    }
  }
  // Low, overlapping stone ridges break up the flat ground beyond the blossom canopy.
  for(let i=0;i<24;i++){
    const angle=(i+.2)*Math.PI*2/24,radius=138+Math.sin(i*1.7)*7;
    list.push({asset:'rock-boulder',x:Math.cos(angle)*radius,z:Math.sin(angle)*radius,
      scale:10+3*Math.sin(i*2.1),yaw:i*2.399,walkable:true});
  }
  return list;
}
