import assert from 'node:assert/strict';
import { register } from 'node:module';register('./ts-hooks.mjs',import.meta.url);
const { NihilisterSchedule }=await import('../src/survivor/nihilister-schedule.ts');
for(const fps of [30,60,144]){const clock=new NihilisterSchedule();let hits=0;for(let frame=1;frame<=600*fps;frame++){clock.update(1/fps,()=>{hits++;return true;});if(frame%(120*fps)===0)assert.equal(hits,frame/(120*fps));}assert.equal(hits,5);}
const clock=new NihilisterSchedule();let hits=0;clock.update(0,()=>{hits++;return true;});assert.equal(hits,0);clock.update(120,()=>false);clock.update(.5,()=>{hits++;return true;});assert.equal(hits,0);clock.update(.5,()=>{hits++;return true;});assert.equal(hits,1);clock.reset();clock.update(119,()=>{hits++;return true;});assert.equal(hits,1);
console.log('Nihilister: exactly every 120 seconds at 30/60/144 FPS; pause, reset and blocked-landing retry passed.');
