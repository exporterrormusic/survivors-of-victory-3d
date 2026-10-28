import { FrozenVault, vaultObstacles } from './frozen-vault';
import { Color3, DynamicTexture, Mesh, MeshBuilder, StandardMaterial, Texture, TransformNode, Vector3, VertexData, type GlowLayer, type Scene, type ShadowGenerator } from '@babylonjs/core';

import { buildLiftTower, ELEVATOR_YAW } from './lift-tower-geometry';

/** Open gates swing 270° out around the front corners and fold flat against the outside of the side walls. */
const GATE_SWING = Math.PI * 1.5;
/** how far the hinge slides outward as a gate folds, so it lies outside the side wall (outer face ≈ 3.05 m) */
const GATE_OUT = .55;
const gateAngle = (open: number) => open * GATE_SWING;
const gateShift = (open: number) => { const t = Math.max(0, Math.min(1, (open - .5) / .5)); return GATE_OUT * t * t * (3 - 2 * t); };

import type { SceneryObstacle } from './range-collision';
import { ElevatorMotion, type ElevatorAction } from './elevator-motion';
export type { ElevatorAction } from './elevator-motion';

/** Flat-faced chamfered steel, with actual bevels catching the sun at gameplay scale. */
function armorMesh(name: string, w: number, h: number, d: number, scene: Scene): Mesh {
  const half=[w/2,h/2,d/2], b=Math.min(.065,Math.min(w,h,d)*.18);
  const positions:number[]=[],normals:number[]=[],uvs:number[]=[],indices:number[]=[];
  const face=(points:number[][],normal:number[])=>{
    const a=Vector3.FromArray(points[1]).subtract(Vector3.FromArray(points[0]));
    const c=Vector3.FromArray(points[2]).subtract(Vector3.FromArray(points[0]));
    // Babylon's left-handed front-face winding is clockwise against the outward normal.
    if(Vector3.Dot(Vector3.Cross(a,c),Vector3.FromArray(normal))>0)points.reverse();
    const first=positions.length/3;
    const dominant=normal.map(Math.abs).indexOf(Math.max(...normal.map(Math.abs)));
    const axes=[0,1,2].filter(i=>i!==dominant);
    for(const p of points){positions.push(...p);normals.push(...normal);uvs.push(p[axes[0]]/(2*half[axes[0]])+.5,p[axes[1]]/(2*half[axes[1]])+.5);}
    for(let i=1;i<points.length-1;i++)indices.push(first,first+i,first+i+1);
  };
  for(let axis=0;axis<3;axis++)for(const sign of [-1,1]) {
    const other=[0,1,2].filter(i=>i!==axis),normal=[0,0,0];normal[axis]=sign;
    face([[-1,-1],[1,-1],[1,1],[-1,1]].map(s=>{const p=[0,0,0];p[axis]=sign*half[axis];other.forEach((j,k)=>p[j]=s[k]*(half[j]-b));return p;}),normal);
  }
  for(let axis=0;axis<3;axis++)for(const s of [-1,1])for(const t of [-1,1]) {
    const [a,c]=[0,1,2].filter(i=>i!==axis),normal=[0,0,0];normal[a]=s/Math.SQRT2;normal[c]=t/Math.SQRT2;
    const p=(end:number,swap:boolean)=>{const v=[0,0,0];v[axis]=end*(half[axis]-b);v[a]=s*(half[a]-(swap?b:0));v[c]=t*(half[c]-(swap?0:b));return v;};
    face([p(-1,false),p(1,false),p(1,true),p(-1,true)],normal);
  }
  for(const x of [-1,1])for(const y of [-1,1])for(const z of [-1,1]) {
    const s=[x,y,z];face([0,1,2].map(axis=>half.map((v,i)=>s[i]*(v-(i===axis?0:b)))),s.map(v=>v/Math.sqrt(3)));
  }
  const mesh=new Mesh(name,scene),data=new VertexData();data.positions=positions;data.normals=normals;data.uvs=uvs;data.indices=indices;data.applyToMesh(mesh);return mesh;
}

