import { Vector3 } from '@babylonjs/core';
import { Chibi, loadChibiIndex } from '../../chibi';
import { NavigationAgent } from '../../navigation';
import { SFX, WEAPON_FIRE, WEAPON_RELOAD } from '../../audio/sound-bank';
import { PX, type CharacterKit, type KitContext } from '../kit';
import type { SquadMember, Target } from '../targets';
import { TwinStickRig } from '../rig';
import { targetContact } from '../projectile-collision';
import { MeditationPose } from './meditation-pose';
import { MeditationEffects } from './meditation-effects';
import { GoldForm } from './gold-form';
import { HolyEnergy } from './holy-energy';
import { nirvanaBolt, nirvanaMuzzle, nirvanaImpact } from './smg-effects';

const GOLD = [1, .78, .3] as const, SILVER = [.83,.93,1] as const;
interface Clone extends SquadMember { model: Chibi; rig: TwinStickRig; radius: number; agent: NavigationAgent; timer: number; nextHand: number; life: number; experience: number; motion: Vector3; hp: number; soldier: boolean; destination?: Vector3; formationOffset:Vector3; charged: Set<Target> }
interface Shot { at: Vector3; direction: Vector3; life: number; damage: number; clone: boolean; soldier: boolean; visual: ReturnType<typeof nirvanaBolt> }

