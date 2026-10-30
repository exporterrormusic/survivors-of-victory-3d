import assert from 'node:assert/strict';
import {Vector3} from '@babylonjs/core';
import {targetContact} from '../src/survivor/projectile-collision.ts';
const enemy={position:new Vector3(0,0,10),radius:1,barHeight:3,scale:1};
const cast=(a,b,t=enemy)=>targetContact(new Vector3(...a),new Vector3(...b),t);
assert.equal(cast([0,2,0],[0,2,20]),.45,'Upper-body rocket must hit');
assert.equal(cast([0,.7,0],[0,.7,20]),.45,'Existing low shots still hit');
assert.equal(cast([0,4,0],[0,4,20]),null,'Shots above the body must miss');
assert.equal(cast([0,-1,0],[0,-1,20]),null,'Shots below the body must miss');
assert.equal(cast([2,2,0],[2,2,20]),null,'Shots beside the body must miss');
assert.equal(cast([0,5,10],[0,-1,10]),1/3,'Vertical shot enters through body top');
assert.equal(cast([0,2,10],[0,2,10]),0,'Starting inside registers contact');
assert.equal(cast([0,4,10],[0,4,10]),null,'Stationary shot outside misses');
assert.equal(cast([0,5,0],[0,5,20],{...enemy,position:new Vector3(0,4,10)}),.45,'Elevated enemies retain their world height');
// Rapunzel launches from a raised staff toward ground well behind the crosshair target.
for(const fps of [20,30,60,144]) {
 let at=new Vector3(0,2.5,0),goal=new Vector3(0,0,80),impact=null;
 for(let frame=0;frame<fps*2;frame++) {
  const delta=goal.subtract(at),end=at.add(delta.normalize().scale(18/fps));
  const t=targetContact(at,end,enemy);
  if(t!==null){impact=Vector3.Lerp(at,end,t);break;}
  at=end;
 }
 assert.ok(impact && Math.abs(impact.z-9)<1e-6,`Swept first-person rocket hits at ${fps} FPS`);
 assert.ok(impact.y>2,'Regression trajectory crosses torso above the old foot sphere');
}
assert.ok(cast([0,2,0],[0,2,20])>.2,'Earlier cover/shield contact wins');
console.log('Rocket body contact: torso, misses, elevation, vertical shots, cover ordering and 20–144 FPS passed.');
