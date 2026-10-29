import { Vector3 } from '@babylonjs/core';
import { SFX, WEAPON_FIRE, WEAPON_RELOAD } from '../../audio/sound-bank';
import type { CharacterKit, KitContext, WeaponSpec } from '../kit';
import type { Target } from '../targets';
import { targetFootprintContact } from '../projectile-collision';
import { laserBolt, laserFlash, LASER_HIT_RADIUS } from './laser-effects';
import { dorothyLanding } from './landing-effects';
import { createDorothyWings } from './wings';

export const DOROTHY_WEAPON: Readonly<WeaponSpec> = {
  damage: 3, magazine: 60, reload: 1, cooldown: .1, automatic: true,
  moveSpeed: 6.375, maxHp: 60,
};
export const DOROTHY_KIT = {
  flightSpeed: 18, flightMinDuration: .25, flightCooldown: 8, flightDamage: 30, landingRadius: 4, landingKnockback: 12,
  exposedDuration: 4, exposedMultiplier: 1.35,
  burstDuration: 8, brandRange: 20, brandRadius: 5, brandCap: 180,
  brandBaseDamage: 18, brandStoredShare: 1,
} as const;
const PINK = [1, .22, .64] as const;

export function createDorothy(ctx: KitContext): CharacterKit {
  const shots: { at: Vector3; direction: Vector3; life: number; pierce: boolean;
    hits: Map<Target, number>; visual: ReturnType<typeof laserBolt> }[] = [];
  const exposed = new Map<Target, { time: number; generation: number }>();
  const wings = createDorothyWings(ctx);
  const exposedIcons=new Map<Target,ReturnType<KitContext['vfx']['quad']>>();
  let landingGrace=0;
  let disposed=false, cooldown=0, flightTime=0, flightLength=0, flightDuration=1, formTime=0, armor=0, trailTime=0;
  const flightDirection=new Vector3(), flightFrom=new Vector3(), flightDestination=new Vector3();
  const brands=new Map<Target,{generation:number;icon:ReturnType<KitContext['vfx']['quad']>;ring:ReturnType<KitContext['vfx']['quad']>}>();
  let storedDamage=0;
  const alive=()=>!disposed && (ctx.hp??1)>0;
  const body=(t:Target)=>t.position.add(new Vector3(0,.7,0));
  const visible=(from:Vector3,t:Target)=>ctx.targets.navigation.traceCover(from,body(t))===null;
  function clearBrand(target:Target) {
    const mark=brands.get(target);if(!mark)return;
    ctx.vfx.release(mark.icon);ctx.vfx.release(mark.ring);brands.delete(target);
  }
  function setBrand(target:Target) {
    if(brands.get(target)?.generation===target.generation)return;
    clearBrand(target);
    const icon=ctx.vfx.quad('holy-seal',PINK,.9),ring=ctx.vfx.quad('ring',PINK,.7);
    icon.glow=ring.glow=true;brands.set(target,{generation:target.generation,icon,ring});
    ctx.vfx.ring(target.position,PINK,.2,1.5,.35);
  }
  function detonate() {
    // Snapshot the whole wave before dealing damage: overlapping explosions hit once.
    const victims=new Set<Target>();
    const scale=Math.max(.001,ctx.run.growth*ctx.run.damageScale*ctx.run.passiveScale);
    const amount=DOROTHY_KIT.brandBaseDamage+storedDamage*DOROTHY_KIT.brandStoredShare/scale;
    for(const [target,mark] of brands){
      if(!target.alive||target.generation!==mark.generation)continue;
      const at=target.position,origin=body(target);
      victims.add(target);
      ctx.vfx.ring(at,PINK,.3,DOROTHY_KIT.brandRadius,.45,.8);
      ctx.vfx.flashSprite(origin,[1,.7,.9],2,.22,1,'star');
      for(const nearby of ctx.targets.inRadius(at,DOROTHY_KIT.brandRadius)){
        if(victims.has(nearby)||!visible(origin,nearby))continue;
        const shield=ctx.targets.shieldContact(origin,body(nearby));
        if(shield){shield.shield.block(Vector3.Lerp(origin,body(nearby),shield.t),amount*scale);continue;}
        victims.add(nearby);
      }
    }
    for(const target of [...brands.keys()])clearBrand(target);
    storedDamage=0;ctx.run.beginBurst();
    if(victims.size)ctx.camera.shake(.14,.18);
    for(const target of victims)if(target.alive){
      ctx.run.damage(target,amount,'burst');laserFlash(ctx.vfx,body(target),flightDirection,true);
    }
  }
  function damage(target:Target, amount:number, source:'attack'|'special') {
    if(formTime>0)setBrand(target);
    const previousHp=target.hp;
    const dealt=ctx.run.damage(target,amount,source);
    if(formTime>0 && brands.get(target)?.generation===target.generation)
      storedDamage=Math.min(DOROTHY_KIT.brandCap*ctx.run.growth,storedDamage+Math.max(0,Math.min(previousHp,dealt)));
  }
  function land() {
    if(flightTime<=0)return;
    flightTime=0;landingGrace=.15;
    const at=ctx.playerPosition,origin=at.add(new Vector3(0,.7,0));
    dorothyLanding(ctx.vfx,at,DOROTHY_KIT.landingRadius);ctx.camera.shake(.12,.16);
    for(const target of ctx.targets.inRadius(at,DOROTHY_KIT.landingRadius)){
      if(!visible(origin,target)||ctx.targets.shieldContact(origin,body(target)))continue;
      damage(target,DOROTHY_KIT.flightDamage,'special');
      if(!target.alive)continue;
      const outward=target.position.subtract(at);outward.y=0;
      if(outward.lengthSquared()<.0001)outward.copyFrom(flightDirection);
      target.shove(outward.normalize().scale(DOROTHY_KIT.landingKnockback));
      exposed.set(target,{time:DOROTHY_KIT.exposedDuration,generation:target.generation});
      if(!exposedIcons.has(target)){const q=ctx.vfx.quad('holy-shard',PINK,.9);q.glow=true;exposedIcons.set(target,q);}
      laserFlash(ctx.vfx,body(target),outward,true);
    }
  }
  function clearExposed(target:Target) {
    exposed.delete(target);
    const q=exposedIcons.get(target);if(q){ctx.vfx.release(q);exposedIcons.delete(target);}
  }
  function cancel() {
    flightTime=formTime=armor=landingGrace=0;storedDamage=0;
    for(const target of [...brands.keys()])clearBrand(target);
    for(const t of [...exposed.keys()])clearExposed(t);
    for(const shot of shots)shot.visual.stop();shots.length=0;
    wings.update(0);
  }
  return {
    weapon:{...DOROTHY_WEAPON},talentTiers:true,affiliation:'INHERIT',accent:PINK,
    specialName:'Angel’s Flight',burstName:'Paradise Lost',
    onDeath:cancel,
    get invulnerable(){return alive()&&flightTime>0;},
    get throughEnemies(){return flightTime>0||landingGrace>0;},
    get burstActive(){return formTime>0;},
    get burstLabel(){return formTime>0 ? `${formTime.toFixed(1)}s` : undefined;},
    get presentationLift(){return flightTime>0 ? Math.sin(Math.PI*(1-flightTime/flightDuration))*1.5 : 0;},
    icons:{weapon:'rifle',special:'wings',dash:'dash'},reloadSound:WEAPON_RELOAD['pulse-rifle'],
    async prepare(){await wings.prepare();},
    afterPlayerAnimation(){if(!alive())cancel();wings.update(armor); },
    specialMovement(dt) {
      if(!alive()||flightTime<=0||dt<=0)return null;
      const remaining=flightDestination.subtract(ctx.playerPosition);remaining.y=0;
      const distance=remaining.length();
      if(distance<.02){land();return null;}
      return remaining.scale(Math.min(distance,flightLength/flightDuration*dt)/distance/dt);
    },
    fire(muzzle,aim) {
      if(!alive())return;
      const direction=aim.subtract(muzzle);direction.y=0;
      if(direction.lengthSquared()<.0001)direction.set(Math.sin(ctx.aimYaw??0),0,Math.cos(ctx.aimYaw??0));
      direction.normalize();
      shots.push({at:muzzle.clone(),direction,life:.65,pierce:formTime>0,hits:new Map(),visual:laserBolt(ctx.vfx,muzzle.clone(),direction)});
      laserFlash(ctx.vfx,muzzle,direction);ctx.sound(WEAPON_FIRE['pulse-rifle'],muzzle);
    },
    useSpecial() {
      if(!alive()||cooldown>0||flightTime>0)return false;
      flightFrom.copyFrom(ctx.playerPosition);
      flightDirection.copyFrom(ctx.aimPoint??ctx.playerPosition).subtractInPlace(ctx.playerPosition);flightDirection.y=0;
      const distance=flightDirection.length();
      if(distance<.1)return false;
      flightDirection.normalize();flightDestination.copyFrom(ctx.aimPoint!);
      flightLength=distance;flightDuration=Math.max(DOROTHY_KIT.flightMinDuration,distance/DOROTHY_KIT.flightSpeed);
      flightTime=flightDuration;cooldown=DOROTHY_KIT.flightCooldown;trailTime=0;
      ctx.vfx.ring(ctx.playerPosition,PINK,.2,1.2,.25);
      return true;
    },
    cancelSpecial(){flightTime=0;},
    special:()=>({charges:cooldown<=0?1:0,maxCharges:1,progress:1-cooldown/DOROTHY_KIT.flightCooldown,
      label:flightTime>0?'FLYING':cooldown>0?`${cooldown.toFixed(1)}s`:'Angel’s Flight',
      hint:'Fly invulnerably to the cursor. Land with a 4m pink blast: 30 damage, knockback and Exposed for 4s. 8s cooldown.'}),
    useBurst(origin) {
      if(!alive()||formTime>0)return;
      formTime=DOROTHY_KIT.burstDuration;storedDamage=0;
      for(const target of [...brands.keys()])clearBrand(target);
      const start=origin.add(new Vector3(0,.7,0));
      for(const target of ctx.targets.targets)if(target.alive && Vector3.DistanceSquared(target.position,origin)<=DOROTHY_KIT.brandRange**2 && visible(start,target) && !ctx.targets.shieldContact(start,body(target)))setBrand(target);
      ctx.sound(SFX.dorothyBurst,ctx.playerPosition);
      ctx.vfx.ring(origin,PINK,.2,3,.5);ctx.vfx.flashSprite(origin.add(new Vector3(0,1,0)),[1,.8,.95],2,.3,.8,'star');
    },
    update(dt) {
      if(disposed)return;
      if(!alive()){cancel();return;}
      if(dt<=0)return;
      landingGrace=Math.max(0,landingGrace-dt);
      cooldown=Math.max(0,cooldown-dt);
      for(const [target,state]of exposed){
        state.time-=dt;
        if(state.time<=0||!target.alive||target.generation!==state.generation){clearExposed(target);continue;}
        ctx.vfx.sprite(exposedIcons.get(target)!,target.position.add(new Vector3(0,target.barHeight*target.scale+.3,0)),.5);
      }
      if(flightTime>0){
        landingGrace=.15;
        const end=ctx.playerPosition;
        trailTime-=dt;
        if(trailTime<=0){trailTime=.055;ctx.afterimage?.(PINK);ctx.vfx.flashSprite(end.add(new Vector3(0,.5,0)),PINK,.65,.18,.45,'holy-shard');}
        const moved=Vector3.DistanceSquared(flightFrom,end);
        const remaining=flightDestination.subtract(end);remaining.y=0;
        flightFrom.copyFrom(end);
        // Terrain may slow movement. Finish on arrival (or a blocking wall), not a timer.
        if(remaining.lengthSquared()<.0004 || moved<1e-10)land();
        else flightTime=Math.max(.001,flightTime-dt);
      }
      if(formTime>0){
        formTime=Math.max(0,formTime-dt);
        for(const [target,mark] of brands){
          if(!target.alive||target.generation!==mark.generation){clearBrand(target);continue;}
          ctx.vfx.sprite(mark.icon,target.position.add(new Vector3(0,target.barHeight*target.scale+.65,0)),.9,formTime*.4);
          ctx.vfx.decal(mark.ring,target.position,1.9);
        }
        if(formTime===0)detonate();
      }
      const armorGoal=formTime>0||flightTime>0?1:0;
      armor+=Math.sign(armorGoal-armor)*Math.min(Math.abs(armorGoal-armor),dt*6);wings.update(armor);
      for(let i=shots.length-1;i>=0;i--){
        const shot=shots[i],step=Math.min(dt,shot.life),next=shot.at.add(shot.direction.scale(45*step));
        const cover=ctx.targets.navigation.traceCover(shot.at,next,LASER_HIT_RADIUS),shield=ctx.targets.shieldContact(shot.at,next);
        let contact=Math.min(cover??Infinity,shield?.t??Infinity);
        const contacts:{target:Target;t:number}[]=[];
        for(const target of ctx.targets.targets)if(target.alive&&shot.hits.get(target)!==target.generation){
          const hit=targetFootprintContact(shot.at,next,target,LASER_HIT_RADIUS);
          if(hit!==null&&hit<contact)contacts.push({target,t:hit});
        }
        contacts.sort((a,b)=>a.t-b.t);ctx.run.beginShot();
        for(const hit of contacts){
          if(!hit.target.alive)continue;
          shot.hits.set(hit.target,hit.target.generation);
          const debuff=exposed.get(hit.target);
          damage(hit.target,DOROTHY_WEAPON.damage*(debuff?.generation===hit.target.generation?DOROTHY_KIT.exposedMultiplier:1),'attack');
          laserFlash(ctx.vfx,Vector3.Lerp(shot.at,next,hit.t),shot.direction,true);
          if(!shot.pierce){contact=hit.t;break;}
        }
        const end=contact<=1?Vector3.Lerp(shot.at,next,contact):next;
        shot.visual.draw(end);shot.life-=dt;
        if(shield&&shield.t===contact)shield.shield.block(end,DOROTHY_WEAPON.damage*ctx.run.growth);
        if(contact<=1)laserFlash(ctx.vfx,end,shot.direction,true);
        if(contact<=1||shot.life<=0){shot.visual.stop();shots.splice(i,1);}else shot.at.copyFrom(next);
      }
    },
    dispose(){if(disposed)return;cancel();disposed=true;wings.dispose();},
  };
}
