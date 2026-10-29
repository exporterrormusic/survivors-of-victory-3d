import assert from 'node:assert/strict';
import {register} from 'node:module';
register('./ts-hooks.mjs',import.meta.url);
const {NullEngine,Scene,Vector3}=await import('@babylonjs/core');
const {createDorothy}=await import('../src/survivor/dorothy/index.ts');
const {Run}=await import('../src/survivor/run.ts');
const engine=new NullEngine();
function setup(){
 const scene=new Scene(engine),run=new Run('dorothy');run.critChance=0;
 const position=new Vector3(),aim=new Vector3(0,0,10),list=[],quads=[],effects=[],sounds=[];
 let hp=60,wall=false,shield=false,blocks=0;
 const vfx={quad(){const q={busy:true,visible:false,glow:false,alpha:1};quads.push(q);return q;},release(q){q.busy=false;},
   ring(){},flash(){},flashSprite(){},sprite(q){q.visible=true;},decal(q){q.visible=true;},streak(q){q.visible=true;},add(e){effects.push(e);}};
 const ctx={scene,run,vfx,playerPosition:position,aimPoint:aim,aimYaw:0,get hp(){return hp;},
   sound(c){sounds.push(c.url);},camera:{shake(){}},targets:{targets:list,
   navigation:{traceCover(){return wall?0:null;}},shieldContact(){return shield?{t:0,shield:{block(){blocks++;}}}:null;},
   inRadius(at,r){return list.filter(t=>t.alive&&Vector3.Distance(t.position,at)<=r+t.radius);}}};
 const kit=createDorothy(ctx);
 function target(z,x=0,health=1000){const t={position:new Vector3(x,0,z),radius:.2,barHeight:1,scale:1,generation:0,hp:health,alive:true,damageMultiplier:1,marked:false,ward:null,
   shove(v){this.knock=v.clone();},
   hit(n){this.hp=Math.max(0,this.hp-n);this.alive=this.hp>0;return !this.alive;}};list.push(t);return t;}
 const tick=(dt)=>{const velocity=kit.specialMovement(dt);if(velocity&&!wall)position.addInPlace(velocity.scale(dt));kit.update(dt);};
 const shoot=(x=0)=>{kit.fire(new Vector3(x,1.8,0),new Vector3(x,1.8,10));for(let i=0;i<70;i++)kit.update(.01);};
 return {scene,run,kit,position,aim,list,target,tick,shoot,sounds,quads,get blocks(){return blocks;},wall(v){wall=v;},shield(v){shield=v;},hp(v){hp=v;},close(){kit.dispose();for(const e of effects)e.dispose?.();assert.equal(quads.filter(q=>q.busy).length,0);scene.dispose();}};
}
// Flight is harmless in transit; landing damages, exposes and pushes once.
{
 const s=setup(),passed=s.target(3),t=s.target(9);assert.equal(s.kit.useSpecial(),true);assert.equal(s.kit.useSpecial(),false);
 assert.equal(s.kit.invulnerable,true);
 for(let i=0;i<10;i++)s.tick(.02);
 assert.equal(passed.hp,1000);assert.equal(t.hp,1000);
 for(let i=0;i<30;i++)s.tick(.02);
 assert.equal(s.kit.invulnerable,false);assert.ok(t.knock.z<0);assert.equal(passed.hp,1000);passed.alive=false;
 assert.ok(Math.abs(s.position.z-10)<1e-8);assert.equal(t.hp,970);assert.equal(s.kit.presentationLift,0);
 s.shoot();assert.equal(t.hp,966,'Exposed rounds to 4 damage versus baseline 3');
 s.kit.update(4);s.shoot();assert.equal(t.hp,963,'Exposed expires');
 s.kit.update(8);assert.equal(s.kit.special().charges,1);s.close();
}
// Destination is captured at activation, with no six-meter cap.
{
 const s=setup();s.aim.set(12,0,36);s.kit.useSpecial();s.aim.set(-20,0,-20);
 for(let i=0;i<150;i++)s.tick(.02);
 assert.ok(Vector3.Distance(s.position,new Vector3(12,0,36))<1e-6);s.close();
}
// A render-only frame cannot cancel Flight; death resets both forms before respawn.
{
 const s=setup();s.kit.useSpecial();s.kit.update(0);
 assert.equal(s.kit.throughEnemies,true);assert.ok(s.kit.specialMovement(.02));
 s.kit.useBurst(s.position,0);s.kit.onDeath();
 assert.equal(s.kit.throughEnemies,false);assert.equal(s.kit.burstActive,false);
 assert.equal(s.kit.presentationLift,0);s.close();
}
// Wall prevents flight damage; shields intercept shots.
{
 const s=setup(),t=s.target(3);s.wall(true);s.kit.useSpecial();s.tick(.48);assert.equal(s.position.z,0);assert.equal(t.hp,1000);
 s.wall(false);s.shield(true);s.shoot();assert.equal(t.hp,1000);assert.equal(s.blocks,1);s.close();
}
// Normal shots stop at one target; Manifestation pierces and detonates stored damage once.
{
 const s=setup(),a=s.target(3),b=s.target(6);s.shoot();assert.equal(a.hp,997);assert.equal(b.hp,1000);assert.ok(s.run.burst>0);
 s.aim.set(0,0,3);s.kit.useBurst(s.position,0);s.kit.useBurst(s.position,0);assert.equal(s.sounds.filter(x=>x.includes('burst.mp3')).length,1);
 s.shoot();assert.equal(a.hp,994);assert.equal(b.hp,997);assert.match(s.kit.burstLabel,/^\d+\.\ds$/);
 s.kit.update(8);assert.equal(a.hp,970);assert.equal(b.hp,973);assert.equal(s.kit.burstActive,false);
 s.kit.update(1);assert.equal(a.hp,970,'no repeated detonation');s.close();
}
// Killing a branded enemy keeps its contribution; all survivors share the final total.
{
 const s=setup(),a=s.target(3,0,3),b=s.target(4,1);s.aim.set(0,0,3);s.kit.useBurst(s.position,0);s.shoot();
 assert.equal(a.alive,false);assert.equal(b.hp,1000);assert.match(s.kit.burstLabel,/^\d+\.\ds$/);
 s.kit.update(8);assert.equal(b.hp,979);s.close();
}
// Spread-out brands receive the same full shared damage, independent of cursor aim.
{
 const s=setup(),a=s.target(3),b=s.target(12,10);s.aim.set(200,0,200);
 s.kit.useBurst(s.position,0);s.shoot();assert.match(s.kit.burstLabel,/^\d+\.\ds$/);
 s.kit.update(8);assert.equal(a.hp,976);assert.equal(b.hp,979);s.close();
}
// Empty-target cast binds its one Brand on first hit; death cancels the active form.
{
 const s=setup();s.kit.useBurst(s.position,0);const t=s.target(3);s.shoot();assert.match(s.kit.burstLabel,/^\d+\.\ds$/);
 s.hp(0);s.kit.update(.1);assert.equal(s.kit.burstActive,false);assert.equal(s.kit.presentationLift,0);assert.equal(t.hp,997);s.close();
}
// A recycled target must not inherit the previous life's Brand.
{
 const s=setup(),t=s.target(3);s.kit.useBurst(s.position,0);s.shoot();t.generation++;t.hp=1000;
 s.kit.update(8);assert.equal(t.hp,1000);s.close();
}
// Storage caps at 180 before the final blast; it cannot grow without bound.
{
 const s=setup(),t=s.target(3,0,10000);s.kit.useBurst(s.position,0);
 for(let i=0;i<80;i++)s.kit.fire(new Vector3(0,1.8,0),new Vector3(0,1.8,10));
 s.kit.update(.1);assert.match(s.kit.burstLabel,/^\d+\.\ds$/);
 const before=t.hp;s.kit.update(8);assert.equal(before-t.hp,198);s.close();
}
engine.dispose();console.log('Dorothy Flight / Exposed / Brand / piercing / lifecycle: passed');
