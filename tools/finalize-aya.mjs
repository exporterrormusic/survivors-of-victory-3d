// Register the separate model and validate the animated GLB after Blender export.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import validator from 'gltf-validator';
const path='public/chibi/aya.glb';
const bytes=await fs.readFile(path);
const size=bytes.readUInt32LE(12);
const model=JSON.parse(bytes.subarray(20,20+size).toString());
// Blender 3.6 exports the texture but omits the multiply node on unlit materials.
for(const m of model.materials){
 if(m.name==='Aya blue iris'){
  m.pbrMetallicRoughness={baseColorFactor:[1,1,1,1],metallicFactor:0,roughnessFactor:1};
  delete m.emissiveFactor;m.extensions={KHR_materials_unlit:{}};
 }
 if(m.name==='Aya indigo patterned sleeves')m.pbrMetallicRoughness.baseColorFactor=[.68,.65,.85,1];
}
const data=Buffer.from(JSON.stringify(model));
const json=Buffer.alloc(Math.ceil(data.length/4)*4,0x20);data.copy(json);
const tail=bytes.subarray(20+size);const header=Buffer.alloc(20);
header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(20+json.length+tail.length,8);header.writeUInt32LE(json.length,12);header.writeUInt32LE(0x4e4f534a,16);
const result=Buffer.concat([header,json,tail]);await fs.writeFile(path,result);
for(const mesh of model.meshes.filter(m=>m.name.startsWith('Aya blue iris'))){
 for(const p of mesh.primitives){
  assert.notEqual(p.attributes.COLOR_0,undefined,'Iris colors must survive export');
  assert.ok(model.materials[p.material].extensions.KHR_materials_unlit,'Iris shader must be unlit');
 }
}
const paintedHair=model.materials.findIndex(m=>m.name==='Aya charcoal hair and ear fur');
assert.ok(model.meshes.find(m=>m.name==='Aya tapered ponytail').primitives.every(p=>p.material===paintedHair),'Ponytail must share the charcoal hair material');
assert.ok(paintedHair>=0);
assert.ok(model.meshes.filter(m=>m.name.startsWith('c282_00_skin')).some(m=>m.primitives.some(p=>p.material===paintedHair)),'Source scalp and bangs must use the same charcoal material');
for(const mesh of model.meshes.filter(m=>m.name.startsWith('Aya cat ear')))
 assert.ok(mesh.primitives.every(p=>p.material===paintedHair),'Outer ear fur must share the hair material');
const report=await validator.validateBytes(new Uint8Array(result),{maxIssues:100});
await fs.writeFile('artifacts/aya/gltf-validation.json',JSON.stringify(report,null,2));
assert.equal(report.issues.numErrors,0,JSON.stringify(report.issues));
const indexPath='public/chibi/index.json';const index=JSON.parse(await fs.readFile(indexPath,'utf8'));
const source=index.variants.c282_00;
assert.deepEqual(model.animations.map(a=>a.name).sort(),Object.keys(source.clips).sort());
const meta=structuredClone(source);meta.file='aya.glb';meta.variant='aya';meta.icon='aya_icon.png';
for(const clip of Object.values(meta.clips))if(clip.muzzle){const [x,y,z]=clip.muzzle.offset;clip.muzzle.offset=[-z,-x,y];}
index.variants.aya=meta;
await fs.writeFile(indexPath,JSON.stringify(index,null,1)+'\n');
console.log(JSON.stringify({errors:report.issues.numErrors,warnings:report.issues.numWarnings,animations:model.animations.length,meshes:model.meshes.length,bytes:result.length}));