/** Reusable 6 m Ark lift. Moving groups retain their pivots; static detail is batched by material. */
export class ArrivalElevator {
  readonly root: TransformNode;
  readonly platform: TransformNode;
  readonly gates: TransformNode[] = [];
  readonly seals: TransformNode[] = [];
  readonly motion = new ElevatorMotion();
  onCommand?: (action: ElevatorAction) => void;
  private readonly materials: StandardMaterial[] = [];
  private readonly textures: Texture[] = [];
  private readonly amber: StandardMaterial;
  private readonly cyan: StandardMaterial;
  private panel?: HTMLElement;
  private status?: HTMLElement;
  private time = 0;
  private towerScale=1;
  private vault:FrozenVault|null=null;
  private vaultMode=false;
  private vaultOpenAfterRise=false;
  get isVault():boolean{return this.vaultMode;}
  get transportHeight():number{return this.vaultMode?0:this.motion.height;}
  get transportHidden():boolean{return this.vaultMode?this.motion.gateOpen<.02:this.motion.seal>=.999;}
  setVault(enabled:boolean):void{
    this.vaultMode=enabled;
    if(enabled&&!this.vault){
      const texture=new Texture(`${import.meta.env.BASE_URL}environment/frozen-kit-v1/material-atlas.png`,this.scene);this.textures.push(texture);
      this.vault=new FrozenVault(this.scene,this.root,texture);
      for(const mesh of this.vault.root.getChildMeshes())this.shadows.addShadowCaster(mesh);
    }
    for(const child of this.root.getChildren())child.setEnabled(child===this.vault?.root?enabled:!enabled);
    this.pose();this.updatePanel();
  }
  private vaultCollision(closed:boolean):SceneryObstacle[]{return vaultObstacles(closed).map(o=>({...o,x:o.x+this.root.position.x,z:o.z+this.root.position.z}));}
  private updatePanel():void{
    if(!this.panel)return;
    this.panel.querySelector('h3')!.textContent=this.vaultMode?'Mountain vault':'Restored lift tower';
    this.panel.querySelector('p')!.textContent=this.vaultMode?'Rock entrance ? rolling blast door ? ground-level chamber':'Arrival deck ? lift tower';
    const labels=this.vaultMode?['Open vault','Close vault','Extract & seal','Reopen vault','Preview supply cycle']:['Open gates','Close gates','Extract & seal','Unseal & raise','Preview full cycle'];
    this.panel.querySelectorAll('button').forEach((b,i)=>b.textContent=labels[i]);
  }

  setTowerScale(scale:number):void{
    this.towerScale=scale;
    const mast=this.root.getChildTransformNodes(true).find(n=>n.name==='elevator-fixed-mast')!;
    mast.scaling.setAll(scale);
    // Shrink around the mast's footprint centre, keeping it behind the cage.
    mast.position.z=.95+4.38*(1-scale);
  }

