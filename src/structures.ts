import { Color3, FresnelParameters, Mesh, MeshBuilder, Scene, StandardMaterial, Texture, TransformNode, Vector3 } from '@babylonjs/core';
import { StatusSet } from './abilities/status';
import type { StatusSpec } from './abilities/types';
import type { EnemyTarget, Team } from './enemy';
import type { World } from './world';
import { LANES, STRUCTURE_SITES, GATE_HALF_WIDTH, structureRadius, type StructureSite } from './battleground';
import { applyPaintover, paintBounds } from './paintover';

// Buildings cannot be stunned, charmed, healed or displaced by unit abilities.
class BuildingStatus extends StatusSet { override apply(_spec: StatusSpec): void {} }

export class Structure implements EnemyTarget {
  readonly position: Vector3;
  readonly life = 0;
  readonly status = new BuildingStatus();
  readonly radius: number;
  readonly barHeight: number;
  readonly maxHp: number;
  readonly name: string;
  readonly range: number;
  readonly damage: number;
  hp: number;
  renderActive = true;
  cooldown = .6;
  target: EnemyTarget | null = null;
  protectedBy = () => false;
  private flash = 0;
  private deathTime = 0;
  private readonly root: TransformNode;
  private readonly body: Mesh;
  private readonly head: Mesh;
  private readonly glowMesh: Mesh;
  private readonly shield: Mesh;
  private readonly rubble: Mesh;
  private readonly rangeRing: Mesh;
  private readonly glowMat: StandardMaterial;
  private readonly color: Color3;

