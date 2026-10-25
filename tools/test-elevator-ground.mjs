import assert from 'node:assert/strict';
import {SnowField} from '../src/survivor/snow-field.ts';
import {onElevatorFootprint,ELEVATOR_YAW} from '../src/survivor/elevator-footprint.ts';
const f=new SnowField({bounds:{minX:-10,minZ:-10,width:20,depth:20},resolution:256,depthAt:()=>1,excludeAt:(x,z)=>onElevatorFootprint(x,z,.12)});
for(let pass=0;pass<3;pass++){
 f.fill(()=>.6+pass*.2);
 f.trail({x:-4,z:0},{x:-3,z:0});f.refill(60,1);f.resetTrails();
 for(let x=-3.5;x<=3.5;x+=.25)for(let z=-3.5;z<=3.5;z+=.25){
  const wx=Math.cos(ELEVATOR_YAW)*x+Math.sin(ELEVATOR_YAW)*z,wz=-Math.sin(ELEVATOR_YAW)*x+Math.cos(ELEVATOR_YAW)*z;
  assert.equal(f.depth(wx,wz),0);assert.equal(f.surfaceHeight(wx,wz),null);
 }
 assert.ok(f.depth(7,0)>.5);
}
console.log('Elevator snow exclusion survives preset changes, trails and refill; surrounding snow retained.');
