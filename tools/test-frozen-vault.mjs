import assert from 'node:assert/strict';
import { register } from 'node:module';
register('./ts-hooks.mjs',import.meta.url);
const {NullEngine,Scene,StandardMaterial,TransformNode,Vector3,Ray}=await import('@babylonjs/core');
const {FrozenVault,vaultDoorPose,vaultObstacles}=await import('../src/survivor/frozen-vault.ts');
const {createFrozenAsset}=await import('../src/survivor/frozen-kit.ts');
const {NavigationMap}=await import('../src/navigation.ts');
const engine=new NullEngine(),scene=new Scene(engine);
const materials={mats:new Map(['steel','dark','ice','orange','snow','light','crystal'].map(k=>[k,new StandardMaterial(k,scene)]))};
// The vault is unused by the current Frozen North but stays available for other maps.
const hit=(root,origin,direction,length)=>{
 for(const m of root.getChildMeshes())m.computeWorldMatrix(true);
 return new Ray(origin,direction,length).intersectsMeshes(root.getChildMeshes()).length>0;
};
for(const asset of ['frozen-outcrop','frozen-barrier','frozen-beacon','frozen-hangar','frozen-relay','frozen-mountain']){
 const node=createFrozenAsset(scene,asset,materials);assert.ok(node.getChildMeshes().length>0,asset+' builds geometry');node.dispose();
}
const parent=new TransformNode('arrival',scene);parent.position.set(0,0,12);
const vault=new FrozenVault(scene,parent);
vault.pose(0);
assert.ok(hit(vault.root,new Vector3(0,3,4),new Vector3(0,0,1),6),'closed door blocks the entrance');
vault.pose(1);
assert.ok(!hit(vault.root,new Vector3(0,3,4),new Vector3(0,0,1),9),'rolled door clears the entrance');
assert.equal(vaultDoorPose(.2).x,0,'door retracts before rolling');
assert.ok(vaultDoorPose(1).x>7,'door clears the whole opening');
const open=new NavigationMap(vaultObstacles(false),30),closed=new NavigationMap(vaultObstacles(true),30);
assert.ok(open.clear({x:0,z:0},{x:0,z:-6},1.1),'open doorway passes large units');
assert.ok(!closed.clear({x:0,z:0},{x:0,z:-6},.45),'closed door blocks player movement');
vault.dispose();scene.dispose();engine.dispose();
console.log('Frozen kit builds, retract-and-roll vault door, and open/closed collision passed.');