  constructor(readonly site: StructureSite, scene: Scene, world: World, private readonly destroyed: (s: Structure) => void) {
    const core = site.kind === 'core', gate=site.kind==='gate', fortified=site.kind==='fort'||site.kind==='keep';
    const scale=core?.82:gate?1:site.kind==='keep'?.92:fortified?.8:.58;
    this.position = new Vector3(site.x, 0, site.z);
    this.radius = structureRadius(site.kind);
    this.barHeight = gate?3:core?7.5:fortified?6.2:4;
    this.maxHp = this.hp = core?6500:gate?650:site.kind==='keep'?3800:fortified?3000:site.tier==='inner'?1500:1200;
    this.range = gate?0:core?12:fortified?10:8.5;
    this.damage = gate?0:core?125:site.kind==='keep'?105:fortified?90:65;
    this.name = core ? (site.team === 'blue' ? 'Ark Reactor' : 'Rapture Core') : `${site.lane === 'mid' ? 'Mid' : site.lane === 'top' ? 'Top' : 'Bottom'} ${site.kind[0].toUpperCase()+site.kind.slice(1)}`;
    this.color = Color3.FromHexString(site.team === 'blue' ? '#58caff' : '#ff6558');
    this.root = new TransformNode(site.id, scene);
    this.root.position.copyFrom(this.position);
    this.root.scaling.setAll(scale);
    if(gate)this.root.rotation.y=site.yaw!;
    const metal = new StandardMaterial(`${site.id}-armor`, scene);
    metal.diffuseColor = Color3.FromHexString(site.team === 'blue' ? '#526b7b' : '#49393d');
    metal.diffuseTexture = new Texture(`${import.meta.env.BASE_URL}environment/ruin-concrete.webp`, scene);
    metal.specularColor.set(.25,.3,.35);
    const dark = new StandardMaterial(`${site.id}-chassis`, scene);
    dark.diffuseColor = Color3.FromHexString('#17232d'); dark.specularColor.set(.08,.1,.12);
    const concrete = new StandardMaterial(`${site.id}-concrete`, scene);
    concrete.diffuseTexture = new Texture(`${import.meta.env.BASE_URL}environment/ruin-concrete.webp`, scene);
    concrete.diffuseColor.set(.62,.68,.72); concrete.specularColor.set(0,0,0);
    this.glowMat = new StandardMaterial(`${site.id}-energy`, scene);
    this.glowMat.diffuseColor=Color3.Black();
    this.glowMat.emissiveColor = this.color.clone(); this.glowMat.disableLighting = true;
    const parts: Mesh[] = [], guns: Mesh[] = [], lights: Mesh[] = [], debris: Mesh[] = [];
    const part = (mesh: Mesh, mat: StandardMaterial, x: number, y: number, z: number, list = parts) => {
      mesh.position.set(x,y,z); mesh.material = mat; list.push(mesh); return mesh;
    };
    const box = (name: string, w: number, h: number, d: number, mat: StandardMaterial, x: number, y: number, z: number, list = parts) =>
      part(MeshBuilder.CreateBox(`${site.id}-${name}`, { width:w,height:h,depth:d }, scene), mat,x,y,z,list);
    const cyl = (name: string, bottom: number, top: number, height: number, y: number, mat: StandardMaterial, list = parts) =>
      part(MeshBuilder.CreateCylinder(`${site.id}-${name}`, { diameterBottom:bottom,diameterTop:top,height,tessellation:8 }, scene),mat,0,y,0,list);
    if(!gate) {
    cyl('foundation', core ? 10 : fortified?7:5, core ? 9 : fortified?6.5:4.4, .45, .18, concrete);
    cyl('plinth', core ? 7.8 : 4.6, core ? 6.8 : 3.5, .8, .7, dark);
    cyl('armor', core ? 6.3 : 3.3, core ? 4.6 : 2.6, core ? 2.2 : 2.4, core ? 1.8 : 2, metal);
    cyl('energy-band', core ? 6.4 : 3.4, core ? 6.4 : 3.4, .16, core ? 1.5 : 1.3, this.glowMat, lights);
    }
    if(gate) {
      box('threshold',GATE_HALF_WIDTH*2,.1,1,concrete,0,.06,0);
      box('gate-rail',GATE_HALF_WIDTH*2,.16,.3,dark,0,1.9,0,guns);
      const field=new StandardMaterial(`${site.id}-forcefield`,scene);
      field.diffuseColor=this.color;field.emissiveColor=this.color.scale(.3);field.alpha=.24;field.backFaceCulling=false;
      box('forcefield',GATE_HALF_WIDTH*2-1.8,1.7,.08,field,0,1,0,lights);
      for(const side of [-1,1])box('gate-emitter',.22,1.8,.3,this.glowMat,side*(GATE_HALF_WIDTH-.9),1,0,lights);
    } else if (core) {
      const crystal = part(MeshBuilder.CreatePolyhedron(`${site.id}-reactor`, { type:1,size:1.65 }, scene),this.glowMat,0,4.4,0,lights);
      crystal.scaling.y = 1.65;
      for (let i=0;i<4;i++) {
        const a = Math.PI/4+i*Math.PI/2, x=Math.sin(a)*2.8,z=Math.cos(a)*2.8;
        box('containment-pylon',1.1,5.2,1.1,metal,x,3.5,z).rotation.y=a;
        box('pylon-light',.22,3.1,.22,this.glowMat,x*.83,4,z*.83,lights);
        const fin=box('crown',1.5,.5,2, dark,x*.7,6.25,z*.7,guns); fin.rotation.y=a;
      }
      for (const y of [3.1,5.8]) part(MeshBuilder.CreateTorus(`${site.id}-containment-ring`,{diameter:5.7,thickness:.22,tessellation:32},scene),metal,0,y,0,guns);
    } else {
      if(fortified) {
        box('bunker',5.3,2.4,4.8,metal,0,1.5,0);
        box('roof',5.8,.5,5.3,dark,0,2.9,0);
        for(const side of [-1,1]) {
          box('armored-buttress',1,3.5,5,concrete,side*2.7,1.75,0);
          box('roof-beacon',.18,.18,3.2,this.glowMat,side*2.7,3.55,0,lights);
        }
        if(site.kind==='keep')for(const x of [-2,2])for(const z of [-2,2])box('keep-crown',.8,1.9,.8,metal,x,3.9,z);
      }
      cyl('turret-bearing',2.8,2.8,.45,3.4,dark);
      box('turret',2.8,1.25,2.5,metal,0,4.2,0,guns);
      box('visor',1.6,.3,.12,this.glowMat,0,4.4,1.28,guns);
      for (const side of [-1,1]) {
        box('gun-pod',.65,.9,1.9,dark,side*1.65,4.1,.2,guns);
        const barrel=part(MeshBuilder.CreateCylinder(`${site.id}-barrel`,{diameter:.32,height:2.6,tessellation:10},scene),dark,side*.65,4.1,2,guns); barrel.rotation.x=Math.PI/2;
        box('muzzle',.5,.5,.3,metal,side*.65,4.1,3.3,guns);
      }
      box('antenna',.12,1.1,.12,dark,-.8,5.3,-.6,guns);
    }
    for (let i=0;i<6;i++) {
      const a=i*Math.PI/3;
      const m=box('wreckage',core ? 2.1 : 1.3,.6,1.1,i%2?metal:dark,Math.sin(a)*this.radius,.45,Math.cos(a)*this.radius,debris);
      m.rotation.set(i*.25,a,.2);
    }
    const merge = (items: Mesh[], name: string) => {
      const mesh=Mesh.MergeMeshes(items,true,true,undefined,false,true)!;
      mesh.name=`${site.id}-${name}`; mesh.parent=this.root; mesh.isPickable=false; mesh.receiveShadows=true;
      world.shadows.addShadowCaster(mesh); return mesh;
    };
    this.body=merge(parts,'body'); this.head=merge(guns,'head'); this.glowMesh=merge(lights,'lights');
    if(!gate) {
      applyPaintover(this.body,core?'core':site.kind==='keep'?'keep':fortified?'fort':'tower');
      applyPaintover(this.head,core?'core':'turret');
    }
    if(!core&&!gate)this.head.rotation.y=site.yaw??0;
    this.rubble=merge(debris,'wreck'); this.rubble.setEnabled(false);
    applyPaintover(this.rubble,'wreck',{fit:paintBounds([this.rubble])});
    // Painted buildings no longer use their blockout materials; unused materials
    // still cost a scan of every mesh whenever lighting or grading changes.
    if(!gate)for(const unused of [metal,dark,concrete]){unused.diffuseTexture?.dispose();unused.dispose();}
    world.glow.addIncludedOnlyMesh(this.glowMesh);
    this.shield=MeshBuilder.CreateSphere(`${site.id}-shield`,{diameter:core?10:6.5,segments:12},scene);
    this.shield.parent=this.root; this.shield.position.y=core?3.2:2.5;
    const shieldMat=new StandardMaterial(`${site.id}-shield-mat`,scene);
    shieldMat.emissiveColor=this.color.scale(.6);shieldMat.diffuseColor=Color3.Black();shieldMat.disableLighting=true;shieldMat.alpha=.01;
    // StandardMaterial adds Fresnel opacity to alpha; keep the center transparent.
    shieldMat.opacityFresnelParameters=new FresnelParameters({leftColor:Color3.Black(),rightColor:new Color3(.22,.22,.22),bias:0,power:3});
    this.shield.material=shieldMat; this.shield.isPickable=false;
    this.rangeRing=MeshBuilder.CreateTorus(`${site.id}-range`,{diameter:this.range*2,thickness:.065,tessellation:64},scene);
    this.rangeRing.parent=this.root;this.rangeRing.scaling.setAll(1/scale);this.rangeRing.position.y=.08;this.rangeRing.material=this.glowMat;this.rangeRing.isPickable=false;this.rangeRing.setEnabled(false);
  }
  get team(): Team { return this.site.team; }
  get alive(): boolean { return this.hp>0; }
  get shielded(): boolean { return this.alive && this.protectedBy(); }
  heal(_amount: number): void {}
  takeDamage(amount: number): boolean {
    if (!this.alive || this.shielded || amount<=0) return false;
    this.hp=Math.max(0,this.hp-amount);this.flash=.12;
    if (this.alive) return false;
    this.target=null;this.shield.setEnabled(false);this.rangeRing.setEnabled(false);
    this.rubble.setEnabled(true);this.destroyed(this);return true;
  }
  showRange(show: boolean): void { this.rangeRing.setEnabled(show && this.alive); }
  updateVisual(dt: number): void {
    this.shield.setEnabled(this.shielded);
    this.flash=Math.max(0,this.flash-dt);
    this.glowMat.emissiveColor.copyFrom(this.color).scaleInPlace(this.flash>0?1.2:.45);
    if (!this.alive) {
      this.deathTime=Math.min(1,this.deathTime+dt);
      this.head.position.y=-this.deathTime*3;
      this.head.rotation.z=this.deathTime*.4;
      this.body.visibility=this.head.visibility=1-this.deathTime;
      this.glowMesh.setEnabled(false);
      if(this.deathTime===1){this.body.setEnabled(false);this.head.setEnabled(false);}
    } else if (this.site.kind!=='core' && this.target?.alive) this.head.rotation.y=Math.atan2(this.target.position.x-this.position.x,this.target.position.z-this.position.z);
  }
  /** World-space muzzle sockets use the same head transform as the visible gun barrels. */
  muzzles(): Vector3[] {
    if(this.site.kind==='core')return [this.position.add(new Vector3(0,4.4,0))];
    if(this.site.kind==='gate')return [];
    this.root.computeWorldMatrix(true);
    const matrix=this.head.computeWorldMatrix(true);
    return [-.65,.65].map(x=>Vector3.TransformCoordinates(new Vector3(x,4.1,3.48),matrix));
  }
  aimAt(target: EnemyTarget): void {
    if(this.site.kind!=='core'&&this.site.kind!=='gate')this.head.rotation.y=Math.atan2(target.position.x-this.position.x,target.position.z-this.position.z);
  }
}

export function createStructures(scene: Scene, world: World, destroyed: (s: Structure) => void): Structure[] {
  const structures=STRUCTURE_SITES.map(site=>new Structure(site,scene,world,destroyed));
  for(const s of structures) {
    if(s.site.kind==='core') s.protectedBy=()=>!LANES.some(lane=>structures.filter(t=>t.team===s.team&&t.site.lane===lane.id&&(t.site.kind==='fort'||t.site.kind==='keep')).every(t=>!t.alive));
  }
  return structures;
}