  constructor(private readonly scene: Scene, private readonly shadows: ShadowGenerator, private readonly glow: GlowLayer) {
    this.root = new TransformNode('arrival-elevator', scene);
    this.platform = new TransformNode('elevator-platform', scene); this.platform.parent = this.root;
    const material = (name: string, color: string, painted = false) => {
      const m = new StandardMaterial(`elevator-${name}`, scene);
      m.metadata = { ...m.metadata, weatherWetness: false };
      m.diffuseColor = Color3.FromHexString(color); m.specularColor.set(.22, .24, .26); m.specularPower = 48;
      if (painted) {
        const tex = new DynamicTexture(`elevator-${name}-wear`, 512, scene, true);
        const c = tex.getContext(); c.fillStyle = '#c4c1b7'; c.fillRect(0, 0, 512, 512);
        let seed = 7241;
        const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
        for (let i = 0; i < 4200; i++) {
          const x = rnd()*512, y = rnd()*512;
          c.fillStyle = i % 4 ? `rgba(38,33,27,${.03+rnd()*.13})` : 'rgba(241,232,203,.22)';
          c.fillRect(x, y, .5+rnd()*5, .5+rnd()*1.7);
        }
        c.strokeStyle = '#77766e'; c.lineWidth = 4; c.strokeRect(3, 3, 506, 506);
        c.strokeStyle = '#e1d8bd'; c.lineWidth = 1; c.strokeRect(7, 7, 498, 498);
        for(let i=0;i<110;i++) {
          const x=rnd()*512,y=i%2?rnd()*18:494+rnd()*18;
          c.fillStyle=i%3?'#656967':'#957354';c.fillRect(x,y,3+rnd()*27,1+rnd()*4);
        }
        tex.update(); m.diffuseTexture = tex; this.textures.push(tex);
      }
      this.materials.push(m); return m;
    };
    const steel = material('steel', '#d1d3cf'), dark = material('recess', '#3a4750'), trim = material('edge', '#a4aaa8', true);
    const service = material('service-hatch', '#c2c6c2');
    const deck = material('deck', '#a7b1b8'), ochre = material('ochre', '#ac8243', true), concrete = material('foundation', '#6c716d', true);
    const black = material('rubber', '#2b363d'), bolts = material('fasteners', '#737f83');
    const foliage = material('ivy', '#415236');
    this.cyan = material('cyan', '#71eaff'); this.cyan.emissiveColor.set(.08, .95, 1.25);
    this.amber = material('amber', '#ffba48'); this.amber.emissiveColor.set(1.8, .65, .08);
    const hazard = material('hazard', '#ffffff');
    const stripe = new DynamicTexture('elevator-safety-stripes', { width: 512, height: 128 }, scene, true);
    const c = stripe.getContext(); c.fillStyle = '#bca34f'; c.fillRect(0, 0, 512, 128);
    c.fillStyle = '#263037';
    for (let x = -128; x < 640; x += 128) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x+64, 0); c.lineTo(x+192, 128); c.lineTo(x+128, 128); c.closePath(); c.fill(); }
    c.fillStyle = 'rgba(225,218,185,.25)'; for(let i=0;i<160;i++) c.fillRect((i*137)%512,(i*47)%128,13,1);
    stripe.update(); hazard.diffuseTexture = stripe; this.textures.push(stripe);
    const atlas=(mat:StandardMaterial,column:number,row:number)=>{
      const texture=new Texture(`${import.meta.env.BASE_URL}environment/arrival-elevator-v2/tower-atlas-v3.png`,scene);
      texture.uScale=texture.vScale=.486;texture.uOffset=column*.5+.007;texture.vOffset=(1-row)*.5+.007;
      texture.wrapU=texture.wrapV=Texture.CLAMP_ADDRESSMODE;texture.anisotropicFilteringLevel=8;
      mat.diffuseTexture=texture;mat.metadata={softEnvironment:true,weatherWetness:false};this.textures.push(texture);
    };
    atlas(steel,1,0);atlas(service,0,1);atlas(deck,0,0);atlas(hazard,1,1);atlas(trim,1,0);
    const deckTexture=new Texture(`${import.meta.env.BASE_URL}environment/arrival-elevator-v2/deck-steel-v4.png`,scene);
    deckTexture.anisotropicFilteringLevel=8;deck.diffuseTexture=deckTexture;deck.diffuseColor.set(.94,.91,.85);this.textures.push(deckTexture);
    const shaft=material('shaft-lining','#687477');
    const shaftTexture=new DynamicTexture('shaft-panel-texture',{width:512,height:512},scene,true);
    const sc=shaftTexture.getContext();sc.fillStyle='#798081';sc.fillRect(0,0,512,512);
    let noise=42;const rand=()=>{noise=(noise*1664525+1013904223)>>>0;return noise/4294967296;};
    for(let i=0;i<6000;i++){sc.fillStyle=`rgba(20,25,28,${rand()*.25})`;sc.fillRect(rand()*512,rand()*512,1+rand()*3,2+rand()*18);}
    sc.strokeStyle='#293439';sc.lineWidth=5;sc.strokeRect(3,3,506,506);
    sc.strokeStyle='#929693';sc.lineWidth=2;sc.strokeRect(9,9,494,494);
    for(const x of [20,492])for(const y of [20,492]){sc.fillStyle='#303c41';sc.fillRect(x-3,y-3,6,6);}
    shaftTexture.update();shaft.diffuseTexture=shaftTexture;shaft.specularColor.setAll(.03);shaft.metadata={anime:false,weatherWetness:false};this.textures.push(shaftTexture);
    const shaftBands=Array.from({length:9},(_,i)=>{const mat=material(`shaft-depth-${i}`,'#687477');mat.diffuseTexture=shaftTexture;mat.metadata={anime:false,weatherWetness:false};mat.specularColor.setAll(.03);mat.diffuseColor.scaleInPlace(.72*Math.pow(.76,i));mat.ambientColor.setAll(0);return mat;});
    // Painted structure uses the Anime look's soft scenery shading (no posterized bands); the shaft
    // interior and the cyan/amber lamps keep their own colors.
    trim.metadata={softEnvironment:true,weatherWetness:false};
    this.cyan.disableLighting=true;this.amber.disableLighting=true;
    this.cyan.metadata={anime:false,weatherWetness:false};this.amber.metadata={anime:false,weatherWetness:false};
    this.cyan.specularColor.setAll(0);this.amber.specularColor.setAll(0);
    const groups = new Map<TransformNode, Map<StandardMaterial, Mesh[]>>();
    const box = (name: string, w: number, h: number, d: number, x: number, y: number, z: number, mat: StandardMaterial, parent = this.platform) => {
      const mesh = Math.min(w,h,d)>.07?armorMesh(`lift-${name}`,w,h,d,scene):MeshBuilder.CreateBox(`lift-${name}`, { width:w, height:h, depth:d }, scene);
      mesh.position.set(x,y,z); mesh.parent=parent; mesh.material=mat; mesh.isPickable=false; mesh.receiveShadows=true;
      let byMat=groups.get(parent); if(!byMat) groups.set(parent,byMat=new Map());
      const parts=byMat.get(mat)??[];parts.push(mesh);byMat.set(mat,parts);return mesh;
    };
    const cylinder=(name:string,r:number,length:number,x:number,y:number,z:number,mat:StandardMaterial,parent=this.platform,axis='y',sides=12)=>{
      const mesh=MeshBuilder.CreateCylinder(`lift-${name}`,{diameter:r*2,height:length,tessellation:sides},scene);
      mesh.position.set(x,y,z);if(axis==='z')mesh.rotation.x=Math.PI/2;if(axis==='x')mesh.rotation.z=Math.PI/2;
      mesh.parent=parent;mesh.material=mat;
      let byMat=groups.get(parent);if(!byMat)groups.set(parent,byMat=new Map());const parts=byMat.get(mat)??[];parts.push(mesh);byMat.set(mat,parts);return mesh;
    };
    buildLiftTower({scene,root:this.root,platform:this.platform,gates:this.gates,seals:this.seals,box,cylinder,shaftBands,materials:{steel,dark,trim,service,deck,ochre,concrete,black,bolts,hazard,foliage,cyan:this.cyan,amber:this.amber}});
    // Merge per material AND moving group, preserving animation pivots.
    for(const [parent,byMat] of groups)for(const [mat,parts] of byMat) {
      const merged=Mesh.MergeMeshes(parts,true,true)!;merged.name=`elevator-${parent.name}-${mat.name}`;merged.parent=parent;
      merged.isPickable=false;merged.receiveShadows=true;
      merged.metadata={...merged.metadata,cameraOcclusionDisabled:parent.name!=='elevator-fixed-mast',occlusionGroup:parent.uniqueId};
      // The 20 m mast would shade much of the play area, so only the platform, cage and gates cast.
      if(mat!==this.cyan&&mat!==this.amber&&parent.name!=='elevator-fixed-mast')shadows.addShadowCaster(merged);
    }
    this.gates.forEach((gate,i)=>gate.setPivotPoint(new Vector3((i===0?-1:1)*2.62,0,-2.86)));
    this.root.getChildTransformNodes(true).find(n=>n.name==='elevator-fixed-mast')!.position.z=.95;
    this.root.rotation.y=ELEVATOR_YAW;
    this.setTowerScale(.5);
    this.pose();
  }

  /** Capsules share the same navigation and swept projectile tests as range cover. */
  /**
   * The whole footprint as one solid block (deck, gates and shaft), plus the tower legs: used while
   * the lift is moving, so its collision changes twice per cycle instead of with every gate swing
   * (each change rebuilds the navigation grids, ~60 ms per unit size).
   */
  sealedObstacles(): SceneryObstacle[] {
    if(this.vaultMode)return this.vaultCollision(true);
    const out: SceneryObstacle[] = [];
    for (let x = -3.2; x <= 3.2; x += .4) for (let z = -3.2; z <= 3.2; z += .4) out.push({ x, z, r: .3, height: 2 });
    for (const x of [-1.95, 1.95]) for (const z of [4, 6.65]) {
      const sx=x*this.towerScale,sz=5.33+(z-5.33)*this.towerScale;
      out.push({x:Math.cos(ELEVATOR_YAW)*sx+Math.sin(ELEVATOR_YAW)*sz,z:-Math.sin(ELEVATOR_YAW)*sx+Math.cos(ELEVATOR_YAW)*sz,r:.48*this.towerScale,height:20*this.towerScale});
    }
    return out.map(o=>({...o,x:o.x+this.root.position.x,z:o.z+this.root.position.z}));
  }

  /** Collision of the cage at the top with its gates open, whatever it's doing now. */
  restingObstacles(): SceneryObstacle[] {
    const { height, gateOpen } = this.motion;
    this.motion.height = 0; this.motion.gateOpen = 1;
    try { return this.collisionObstacles(); } finally { this.motion.height = height; this.motion.gateOpen = gateOpen; }
  }

  collisionObstacles(): SceneryObstacle[] {
    if(this.vaultMode)return this.vaultCollision(this.motion.gateOpen<.99);
    const out:SceneryObstacle[]=[];
    const add=(x:number,z:number,r:number,height:number)=>out.push({x:Math.cos(ELEVATOR_YAW)*x+Math.sin(ELEVATOR_YAW)*z,z:-Math.sin(ELEVATOR_YAW)*x+Math.cos(ELEVATOR_YAW)*z,r,height});
    const wall=(ax:number,az:number,bx:number,bz:number,r:number,height:number)=>{
      const n=Math.ceil(Math.hypot(bx-ax,bz-az)/.15);
      for(let i=0;i<=n;i++)add(ax+(bx-ax)*i/n,az+(bz-az)*i/n,r,height);
    };
    if(this.motion.height> -1.9){
      const h=Math.max(.1,1.9+this.motion.height);
      wall(-2.95,-2.7,-2.95,2.85,.2,h);wall(2.95,-2.7,2.95,2.85,.2,h);
      wall(-2.95,2.84,2.95,2.84,.16,h);
      const a=gateAngle(this.motion.gateOpen),hinge=2.62+gateShift(this.motion.gateOpen);
      // Gates swing out around the front corners, never through the deck or across the entry.
      for(const side of [-1,1])wall(side*hinge,-2.86,side*hinge-side*2.62*Math.cos(a),-2.86-2.62*Math.sin(a),.14,h);
    }
    // No actor may walk into the exposed shaft after the cage leaves the surface.
    if(this.motion.height<-.1)for(let x=-3.2;x<=3.2;x+=.4)for(let z=-3.2;z<=3.2;z+=.4)add(x,z,.3,0);
    for(const x of [-1.95,1.95])for(const z of [4,6.65])add(x*this.towerScale,5.33+(z-5.33)*this.towerScale,.48*this.towerScale,20*this.towerScale);
    return out.map(o=>({...o,x:o.x+this.root.position.x,z:o.z+this.root.position.z}));
  }

  /** Whether a world point stands on the deck (6 × 6 m), for camera framing. */
  onDeck(point: Vector3): boolean {
    const m=this.root.computeWorldMatrix(true).clone().invert();
    const local=Vector3.TransformCoordinates(point,m);
    return Math.abs(local.x)<3&&Math.abs(local.z)<3;
  }
  get state() { return { action:this.motion.phase, gateOpen:this.motion.gateOpen, height:this.motion.height, seal:this.motion.seal, cycling:this.motion.cycling, departing:this.motion.departing }; }
  /** While set (a cutscene owns the player), commands are ignored. */
  locked = false;
  command(action: ElevatorAction): void { if (this.locked) return; this.vaultOpenAfterRise=this.vaultMode&&action==='rise';this.motion.command(action); this.onCommand?.(action); }
  update(dt: number): void {
    this.time+=dt;this.motion.update(dt);
    if(this.vaultOpenAfterRise&&this.motion.phase==='idle'&&this.motion.height===0){this.vaultOpenAfterRise=false;this.motion.command('open');}
    const moving=this.motion.phase!=='idle'&&this.motion.phase!=='sealed';
    this.amber.emissiveColor.set(1,.25,.025).scaleInPlace(moving ? 1.4+2.6*Math.pow(Math.max(0,Math.sin(this.time*8)),4) : 2.2);
    this.pose();
    if(this.status)this.status.textContent=this.motion.phase==='sealed'?(this.vaultMode?'VAULT SEALED':'SHAFT SEALED'):this.motion.phase==='idle'?(this.motion.gateOpen>.99?'GATES OPEN':'GATES CLOSED'):this.motion.phase.toUpperCase();
  }
  private pose(): void {
    this.vault?.pose(this.motion.gateOpen);
    this.platform.position.y=this.motion.height;
    this.gates.forEach((g,i)=>{
      const side=i===0?-1:1;
      g.rotation.y=-side*gateAngle(this.motion.gateOpen);
      g.position.x=side*gateShift(this.motion.gateOpen);
    });
    this.seals.forEach((g,i)=>g.position.x=(i===0?-1:1)*(1-this.motion.seal)*3.55);
  }
  mount(): void {
    const body=document.querySelector('#weather-lab .weather-lab-body');if(!body)return;
    const panel=document.createElement('section');panel.className='elevator-controls';
    panel.innerHTML='<h3>Restored lift tower</h3><p>Center of range · 6 × 6 m deck · 20 m tower</p>';
    for(const [action,label] of [['open','Open gates'],['close','Close gates'],['descend','Extract & seal'],['rise','Unseal & raise'],['cycle','Preview full cycle']] as const) {
      const button=document.createElement('button');button.textContent=label;button.dataset.elevator=action;
      button.style.cssText='margin:3px;padding:5px 9px;color:#d7f4fa;background:#172832;border:1px solid #45616b;cursor:pointer';
      button.onclick=()=>this.command(action);panel.append(button);
    }
    this.status=document.createElement('p');panel.append(this.status);body.prepend(panel);this.panel=panel;this.updatePanel();
  }
  dispose(): void {
    for(const m of this.root.getChildMeshes()){this.glow.removeIncludedOnlyMesh(m as Mesh);this.shadows.removeShadowCaster(m);}
    this.vault?.dispose();this.root.dispose();this.materials.forEach(m=>m.dispose());this.textures.forEach(t=>t.dispose());this.panel?.remove();
  }
}