export function createNayuta(ctx: KitContext, variant = 'c223_00'): CharacterKit {
  const has = (id: string) => ctx.run.talents.has(id);
  const clones: Clone[] = [], pool: Chibi[] = [], shots: Shot[] = [];
  let goldForm: GoldForm | undefined, meditation: MeditationPose | undefined;
  let meditating = false, formBlend = 0;
  let cutscenePresentation = false;
  const meditationEffects=new MeditationEffects(ctx);
  const cloneGold = new Map<Chibi,GoldForm>();
  const departures: {model:Chibi;age:number}[]=[];
  const rigs = new Map<Chibi, TwinStickRig>();
  const afterAnimations = ctx.scene.onAfterAnimationsObservable.add(() => {
    for (const clone of clones) if (clone.alive) clone.rig.applyAim();

  });
  const effects = new HolyEnergy(ctx);
  const weapon = { damage: 2, magazine: 30, reload: 2, cooldown: .08, automatic: true, moveSpeed: 510 * PX, maxHp: 50, melee: false };
  let cooldown = 0, charges = 3, ready = false, disposed = false;
  let holding = false, heldTime = 0, holdUsed = false, returnRepeat = 0;
  let insight = 0, insightTime = 0, burstTime = 0;
  let focus: Target | undefined, focusTime = 0;
  let volleyTime=0;
  let formation: Vector3 | undefined;
  const clear = (a: Vector3, b: Vector3) => ctx.targets.navigation.traceCover(a.add(new Vector3(0, .7, 0)), b.add(new Vector3(0, .7, 0))) === null;
  const cap = () => 4;
  function questEvent(event:'clone-return'|'insight-time',amount=1){
    for(const talent of ctx.run.tiers?.recordEvent(event,amount)??[])ctx.run.onQuestComplete?.(talent);
  }
  const regulars = () => clones.filter(c=>c.alive&&!c.soldier);
  const interruptMeditation = () => { meditating=false; };
  const recharge = () => has('quick_summon') ? 4.5 : 6;
  function retire(c: Clone, animate = true) {
    c.hp = 0;
    const i = ctx.targets.squad.indexOf(c); if (i >= 0) ctx.targets.squad.splice(i, 1);
    clones.splice(clones.indexOf(c), 1);
    if(animate){departures.push({model:c.model,age:0});effects.departure(c.position,c.soldier);}
    else {c.model.root.setEnabled(false);pool.push(c.model);}
  }
  function summon(soldier=false, destination?:Vector3) {
    if (!ready) return;
    if (soldier ? clones.filter(c=>c.soldier).length>=8 : regulars().length>=cap()) return;
    const model = pool.pop(); if (!model) return;
    const gold=cloneGold.get(model);if(gold){gold.strength=0;gold.silver=soldier;}
    for(const mesh of model.meshes)mesh.visibility=.65;
    const angle = clones.length * 2.4;
    // Eight stable lanes: two ranks, 2.2 m apart, aligned with the cast direction.
    const slot=clones.filter(c=>c.soldier).length,yaw=ctx.aimYaw??0;
    const lateral=(slot%4-1.5)*2.2,depth=-1.8-Math.floor(slot/4)*2.2;
    const formationOffset=soldier?new Vector3(Math.cos(yaw)*lateral+Math.sin(yaw)*depth,0,-Math.sin(yaw)*lateral+Math.cos(yaw)*depth):new Vector3(Math.sin(angle)*1.4,0,Math.cos(angle)*1.4);
    const safe = ctx.targets.navigation.project(ctx.playerPosition.add(formationOffset), .4);
    model.root.position.set(safe.x, ctx.playerPosition.y, safe.z); model.root.setEnabled(true);
    const maxHp = (ctx.maxHp ?? 50) * .2 * (has('clone_health') ? 2 : 1);
    const clone: Clone = {
      name: soldier?'Nayuta (Silver Clone)':'Nayuta (Clone)', soldier, destination, formationOffset, charged:new Set(), model, rig: rigs.get(model)!, position: model.root.position, motion: new Vector3(), radius: .4,
      agent: new NavigationAgent(ctx.targets.navigation, .4), timer: 0, nextHand: -1, life: soldier?burstTime:3600, experience: 0, hp: maxHp, maxHp, threat: .35,
      get alive() { return this.hp > 0; },
      get cloneDisplay() {
        const duration=has('lessons_learned')?6:12;
        const next=clones.filter(c=>c.alive).sort((a,b)=>a.hp/a.maxHp-b.hp/b.maxHp)[0];
        return {silver:this.soldier,progress:this.soldier?this.life/(has('endless_procession')?12:8):Math.min(1,this.experience/duration),seconds:this.life,ready:!this.soldier&&this.experience>=duration,retrieving:holding&&next===this};
      },
      takeDamage(amount) { this.hp = Math.max(0, this.hp - amount); return !this.alive; },
      heal(amount) { if (this.alive) this.hp = Math.min(this.maxHp, this.hp + amount); },
    };
    clones.push(clone); ctx.targets.squad.push(clone);
    ctx.vfx.ring(clone.position, soldier?SILVER:GOLD, .1, 1.5, .5);
  }
  function launch(at: Vector3, aim: Vector3, clone: boolean, soldier=false, multiplier=1) {
    const direction = aim.subtract(at); direction.y = 0;
    if (direction.lengthSquared() < .0001) direction.set(Math.sin(ctx.aimYaw ?? 0), 0, Math.cos(ctx.aimYaw ?? 0));
    direction.normalize();
    shots.push({ at: at.clone(), direction, life: 1.2, clone, soldier, visual: nirvanaBolt(ctx.vfx, at, direction, clone, soldier),
      damage: multiplier*(clone ? (has('clone_damage') ? 2 : 1)*(meditating&&has('commanding_stillness')?2:1)*(1+insight*(has('deep_insight')?.3:.25)) : 2 * (1 + insight * (has('deep_insight') ? .3 : .25))) });
    nirvanaMuzzle(ctx.vfx, at, direction, clone, soldier);
  }
  function hit(t: Target, shot: Shot) {
    if (!shot.clone) ctx.run.beginShot();
    ctx.run.damage(t, shot.damage, shot.soldier ? 'burst' : shot.clone ? 'special' : 'attack');
    if (!shot.clone && t.alive) { focus = t; focusTime = 3; }
  }
  function absorb(c: Clone) {
    if (!c.alive) return;
    const maturity = c.soldier?0:Math.min(1, c.experience / (has('lessons_learned') ? 6 : 12));
    const start = c.position.clone();
    retire(c, true);
    effects.return(start, () => {
      if (disposed || (ctx.hp ?? 1) <= 0) return;
      const duration=has('lasting_insight')?14:10;
      // Returns extend an active buff by one-third to two-thirds of its duration.
      insightTime=insightTime>0?Math.min(duration,insightTime+duration*(1+maturity)/3):duration;
      insight = Math.min(4, insight + (c.soldier?.25:.5+.5*maturity));
      if(!c.soldier){
        if(has('return_gauge'))ctx.run.addBurst(3+3*maturity);
        questEvent('clone-return');
      }
      if (!c.soldier && maturity>=1 && has('cycle_return')) { charges = Math.min(3, charges + 1); if (charges === 3) cooldown = 0; }
      ctx.vfx.flashSprite(ctx.playerPosition.add(new Vector3(0,.8,0)), GOLD, .8, .22, .8, 'star');
    },c.soldier);
    return maturity;
  }
  function returnWeakest() {
    const c = clones.filter(c=>c.alive).sort((a,b)=>a.hp/a.maxHp-b.hp/b.maxHp)[0];
    if (c) absorb(c);
  }
  function manifest() {
    if (!ready) return false;
    if (regulars().length >= cap()) {
      const point = ctx.aimPoint ?? ctx.playerPosition;
      const offset = point.subtract(ctx.playerPosition); offset.y=0;
      if(offset.length()>8)offset.normalize().scaleInPlace(8);
      const safe = ctx.targets.navigation.project(ctx.playerPosition.add(offset), .4);
      formation = new Vector3(safe.x,ctx.playerPosition.y,safe.z);
      ctx.vfx.ring(formation,GOLD,.2,.7,.3);
      return true;
    }
    if(charges<=0 || !pool.length)return false;
    for(const c of [...clones])if(!c.alive)retire(c,false);
    summon();if(has('twin_self'))summon();charges--;if(cooldown<=0)cooldown=recharge();
    ctx.sound(SFX.summon,ctx.playerPosition);return true;
  }
  function dispose() {
    if (disposed) return; disposed = true; ready = false; burstTime = 0;
    effects.clear();
    meditationEffects.clear();
    if(goldForm)goldForm.strength=0;formBlend=0;
    if(ctx.playerModel)ctx.playerModel.root.position.y=0;
    for(const d of departures){d.model.root.setEnabled(false);pool.push(d.model);}departures.length=0;cloneGold.clear();
    for (const c of [...clones]) retire(c, false);
    ctx.scene.onAfterAnimationsObservable.remove(afterAnimations);
    for (const rig of rigs.values()) rig.dispose();
    rigs.clear();
    for (const model of pool) model.dispose();
    for (const shot of shots) shot.visual.stop();
    pool.length = shots.length = 0;
  }
  ctx.scene.onDisposeObservable.add(dispose);
  return {
    dispose,
    aimFacing: 'head', talentTiers: true,
    weapon,
    get presentationLift() { return cutscenePresentation ? 0 : formBlend*.35; },
    afterPlayerAnimation() { if (!cutscenePresentation) meditation?.apply(formBlend,ctx.aimYaw??0); },
    setCutscenePresentation(active) {
      if (cutscenePresentation === active) return;
      cutscenePresentation = active;
      for (const c of clones) c.model.root.setEnabled(!active && c.alive);
      for (const d of departures) d.model.root.setEnabled(!active);
      if (goldForm) goldForm.strength = active ? 0 : formBlend * .5;
      if (active && ctx.playerModel) ctx.playerModel.root.position.y = 0;
    },
    meditateWhileCommanding: true,
    setMeditating(active) { meditating=active && (ctx.hp??1)>0; },
    get burstActive() { return burstTime > 0; },
    get insightDisplay() { return {stacks:insight,seconds:insightTime,duration:has('lasting_insight')?14:10,damage:insight*(has('deep_insight')?30:25),speed:insight*7.5,meditating,regular:regulars().length,mature:regulars().filter(c=>c.experience>=(has('lessons_learned')?6:12)).length,silver:clones.filter(c=>c.alive&&c.soldier).length,armySeconds:burstTime}; },
    get burstLabel() { return burstTime>0?`ARMY ${burstTime.toFixed(1)}s`:undefined; },
    get status() { return `${regulars().length}/${cap()} CLONES | ${clones.filter(c=>c.alive&&c.soldier).length} SILVER | INSIGHT ${insight.toFixed(1)}${meditating?' | MEDITATING':''}`; },
    specialName: 'Manifestation / Return', burstName: 'White Procession', affiliation: 'PILGRIM', accent: GOLD,
    reloadSound: WEAPON_RELOAD.smg, icons: { weapon: 'halo', special: 'clone', dash: 'dash' },
    async prepare() {
      // Radius-specific navigation grids were previously built by the first clone that moved.
      ctx.targets.navigation.beginFrame();
      ctx.targets.navigation.prepare([.4]);
      await ctx.vfx.prepare();
      const index = await loadChibiIndex();
      // Keep the equipped model: only its pose, height and light change.
      if(ctx.playerModel){
        goldForm=new GoldForm(ctx.playerModel);meditation=new MeditationPose(ctx.playerModel);
        await Promise.all(ctx.playerModel.meshes.map(mesh=>mesh.material?.forceCompilationAsync(mesh)));
      }
      // A bounded pool avoids asynchronous summons and late arrivals after a run ends.
      for (let i = 0; i < 20; i++) {
        const model = await Chibi.load(ctx.scene, index.variants[variant], 'head', 'body');
        if (disposed) { model.dispose(); return; }
        model.root.setEnabled(false);
        for (const mesh of model.meshes) mesh.visibility = .65;
        cloneGold.set(model,new GoldForm(model,true));
        const rig = new TwinStickRig(model, undefined, 'head', true);
        rig.prepare();
        rigs.set(model, rig);
        // The translucent, skinned material variant must be ready before the model is enabled.
        await Promise.all(model.meshes.map(mesh => mesh.material?.forceCompilationAsync(mesh)));
        if (disposed) { rig.dispose(); rigs.delete(model); model.dispose(); return; }
        pool.push(model);
      }
      // Material compilation alone does not upload the skin buffers or start RuntimeAnimations.
      // Exercise both the moving shot and resting pose beneath the loading screen.
      try {
        for (const model of pool) {
          model.root.position.copyFrom(ctx.playerPosition);
          // These meshes always enter the active list, so an offscreen draw still warms them.
          // Keep the pool out of view if a co-op teammate is prepared during a live scene.
          model.root.position.y -= 1000;
          model.root.setEnabled(true);
          rigs.get(model)!.update(.016, { moveX: 0, moveZ: 1, speed: 510 * PX, aimYaw: 0, posture: 'shot' });
        }
        ctx.scene.render();
        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
        if (disposed) return;
        for (const model of pool) {
          rigs.get(model)!.update(.25, { moveX: 0, moveZ: 0, speed: 0, aimYaw: 0, posture: 'relaxed' });
        }
        ctx.scene.render();
        await ctx.scene.whenReadyAsync();
      } finally {
        for (const model of pool) model.root.setEnabled(false);
      }
      ready = !disposed;
    },
    fire(_muzzle, _aim) {
      interruptMeditation();
      // Her floating ring is behind her. Launch at chest height ahead of her body.
      const at = ctx.playerPosition.add(new Vector3(Math.sin(ctx.aimYaw ?? 0) * .45, .7, Math.cos(ctx.aimYaw ?? 0) * .45));
      const yaw = ctx.aimYaw ?? 0;
      for (const side of [-1, 1]) {
        const hand = at.add(new Vector3(Math.cos(yaw) * .15 * side, 0, -Math.sin(yaw) * .15 * side));
        launch(hand, hand.add(new Vector3(Math.sin(yaw) * 10, 0, Math.cos(yaw) * 10)), false);
      }
      ctx.sound(WEAPON_FIRE.smg, at);
    },
    useSpecial() {
      if(!ready)return false;
      holding=true;heldTime=0;holdUsed=false;returnRepeat=0;return true;
    },
    cancelSpecial() { holding=false;heldTime=0;holdUsed=false; },
    chargeSpecial(dt,held,released) {
      if(!holding)return;
      if(held){
        heldTime+=dt;returnRepeat-=dt;
        if(heldTime>=.35 && returnRepeat<=0){holdUsed=true;returnWeakest();returnRepeat=.55;}
      }
      if(released || !held){if(!holdUsed)manifest();holding=false;heldTime=0;}
    },
    special: () => ({ charges: ready ? charges : 0, maxCharges: 3, progress: charges===3?1:1-cooldown/recharge(), charge: holding?Math.min(1,heldTime/.35):null,
      available: ready && (charges>0 || clones.some(c=>c.alive)), label: holding?'Return':'Summon',
      hint: 'Tap RMB: summon or reposition at cap. Hold RMB: absorb weakest clone.' }),
    useBurst() {
      if(burstTime>0 || !ready || disposed)return;
      ctx.sound(SFX.nayutaBurst,ctx.playerPosition);
      burstTime=has('endless_procession')?12:8;
      const offset=(ctx.aimPoint??ctx.playerPosition.add(new Vector3(Math.sin(ctx.aimYaw??0)*8,0,Math.cos(ctx.aimYaw??0)*8))).subtract(ctx.playerPosition);
      offset.y=0;if(offset.length()>12)offset.normalize().scaleInPlace(12);
      const destination=ctx.playerPosition.add(offset);
      for(let i=0;i<8;i++)summon(true,has('sacred_assembly')?undefined:destination.clone());
      ctx.vfx.ring(ctx.playerPosition,SILVER,.5,4,.6);
      if(has('unshaken'))ctx.resist?.(.25,burstTime);
    },
    update(dt) {
      if(disposed)return;
      if((ctx.hp??1)<=0){effects.clear();meditationEffects.clear();meditating=false;burstTime=insight=insightTime=0;holding=false;weapon.cooldown=.08;formBlend=0;}
      effects.update(dt);
      for(const gold of cloneGold.values())gold.time+=dt;
      for(let i=departures.length-1;i>=0;i--){
        const d=departures[i];d.age+=dt;const t=Math.min(1,d.age/.3),gold=cloneGold.get(d.model);
        if(gold)gold.strength=Math.min(1,t*3);
        for(const mesh of d.model.meshes)mesh.visibility=.65*(1-t*t);
        if(t>=1){d.model.root.setEnabled(false);pool.push(d.model);departures.splice(i,1);}
      }
      formBlend+=(Number(meditating)-formBlend)*Math.min(1,dt*4);
      if(goldForm){goldForm.time+=dt;goldForm.strength=formBlend*.5;}
      meditationEffects.update(dt,meditating);
      if(charges<3){cooldown-=dt*(meditating?(has('deep_stillness')?2:1.5):1);while(cooldown<=0 && charges<3){charges++;cooldown+=recharge();}if(charges===3)cooldown=0;}
      if(insight>=3)questEvent('insight-time',meditating?dt:Math.min(dt,insightTime));
      insightTime=Math.max(0,insightTime-(meditating?0:dt));if(insightTime===0)insight=0;
      focusTime=Math.max(0,focusTime-dt);if(!focus?.alive || focusTime===0)focus=undefined;
      const wasBurst=burstTime>0;burstTime=Math.max(0,burstTime-dt);
      if(wasBurst && burstTime===0){
        for(const c of [...clones])if(c.soldier)retire(c);
        if(has('return_to_many')){summon();summon();}
      }
      weapon.moveSpeed=510*PX*(1+insight*.075);
      if(formation && Vector3.DistanceSquared(formation,ctx.playerPosition)>144)formation=undefined;
      volleyTime-=dt;
      if(has('united_volley')&&focus&&volleyTime<=0){
        volleyTime=3;
        for(const c of regulars())if(clear(c.position,focus.position)){
          launch(c.position.add(new Vector3(0,.7,0)),focus.position.add(new Vector3(0,.7,0)),true,false,4);
          ctx.vfx.flashSprite(c.position.add(new Vector3(0,1,0)),GOLD,.8,.3,.9,'star');
        }
      }
      for (const c of [...clones]) {
        c.life -= dt; if (!c.alive || c.life <= 0 || (ctx.hp ?? 1) <= 0) { retire(c); continue; }
        let target: Target | undefined, distance = 12 * 12;
        for (const t of ctx.targets.targets) if (t.alive) {
          const d = Vector3.DistanceSquared(c.position, t.position);
          if (d < distance && clear(c.position, t.position)) { target = t; distance = d; }
        }
        if(focus && Vector3.DistanceSquared(c.position,focus.position)<144 && clear(c.position,focus.position)){target=focus;distance=Vector3.DistanceSquared(c.position,focus.position);}
        const wasMature=c.experience>=(has('lessons_learned')?6:12);
        if(target&&!c.soldier)c.experience=Math.min(12,c.experience+dt*(meditating?2:1));
        const mature=!c.soldier&&c.experience>=(has('lessons_learned')?6:12);
        const gold=cloneGold.get(c.model);if(gold)gold.strength=mature?.55:0;
        if(mature&&!wasMature){ctx.vfx.ring(c.position,GOLD,.4,1.6,.6);ctx.vfx.flashSprite(c.position.add(new Vector3(0,2,0)),GOLD,.7,.7,1,'star');}
        const previous = c.position.clone();
        const anchor = c.soldier?(c.destination??ctx.playerPosition):(formation ?? ctx.playerPosition);
        const index = clones.indexOf(c), angle = index * Math.PI*2/Math.max(1,clones.length);
        const advancing=c.soldier&&!!c.destination;
        const escort=c.soldier&&has('sacred_assembly');
        const goal = c.soldier
          ? (!escort&&!advancing&&target&&distance>36?target.position:anchor).add(c.formationOffset)
          : target && distance > 16 && !formation ? target.position : anchor.add(new Vector3(Math.sin(angle)*1.8,0,Math.cos(angle)*1.8));
        if (Vector3.DistanceSquared(c.position, goal) > (advancing?.3:target && !formation ? 4 : .3)) c.agent.step(c, goal, 510 * PX*(advancing?1.35:1)*(has('shared_insight')?1+insight*.075:1), dt, clones);
        if(advancing&&has('white_procession'))for(const enemy of ctx.targets.targets){
          if(!enemy.alive||c.charged.has(enemy))continue;
          const delta=c.position.subtract(previous),length=delta.lengthSquared();
          const t=length>0?Math.max(0,Math.min(1,Vector3.Dot(enemy.position.subtract(previous),delta)/length)):0;
          const nearest=Vector3.Lerp(previous,c.position,t);nearest.y=enemy.position.y;
          if(Vector3.DistanceSquared(nearest,enemy.position)>(enemy.radius+.7)**2||!clear(previous,enemy.position))continue;
          if(ctx.targets.shieldContact(previous.add(new Vector3(0,.7,0)),enemy.position.add(new Vector3(0,.7,0))))continue;
          c.charged.add(enemy);ctx.run.damage(enemy,8*(1+insight*(has('deep_insight')?.3:.25)),'burst');
          if(enemy.alive&&enemy.combatTier!=='boss')enemy.stunned=Math.max(enemy.stunned,.35);
        }
        if(advancing && Vector3.DistanceSquared(c.position,goal)<2)c.destination=undefined;
        c.motion.copyFrom(c.position.subtract(previous).scale(1 / Math.max(dt, .001)));
        const aim = target?.position ?? goal;
        c.timer -= dt;
        const firing = !!target && c.timer <= 0;
        const speed = c.motion.length();
        c.rig.update(dt, {
          moveX: speed > .05 ? c.motion.x / speed : 0,
          moveZ: speed > .05 ? c.motion.z / speed : 0,
          speed, aimYaw: Math.atan2(aim.x - c.position.x, aim.z - c.position.z),
          posture: firing ? 'shot' : target ? 'aim' : 'relaxed',
        });
        if (firing) {
          c.timer = has('coordinated_volley') && target===focus ? .15 : .2;
          const yaw = Math.atan2(aim.x - c.position.x, aim.z - c.position.z);
          // Same forward and lateral hand offsets as Nayuta; one hand per shot.
          const hand = c.position.add(new Vector3(
            Math.sin(yaw) * .45 + Math.cos(yaw) * .15 * c.nextHand,
            .7,
            Math.cos(yaw) * .45 - Math.sin(yaw) * .15 * c.nextHand,
          ));
          launch(hand, target!.position.add(new Vector3(0,.7,0)), true,c.soldier);
          c.nextHand *= -1;
        }
      }
      for (let i = shots.length - 1; i >= 0; i--) {
        const shot = shots[i], next = shot.at.add(shot.direction.scale(900 * PX * dt));
        const cover = ctx.targets.navigation.traceCover(shot.at, next), shield = ctx.targets.shieldContact(shot.at, next);
        let contact = Math.min(cover ?? Infinity, shield?.t ?? Infinity), victim: Target | undefined;
        for (const t of ctx.targets.targets) if (t.alive) { const d = targetContact(shot.at, next, t); if (d !== null && d < contact) { contact = d; victim = t; } }
        const end = contact <= 1 ? Vector3.Lerp(shot.at, next, contact) : next;
        shot.visual.draw(end);
        shot.life -= dt;
        if (contact <= 1) nirvanaImpact(ctx.vfx, end, shot.direction, shot.clone);
        if (victim) {
          hit(victim, shot);
        } else if (shield && shield.t === contact) shield.shield.block(end, shot.damage * ctx.run.growth);
        if (contact <= 1 || shot.life <= 0) { shot.visual.stop(); shots.splice(i, 1); } else shot.at.copyFrom(next);
      }
    },
  };
}
