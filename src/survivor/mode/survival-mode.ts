import { awardRoundCore } from '../../frontend/profile/RoundRewards';
import { recordSurvivalRound } from '../../frontend/profile/SurvivalStats';
import { applyAchievementProgress } from '../../frontend/profile/AchievementProgress';
import type { ArrivalElevator } from '../arrival-elevator';
import { ELEVATOR_DEPTH } from '../elevator-motion';
import { EnemyAttackPacing } from '../enemy-attack';
import type { Target } from '../targets';
import { Horde } from './horde';
import { pickSpawnPoint, type Point } from './director';
import { seededRandom } from './rng';
import { raptureSpec } from './roster';
import { returnToArk, type SortieModeInit } from './sortie-mode';
import { SupplyLift } from './supply-lift';
import { TelegraphLayer, groundHeight } from './telegraph';
import { SurvivalRound, ROUND_MAX_LEVEL, ROUND_CORE_REWARD, ROUND_SECONDS, FINAL_BOSS, HORDE_UNLOCKS, SPECIALIST_UNLOCKS, HEAVY_SCHEDULE, SPECIALIST_SHARE,
  roundXpToNext, spawnRate, aliveCap, hpScale, catchUp } from './survival-round';
import './survival-mode.css';

const TYPES=[...HORDE_UNLOCKS.map(u=>u.key),...SPECIALIST_UNLOCKS.map(u=>u.key),...HEAVY_SCHEDULE.map(u=>u.key),FINAL_BOSS];
const clock=(seconds:number)=>`${Math.floor(seconds/60).toString().padStart(2,'0')}:${Math.floor(seconds%60).toString().padStart(2,'0')}`;

/** Round-local XP/ranks and a single persistent reward. WAVE: ten minutes then Obelisk; ENDLESS: no end. */
export class SurvivalMode {
  readonly round:SurvivalRound;
  readonly roundId=crypto.randomUUID();
  private readonly objective=document.createElement('div');
  private readonly bossHud=document.createElement('div');
  private readonly notice=document.createElement('div');
  private readonly random=seededRandom(Date.now()&0xffffff);
  private boss:Target|null=null;
  private bossPending=false;
  /** heavies waiting for a clear spawn point */
  private readonly heavyQueue:string[]=[];
  private spawnBudget=0;
  /** every minute: a health crate and a squad of mass-produced NIKKEs by lift */
  private readonly supply:SupplyLift;
  private hudIn=0;
  private noticeFor=0;
  private previousLevel=1;
  private previousWave=0;
  private openedGates=false;
  private result:HTMLDivElement|null=null;
  private saved=false;
  /** ENDLESS: an Obelisk has been defeated (the run's core is earned) */
  private coreEarned=false;
  private readonly previousKill:SortieModeInit['run']['onKill'];

  private constructor(private readonly init:SortieModeInit, private readonly elevator:ArrivalElevator,
    private readonly horde:Horde, private readonly tells:TelegraphLayer, private readonly pacing:EnemyAttackPacing, endless:boolean){
    this.round=new SurvivalRound(endless);
    document.body.classList.add('survival-round');
    const {run,player,field,camera,scene}=init;
    run.experienceCurve=roundXpToNext;run.maxLevel=ROUND_MAX_LEVEL;
    run.skillPoints=0;run.level=1;run.xp=0;run.burst=0;run.time=0;run.tiers?.reset();
    field.setMovement('pursue');
    player.position.copyFrom(elevator.root.position);player.transported=true;player.setTransportPose(elevator.isVault?0:-ELEVATOR_DEPTH,true);
    elevator.motion.height=-ELEVATOR_DEPTH;elevator.motion.gateOpen=0;elevator.motion.seal=1;
    elevator.command('rise');elevator.update(0);camera.snap(player.position);
    this.supply=new SupplyLift(init,elevator,tells,text=>this.banner(text),this.random);
    this.objective.className='survival-objective';this.bossHud.className='survival-boss';this.notice.className='survival-notice';
    this.notice.setAttribute('role','status');this.notice.setAttribute('aria-live','polite');
    document.getElementById('hud')!.append(this.objective,this.bossHud,this.notice);
    this.previousKill=run.onKill;
    run.onKill=target=>{
      this.previousKill?.(target);
      if(this.round.endless&&target.type.id===raptureSpec(FINAL_BOSS).model&&!this.coreEarned){
        this.coreEarned=true;this.saved=awardRoundCore(this.roundId);
        this.banner(this.saved?'OBELISK DEFEATED · Rapture Core earned · keep going':'OBELISK DEFEATED · core not saved — storage unavailable');
      }
      if(target.combatTier==='heavy'){run.gainXp(360);player.hp=Math.min(player.maxHp,player.hp+player.maxHp*.3);this.banner('Heavy defeated · bonus XP + healing');}
    };
    this.drawHud();
  }
  static async create(init:SortieModeInit,elevator:ArrivalElevator,endless=false):Promise<SurvivalMode>{
    const tells=new TelegraphLayer(init.scene, groundHeight(init.snow)), pacing=new EnemyAttackPacing();
    const horde=new Horde(init.field,{player:init.player,field:init.field,run:init.run,vfx:init.vfx,tells,pacing,snow:init.snow,arenaRadius:init.arenaRadius});
    await horde.load(TYPES);
    const mode=new SurvivalMode(init,elevator,horde,tells,pacing,endless);
    // The supply squad's models load behind the loading screen, never mid-round.
    await mode.supply.preload();
    return mode;
  }
  get ended():boolean{return this.round.ended;}
  get alive():number{return this.horde.counts().total;}
  get arriving():boolean{return this.round.phase==='arrival';}
  abandon():void{if(!this.ended){this.round.abandon();this.finish();}}
  /** A short status line under the clock: slides in, holds `seconds`, fades out (survival-mode.css). */
  private banner(text:string,seconds=3):void{
    this.notice.textContent=text;this.noticeFor=seconds;
    this.notice.classList.remove('show');void this.notice.offsetWidth;this.notice.classList.add('show');
  }

