import assert from 'node:assert/strict';
import {ElevatorMotion,ELEVATOR_DEPTH,SEAL_CLEARANCE} from '../src/survivor/elevator-motion.ts';
const tick=(m,seconds)=>{for(let t=0;t<seconds;t+=.01){m.update(.01);if(m.seal>0)assert.ok(m.height<=-SEAL_CLEARANCE,'blast doors require cage clearance');}};
const m=new ElevatorMotion();m.command('descend');tick(m,1);assert.equal(m.height,0);tick(m,8);
assert.equal(m.height,-ELEVATOR_DEPTH);assert.equal(m.seal,1);assert.equal(m.phase,'sealed');
m.command('open');assert.equal(m.phase,'sealed');
m.command('rise');tick(m,.5);assert.ok(m.height>-ELEVATOR_DEPTH,'ascent begins while hatch opens');assert.ok(m.seal>0&&m.seal<1,'hatch and lift move together');tick(m,8);assert.equal(m.height,0);assert.equal(m.seal,0);
m.command('cycle');tick(m,19);assert.equal(m.phase,'idle');assert.equal(m.gateOpen,1);assert.equal(m.height,0);
m.command('descend');tick(m,.7);m.command('open');tick(m,3);assert.equal(m.height,0);assert.equal(m.phase,'idle');
m.command('descend');tick(m,5);const before=JSON.stringify(m);m.update(0);assert.equal(JSON.stringify(m),before);m.command('rise');tick(m,9);assert.equal(m.height,0);
// Reverse at several depths, including just below the hatch clearance.
for(const seconds of [2,3,4,5,7]){const r=new ElevatorMotion();r.command('descend');tick(r,seconds);r.command('rise');tick(r,7);assert.equal(r.height,0);assert.equal(r.seal,0);}
console.log('elevator: seal clearance, gate interlocks, reversal, cycle and pause passed');
