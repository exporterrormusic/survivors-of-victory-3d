import { Color3, MeshBuilder, StandardMaterial, Vector3, type Mesh } from '@babylonjs/core';
import { EnemyAttackPacing } from '../enemy-attack';
import type { SceneryObstacle } from '../range-collision';
import type { Target } from '../targets';
import { Horde } from './horde';
import { TelegraphLayer, groundHeight } from './telegraph';
import { returnToArk, type SortieModeInit } from './sortie-mode';
import { RELAY_BLOCKS, RELAY_ROUTE, RelayRoute } from './relay-route';
import './relay-mode.css';

/** A finite, position-driven mission. No director, extraction, loot ledger or saved progress. */
export class RelayMode {
  readonly route = new RelayRoute();
  readonly obstacles: SceneryObstacle[] = [];
  private readonly meshes: Mesh[] = [];
  private readonly materials: StandardMaterial[] = [];
  private readonly panel = document.createElement('div');
  private readonly map = document.createElement('div');
  private result: HTMLDivElement | null = null;
  private boss: Target | null = null;
  private guards = false;
  private hudDelay = 0;
  private readonly marker: Mesh;
  private readonly healMarker: Mesh;
  private constructor(private readonly init: SortieModeInit, private readonly horde: Horde,
    private readonly tells: TelegraphLayer, private readonly pacing: EnemyAttackPacing) {
    document.body.classList.add('relay-run');
    const material = (name: string, color: string, emission = false) => {
      const m = new StandardMaterial(`relay-${name}`, init.scene);
      m.diffuseColor = Color3.FromHexString(color); m.specularColor.setAll(0);
      if (emission) m.emissiveColor = m.diffuseColor.scale(.6);
      this.materials.push(m); return m;
    };
    const concrete = material('concrete', '#858c91');
    const trim = material('trim', '#b3afa0');
    const cyan = material('signal', '#7be5e2', true);
    const green = material('medical', '#99e6ac', true);
    const asphalt = material('street', '#5f6c73');
    const box = (name: string, x: number, z: number, w: number, d: number, h: number, mat: StandardMaterial) => {
      const mesh = MeshBuilder.CreateBox(`relay-${name}`, { width:w, depth:d, height:h }, init.scene);
      mesh.position.set(x,h/2,z); mesh.material=mat; mesh.receiveShadows=true;
      mesh.metadata={cameraOccluder:true};
      init.shadows.addShadowCaster(mesh); this.meshes.push(mesh); return mesh;
    };
    // Filled collision footprints match the visible ruined blocks and prevent dash shortcuts.
    for (const [i,b] of RELAY_BLOCKS.entries()) {
      box(`block-${i}`,b.x,b.z,b.width,b.depth,3.6,concrete);
      for(let x=b.x-b.width/2+1;x<b.x+b.width/2;x+=2) for(let z=b.z-b.depth/2+1;z<b.z+b.depth/2;z+=2)
        this.obstacles.push({x,z,r:1.42,height:4.1});
      for(let x=b.x-b.width/2+2;x<b.x+b.width/2;x+=5) box('ruin-cap',x,b.z,3,5,4.1,trim);
    }
    const road = (points: readonly {x:number;z:number}[], paint:StandardMaterial, width:number) => {
      for(let i=1;i<points.length;i++){
        const a=points[i-1], b=points[i], length=Math.hypot(b.x-a.x,b.z-a.z);
        const lane=box('street',(a.x+b.x)/2,(a.z+b.z)/2,width,length,.035,asphalt);
        lane.rotation.y=Math.atan2(b.x-a.x,b.z-a.z);
        for(let d=2;d<length;d+=4){
          const mark=box('route-paint',a.x+(b.x-a.x)*d/length,a.z+(b.z-a.z)*d/length,.18,.8,.045,paint);
          mark.rotation.y=lane.rotation.y;
        }
      }
    };
    road([{x:0,z:-27},...RELAY_ROUTE],cyan,7);
    road([{x:0,z:-27},{x:-24,z:-23},{x:-22,z:-18},{x:14,z:-18},{x:21,z:-19}],green,4);
    // Physical arrival pad; no restoration or boarding interaction in this prototype.
    box('arrival-lift',0,-27,7,6,.18,trim);
    for(const x of [-3,3]) box('arrival-post',x,-29,.35,.35,3,concrete);
    box('relay-base',0,29,4,3,1,concrete);
    box('relay-mast',0,29,.65,.65,15,trim);
    box('relay-beacon',0,29,2,1,1,cyan).position.y=15;
    this.obstacles.push({x:0,z:29,r:2,height:15});
    const ring = (name:string, x:number,z:number,mat:StandardMaterial) => {
      const m=MeshBuilder.CreateTorus(name,{diameter:4,thickness:.12,tessellation:32},init.scene);
      m.position.set(x,.18,z);m.material=mat;this.meshes.push(m);return m;
    };
    this.marker=ring('relay-next-route',21,-19,cyan);
    this.healMarker=ring('relay-medical',-24,-23,green);
    box('medical-case',-24,-23,1.3,1,.65,green);
    init.field.navigation.setScenery(this.obstacles);
    init.field.setMovement('pursue');
    init.player.position.set(0,0,-27);init.camera.snap(init.player.position);
    init.run.burst=100; init.run.skillPoints=0;
    this.panel.className='relay-panel';this.map.className='relay-map';
    document.getElementById('hud')!.append(this.panel,this.map);
    this.spawnGroup(18,-22, ['lure','lure','crawler']);
    this.drawHud();
  }
  static async create(init:SortieModeInit):Promise<RelayMode> {
    const tells=new TelegraphLayer(init.scene, groundHeight(init.snow)), pacing=new EnemyAttackPacing();
    const horde=new Horde(init.field,{player:init.player,field:init.field,run:init.run,vfx:init.vfx,tells,pacing,snow:init.snow,arenaRadius:init.arenaRadius});
    await horde.load(['lure','crawler','pelican','capra','thermite']);
    return new RelayMode(init,horde,tells,pacing);
  }
  get ended() { return this.route.outcome!==null; }
  get alive() { return this.horde.counts().total; }
  abandon():void { if(!this.ended){this.route.outcome='defeat';this.finish();} }
  private spawnGroup(x:number,z:number,types:readonly string[]):void {
    types.forEach((key,i)=>this.horde.spawn(key,x+(i%3-1)*2.8,z+Math.floor(i/3)*2.8,2));
  }
  update(dt:number):void {
    if(this.ended || dt<=0)return;
    const {player}=this.init;
    this.pacing.update(dt);this.horde.update(dt);this.tells.update(dt);
    const advanced=this.route.update(player.position.x,player.position.z,player.hp,!!this.boss&&!this.boss.alive);
    if(this.ended){this.finish();return;}
    if(advanced){
      if(this.route.step===1)this.spawnGroup(22,-2,['crawler','pelican','lure','lure']);
      if(this.route.step===2)this.spawnGroup(-10,0,['capra','crawler','lure','pelican','lure']);
      if(this.route.step===3)this.spawnGroup(-20,20,['crawler','capra','pelican','lure']);
      if(this.route.step===4)this.spawnGroup(0,21,['crawler','crawler','lure']);
      if(this.route.atTower)this.boss=this.horde.spawn('thermite',8,24,3);
    }
    if(!this.guards&&Math.hypot(player.position.x+24,player.position.z+23)<13){
      this.guards=true;this.spawnGroup(-25,-19,['crawler','pelican','lure']);
    }
    player.hp+=this.route.heal(player.position.x,player.position.z,player.hp,player.maxHp);
    this.healMarker.setEnabled(!this.route.healingUsed);
    this.marker.position.x=this.route.destination.x;this.marker.position.z=this.route.destination.z;
    this.marker.setEnabled(!this.route.atTower);
    this.hudDelay-=dt;
    if(this.hudDelay<=0){this.drawHud();this.hudDelay=.1;}
  }
  private drawHud():void {
    const {player}=this.init;
    const goal=this.route.destination;
    this.panel.innerHTML=`<b>RELAY RUN</b>${this.route.atTower?'Defeat Hard Hat':`Reach the relay tower · ${goal.name}`}<small>${this.boss?`HARD HAT · ${Math.ceil(this.boss.hp)} / ${this.boss.maxHp} HP`:'Follow the cyan route. You can fight past enemies.'}</small><small>${this.route.healingUsed?'Courtyard healing collected':'Optional: green courtyard supplies restore health'}</small>`;
    const xy=(x:number,z:number)=>`${(x+34)*2},${(34-z)*2}`;
    this.map.innerHTML=`<svg viewBox="0 0 136 136" role="img" aria-label="Route map: cyan path to relay; green cross is optional healing"><polyline points="${[[0,-27],...RELAY_ROUTE.map(p=>[p.x,p.z])].map(p=>xy(p[0],p[1])).join(' ')}" fill="none" stroke="#80d4d7" stroke-width="2"/>${RELAY_BLOCKS.map(b=>`<rect x="${(b.x-b.width/2+34)*2}" y="${(34-b.z-b.depth/2)*2}" width="${b.width*2}" height="${b.depth*2}" fill="#6e777b"/>`).join('')}<text x="12" y="116" fill="${this.route.healingUsed?'#666':'#98f5a8'}" font-size="14">+</text><circle cx="68" cy="10" r="4" fill="#82eeee"/><circle cx="${(player.position.x+34)*2}" cy="${(34-player.position.z)*2}" r="3" fill="white"/></svg>`;
  }
  private finish():void {
    this.init.player.cancelCharges();
    this.init.player.transported=true; // Lock input behind the terminal results overlay.
    this.result=document.createElement('div');this.result.className='relay-result';
    this.result.innerHTML=`<section><h1>${this.route.outcome==='victory'?'RELAY SECURED':'MISSION FAILED'}</h1><p>${this.route.outcome==='victory'?'You reached the tower and defeated its defender.':'Try another approach through the streets.'}</p><p>${Math.floor(this.init.run.time/60)}:${String(Math.floor(this.init.run.time%60)).padStart(2,'0')} · ${this.init.run.kills} enemies defeated</p><small>Combat prototype · Progress is not saved.</small><div><button data-retry>Retry mission</button><button data-return>Return to Ark</button></div></section>`;
    document.getElementById('hud')!.append(this.result);
    this.result.querySelector('[data-retry]')!.addEventListener('click',()=>location.reload());
    this.result.querySelector('[data-return]')!.addEventListener('click',returnToArk);
    (this.result.querySelector('button') as HTMLButtonElement).focus();
  }
  dispose():void {
    this.horde.dispose();this.tells.dispose();this.panel.remove();this.map.remove();this.result?.remove();
    for(const m of this.meshes)m.dispose();for(const m of this.materials)m.dispose();
    document.body.classList.remove('relay-run');
  }
}