  update(dt:number):void{
    if(this.ended||dt<=0)return;
    const {player,run}=this.init;
    if(this.arriving){
      const lift=this.elevator.state;
      player.position.x=this.elevator.root.position.x;player.position.z=this.elevator.root.position.z;
      // Face the gates (−Z) for the ride up, so she steps straight out when they open.
      player.rig.legYaw=Math.PI;
      player.setTransportPose(this.elevator.transportHeight,this.elevator.transportHidden);
      if(this.elevator.isVault&&lift.gateOpen>0)this.openedGates=true;
      if(lift.height>=-.001&&lift.action==='idle'&&!this.openedGates){this.elevator.command('open');this.openedGates=true;}
      if(this.openedGates&&lift.gateOpen>=.999&&lift.action==='idle'){
        player.setTransportPose(0,false);player.transported=false;this.round.start();
        this.banner(this.round.endless?'ENDLESS · survive as long as you can':`Survive ${ROUND_SECONDS/60} minutes · defeat the final boss`);
      }
      this.drawHud();return;
    }
    this.pacing.update(dt);this.horde.update(dt);
    const events=this.round.update(dt,player.hp,!!this.boss&&!this.boss.alive);
    if(this.ended){this.finish();return;}
    if(events.boss&&this.round.endless){
      // ENDLESS: Obelisk crashes in on top of the horde.
      this.bossPending=true;
      this.banner(this.coreEarned?'OBELISK INCOMING':'OBELISK INCOMING · defeat it to earn a Rapture Core');
    }else if(events.boss){
      this.horde.clear();this.heavyQueue.length=0;this.spawnBudget=0;this.bossPending=true;
      this.banner('OBELISK INCOMING · defeat it to earn a Rapture Core');
    }
    if(events.heavy){this.heavyQueue.push(events.heavy);this.banner(`${raptureSpec(events.heavy).name.toUpperCase()} INCOMING · heavy Rapture`);}
    if(events.unlocked.length)this.banner(`New Raptures: ${events.unlocked.map(k=>raptureSpec(k).name).join(', ')}`);
    if(this.bossPending&&this.spawnHidden(FINAL_BOSS,this.round.endless?2*Math.max(1,this.round.cycle):2))this.bossPending=false;
    if(this.heavyQueue.length&&this.spawnHidden(this.heavyQueue[0],hpScale(this.round.elapsed)))this.heavyQueue.shift();
    if(this.round.phase==='survive'){
      const elapsed=this.round.elapsed;
      // Steer XP toward the round's pace so the last talent arrives in the last waves.
      run.xpScale=catchUp(run.level,run.xp/Math.max(1,run.xpToNext),elapsed);
      this.spawnBudget=Math.min(6,this.spawnBudget+dt*spawnRate(elapsed));
      for(let i=0;i<4&&this.spawnBudget>=1&&this.alive<aliveCap(elapsed);i++){
        const key=this.pickType();
        if(!key){this.spawnBudget-=1;continue;}
        if(!this.spawnHidden(key,hpScale(elapsed)))break;
        this.spawnBudget-=1;
      }
      if(this.previousWave!==this.round.waveIndex){this.previousWave=this.round.waveIndex;if(!events.unlocked.length)this.banner(this.round.wave.name);}
    }else run.xpScale=1;
    this.supply.update(dt,this.round.elapsed,this.round.phase==='survive'||this.round.phase==='boss');
    if(run.level>this.previousLevel){
      // A level that unlocks a talent tier gets the picker's big notice; the rest get a brief line.
      const unlocked=run.tiers?.tiers.some(t=>t.level>this.previousLevel&&t.level<=run.level);
      this.previousLevel=run.level;
      if(run.tiers){if(!unlocked)this.banner(`Level ${run.level}`,1.8);}
      else this.banner(run.skillPoints>0?`LEVEL ${run.level} · ${run.skillPoints} SP available · Tab to upgrade`:'All talent ranks unlocked');
    }
    // Fade out, keeping the text until the transition ends.
    if(this.noticeFor>0&&(this.noticeFor-=dt)<=0)this.notice.classList.remove('show');
    this.tells.update(player.kit.freezesEnemies ? 0 : dt);this.hudIn-=dt;
    if(this.hudIn<=0){this.drawHud();this.hudIn=.15;}
  }

