import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true});
try{const page=await browser.newPage();await page.route('**/arms-test',r=>r.fulfill({contentType:'text/html',body:'<canvas></canvas>'}));await page.goto('http://127.0.0.1:5198/arms-test');
const results=await page.evaluate(async()=>{
 const {Engine,Scene}=await import('/node_modules/.vite/deps/@babylonjs_core.js');
 const {Chibi,loadChibiIndex}=await import('/src/chibi.ts');const {firstPersonArms}=await import('/src/survivor/first-person-arms.ts');
 const engine=new Engine(document.querySelector('canvas')),index=await loadChibiIndex(),reports=[];
 for(const variant of ['c222_00','c222_01','c225_00','c225_01','c472_00']){
 const scene=new Scene(engine),chibi=await Chibi.load(scene,index.variants[variant],'head');
 const before=chibi.meshes.map(m=>({name:m.name,count:m.getTotalIndices(),indices:Array.from(m.getIndices()||[])}));
 const hide=firstPersonArms(chibi.meshes);hide(true);
 const changes=chibi.meshes.map((m,i)=>({name:m.name,before:before[i].count,after:m.getTotalIndices()}));
 hide(false);const restored=chibi.meshes.every((m,i)=>JSON.stringify(Array.from(m.getIndices()||[]))===JSON.stringify(before[i].indices));
 reports.push({variant,changes,restored});scene.dispose();}
 engine.dispose();return reports;
});for(const r of results){assert.ok(r.restored);assert.ok(r.changes.some(c=>c.after<c.before),'Arm geometry removed for '+r.variant);assert.ok(r.changes.some(c=>/weapon/i.test(c.name)&&c.after>0&&c.after===c.before),'Sword preserved for '+r.variant);}console.log(JSON.stringify(results,null,2));
}finally{await browser.close();}