  /** A specialist now and then (within its per-type cap), else a weighted pick from the basic horde. */
  private pickType():string|null{
    const byType=this.horde.counts().byType;
    const room=(key:string)=>{const cap=raptureSpec(key).cap;return cap===0||(byType.get(key)??0)<cap;};
    const specialists=this.round.specialists.filter(u=>room(u.key));
    if(specialists.length&&this.random()<SPECIALIST_SHARE)return specialists[Math.floor(this.random()*specialists.length)].key;
    const horde=this.round.horde;
    let roll=this.random()*horde.reduce((sum,u)=>sum+u.weight,0);
    for(const u of horde){roll-=u.weight;if(roll<=0)return u.key;}
    return horde[0]?.key??null;
  }

  private valid(at:Point,radius:number):boolean{
    return Math.hypot(at.x,at.z)<this.init.arenaRadius-radius-1&&this.init.field.navigation.clear(at,at,radius);
  }
  /**
   * Whether any part of a body of `radius` and `height` at `at` would be on screen, using the real
   * camera projection (any zoom, angle or window shape), with a margin so nothing pops in at an edge.
   */
  private onScreen(at:Point,radius:number,height:number):boolean{
    const engine=this.init.scene.getEngine(),scale=engine.getHardwareScalingLevel();
    const width=engine.getRenderWidth()*scale,tall=engine.getRenderHeight()*scale,margin=60;
    for(const [dx,dz] of [[0,0],[radius,0],[-radius,0],[0,radius],[0,-radius]])
      for(const y of [0,height]){
        const p=this.init.toScreen(at.x+dx,y,at.z+dz);
        if(p.visible&&p.x>-margin&&p.x<width+margin&&p.y>-margin&&p.y<tall+margin)return true;
      }
    return false;
  }
  /** Somewhere walkable the player can't see, or null (the spawn waits for the next frame). */
  private spawnPoint(key:string):Point|null{
    const {radius,height}=raptureSpec(key);
    const hidden=(p:Point)=>this.valid(p,radius)&&!this.onScreen(p,radius,height);
    const {player,camera}=this.init;
    const scale=camera.distance/18;
    const near=pickSpawnPoint(this.random,player.position,hidden,{halfWidth:15.6*scale,ahead:13.5*scale,behind:4.6*scale},16,30,32);
    if(near)return near;
    // Zoomed out, the ring near the player can all be in view: try anywhere in the arena off screen.
    for(let i=0;i<48;i++){
      const angle=this.random()*Math.PI*2,r=Math.sqrt(this.random())*(this.init.arenaRadius-radius-1);
      const p={x:Math.sin(angle)*r,z:Math.cos(angle)*r};
      if(Math.hypot(p.x-player.position.x,p.z-player.position.z)>=13&&hidden(p))return p;
    }
    return null;
  }
  /** Spawn now, out of sight; no warning circle. False when no hidden spot was found. */
  private spawnHidden(key:string,scale:number):boolean{
    const at=this.spawnPoint(key);
    if(!at)return false;
    const enemy=this.horde.spawn(key,at.x,at.z,scale);
    if(key===FINAL_BOSS)this.boss=enemy;
    return true;
  }
  private drawHud():void{
    const {run}=this.init;
    const phase=this.round.phase;
    const squad=this.supply.count,lift=Math.ceil(this.supply.nextIn);
    const supplies=` · Lift ${lift>0?`${Math.floor(lift/60)}:${String(lift%60).padStart(2,'0')}`:'opening'}${squad?` · Squad ${squad}`:''}${this.supply.crateWaiting?' · Crate on lift':''}`;
    const mode=this.round.endless?'ENDLESS':'WAVE';
    const status=phase==='arrival'?(this.elevator.isVault?'Opening mountain vault':'Deploying by elevator'):phase==='boss'?'Defeat Obelisk':this.round.endless?`Survived ${clock(this.round.elapsed)}`:`Survive · ${clock(this.round.remaining)} remaining`;
    this.objective.innerHTML=`<b>${mode}</b>${status}<small>${phase==='arrival'?'Basic abilities ready · talents reset each round':`${this.round.wave.name}${supplies}`}</small><small>${run.tiers?run.tiers.pending(run.level)>=0?'Talent ready · press 1 / 2 / 3':'Earn XP by defeating Raptures':run.skillPoints>0?`${run.skillPoints} SP · Tab to advance your talent trees`:run.talents.pointsToMax===0?'All talent ranks unlocked':'Earn XP by defeating Raptures'}</small>`;
    this.bossHud.hidden=!this.boss?.alive;
    if(this.boss?.alive)this.bossHud.innerHTML=`OBELISK · ${Math.ceil(this.boss.hp)} / ${this.boss.maxHp}<progress aria-label="Obelisk health" max="${this.boss.maxHp}" value="${this.boss.hp}"></progress>`;
  }
  private finish():void{
    if(this.result)return;
    const {player,run}=this.init;
    player.cancelCharges();player.transported=true;
    const endless=this.round.endless;
    const won=this.round.phase==='victory'||(endless&&this.coreEarned);
    if(won&&!endless)this.saved=awardRoundCore(this.roundId);
    const record=recordSurvivalRound({roundId:this.roundId,characterId:this.init.characterId,endless,won,
      bossDefeated:won||this.coreEarned,kills:run.kills,level:run.level,seconds:this.round.elapsed});
    if(record.counted)applyAchievementProgress({characterId:this.init.characterId,characterKills:run.kills,operatorWin:won,
      additions:{totalKills:run.kills,bossVictories:won||this.coreEarned?1:0,characterWins:won?1:0}});
    const best=record.stats,bests=new Set(record.newBests);
    const personal=!record.saved?'Stats not saved — storage unavailable'
      :endless?`${bests.has('endless')?'NEW BEST · ':''}Best run ${clock(best.bestEndlessSeconds)} · ${best.rounds} rounds played`
      :`${bests.has('win')?'NEW FASTEST WIN · ':''}${best.wins} / ${best.rounds} rounds won${best.fastestWinSeconds?` · fastest ${clock(best.fastestWinSeconds)}`:''}${bests.has('kills')?' · new kill record':''}`;
    this.bossHud.hidden=true;this.notice.classList.remove('show');
    this.result=document.createElement('div');this.result.className='survival-results';
    this.result.setAttribute('role','dialog');this.result.setAttribute('aria-label','Round results');
    this.result.innerHTML=`<section><h1>${endless?'RUN ENDED':won?'ROUND COMPLETE':'ROUND ENDED'}</h1><p>${clock(this.round.elapsed)} · ${run.kills} Raptures defeated · Level ${run.level}</p><p>${run.tiers?run.tiers.tiers.map((_,i)=>run.tiers!.choice(i)?.name).filter(Boolean).join(' · ')||'No talents chosen':`Weapon ${run.talents.abilityRank('attack')}/5 · Special ${run.talents.abilityRank('skill')}/5 · Burst ${run.talents.abilityRank('burst')}/5`}</p><p class="survival-personal">${personal}</p><div class="core-reward" data-reward></div><small>Level, XP and talent ranks reset next round.<br>Character unlocks, skins and banked cores stay yours.</small><div data-actions><button data-retry>New round</button><button data-shop>Core Exchange</button><button data-ark>Return to Ark</button></div></section>`;
    document.getElementById('hud')!.append(this.result);
    this.result.querySelector('[data-retry]')!.addEventListener('click',()=>location.reload());
    this.result.querySelector('[data-shop]')!.addEventListener('click',()=>location.assign(`${location.pathname}?preview=shop`));
    this.result.querySelector('[data-ark]')!.addEventListener('click',returnToArk);
    const renderReward=()=>{
      this.result!.querySelector('[data-reward]')!.textContent=won?(this.saved?`+${ROUND_CORE_REWARD} Rapture Core · saved`:'Core not saved — storage unavailable'):endless?'No core earned · defeat an Obelisk to earn one':'No core earned · defeat the final boss to earn one';
    };
    if(won&&!this.saved){
      const retry=document.createElement('button');retry.textContent='Retry reward save';
      retry.onclick=()=>{this.saved=awardRoundCore(this.roundId);renderReward();if(this.saved)retry.remove();};
      this.result.querySelector('[data-actions]')!.prepend(retry);
    }
    renderReward();(this.result.querySelector('button') as HTMLButtonElement).focus();
  }
  dispose():void{
    this.init.run.onKill=this.previousKill;this.init.run.xpScale=1;this.horde.dispose();this.tells.dispose();
    this.supply.dispose();
    this.objective.remove();this.bossHud.remove();this.notice.remove();this.result?.remove();
    document.body.classList.remove('survival-round');
  }
}
