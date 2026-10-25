import { Mesh, Quaternion, TransformNode, Vector3, type Scene, type StandardMaterial } from '@babylonjs/core';

export { ELEVATOR_YAW, SHAFT_HALF_WIDTH } from './elevator-footprint';
export const LIFT_TOWER_HEIGHT = 20;

type Box = (name:string,w:number,h:number,d:number,x:number,y:number,z:number,mat:StandardMaterial,parent?:TransformNode)=>Mesh;
type Cylinder = (name:string,r:number,length:number,x:number,y:number,z:number,mat:StandardMaterial,parent?:TransformNode,axis?:string,sides?:number)=>Mesh;
interface TowerKit {
  scene:Scene;root:TransformNode;platform:TransformNode;gates:TransformNode[];seals:TransformNode[];box:Box;cylinder:Cylinder;
  shaftBands:StandardMaterial[];
  materials:{steel:StandardMaterial;dark:StandardMaterial;trim:StandardMaterial;service:StandardMaterial;deck:StandardMaterial;ochre:StandardMaterial;concrete:StandardMaterial;black:StandardMaterial;bolts:StandardMaterial;hazard:StandardMaterial;foliage:StandardMaterial;cyan:StandardMaterial;amber:StandardMaterial};
}

/** S06: tall rear lattice, enclosed striped sides, open front, cyan lower sill and perimeter. */
export function buildLiftTower({scene,root,platform,gates,seals,box,cylinder,shaftBands,materials:m}:TowerKit):void {
  root.metadata={asset:'restored-lift-tower',reference:'S06-boarding',height:LIFT_TOWER_HEIGHT,deckSize:6};
  const beam=(name:string,a:Vector3,b:Vector3,width:number,depth:number,mat=m.trim,parent=root)=>{
    const delta=b.subtract(a),mesh=box(name,width,delta.length(),depth,(a.x+b.x)/2,(a.y+b.y)/2,(a.z+b.z)/2,mat,parent);
    mesh.rotationQuaternion=Quaternion.FromUnitVectorsToRef(Vector3.Up(),delta.normalize(),new Quaternion());return mesh;
  };
  const bolt=(x:number,y:number,z:number,parent=platform,axis='z')=>cylinder('hex-bolt',.038,.027,x,y,z,m.bolts,parent,axis,6);
  const beacon=(x:number,z:number,parent=platform,y=1.96)=>{
    box('beacon-foot',.34,.12,.34,x,y-.19,z,m.dark,parent);
    cylinder('amber-lens',.11,.25,x,y,z,m.amber,parent);
    cylinder('lamp-bottom',.15,.06,x,y-.14,z,m.ochre,parent);
    cylinder('lamp-cap',.15,.06,x,y+.15,z,m.trim,parent);
    for(const dx of [-.12,.12])for(const dz of [-.12,.12])cylinder('lamp-guard',.012,.29,x+dx,y,z+dz,m.dark,parent);
  };
  // Deck centered precisely at local/world origin. Shaft and static tower remain fixed during travel.
  box('shaft-bottom',7.1,.2,7.1,0,-13.5,0,m.black,root);
  for(const s of [-1,1]){
    for(let level=0;level<9;level++){
      const y=-.75-level*1.5,lining=shaftBands[level];
      for(let panel=0;panel<4;panel++){
        const along=(panel-1.5)*1.8;
        box('shaft-lining',.2,1.49,1.79,s*3.6,y,along,lining,root);
        box('shaft-end-lining',1.79,1.49,.2,along,y,s*3.6,lining,root);
      }
      box('shaft-reinforcement',.08,.09,7,s*3.47,-level*1.5-.08,0,lining,root);
      box('shaft-end-reinforcement',7,.09,.08,0,-level*1.5-.08,s*3.47,lining,root);
    }
    box('foundation',.36,.23,7.5,s*3.68,-.055,0,m.steel,root);
    box('threshold-foundation',7,.23,.36,0,-.055,s*3.68,m.steel,root);
    for(const z of [-2.2,2.2])box('shaft-track',.12,13,.14,s*3.43,-6.5,z,m.trim,root);
    // Heavy shutters park below the surrounding ground and slide across only after clearance.
    const seal=new TransformNode(`elevator-blast-door-${s}`,scene);seal.parent=root;seals.push(seal);
    box('blast-armor',3.5,.3,7,s*1.75,-.36,0,m.steel,seal);
    for(let z=0;z<4;z++)box('blast-panel',3.3,.025,1.65,s*1.75,-.195,(z-1.5)*1.7,m.deck,seal);
    for(const z of [-3.4,-1.7,0,1.7,3.4])box('blast-rib',3.42,.045,.1,s*1.75,-.22,z,m.trim,seal);
    box('blast-center-lock',.08,.07,6.8,s*.05,-.22,0,m.ochre,seal);
  }
  box('platform-underframe',6,.29,6,0,-.16,0,m.dark);
  // Large smooth plates, as in S06; retain a quiet center so the hero and effects remain readable.
  for(let x=0;x<4;x++)for(let z=0;z<4;z++){
    const px=(x-1.5)*1.31,pz=(z-1.5)*1.31;
    box('floor-plate',1.28,.06,1.28,px,-.005,pz,m.deck);
    for(const sx of [-1,1])for(const sz of [-1,1])cylinder('deck-fastener',.022,.012,px+sx*.57,.031,pz+sz*.57,m.bolts,platform,'y',6);
  }
  for(const s of [-1,1]){
    box('side-sill',.34,.26,6,s*2.9,.12,0,m.dark);
    box('steel-edge',.16,.08,5.7,s*2.68,.04,0,m.trim);
    // Broad yellow-black panels are the main visual read, not small decorative stripes.
    box('side-wall-frame',.24,1.53,4.99,s*2.96,.99,.05,m.dark);
    for(let i=0;i<2;i++){
      const z=-1.24+i*2.52;
      box('side-hazard-inner',.025,1.26,2.32,s*2.818,.98,z,m.hazard);
      box('side-hazard-outer',.025,1.26,2.32,s*3.102,.98,z,m.hazard);
      box('side-frame-top',.34,.14,2.48,s*2.95,1.77,z,m.trim);
      box('side-frame-bottom',.32,.17,2.48,s*2.95,.25,z,m.steel);
      for(const dz of [-1.11,1.11])for(const y of [.4,1.52])bolt(s*2.78,y,z+dz,platform,'x');
    }
    for(const z of [-2.63,0,2.63]){
      box('wall-upright',.45,1.91,.26,s*2.92,.98,z,m.steel);
      box('upright-inset',.05,1.46,.13,s*2.67,.99,z,m.dark);
      box('upright-highlight',.035,1.49,.04,s*2.635,.99,z-.075,m.ochre);
      box('post-foot',.61,.26,.49,s*2.9,.16,z,m.dark);
      box('post-collar',.5,.1,.34,s*2.91,1.72,z,m.trim);
      cylinder('piston',.065,1.12,s*3.19,.8,z,m.black);
      cylinder('piston-rod',.03,.55,s*3.19,1.48,z,m.bolts);
      for(const y of [.3,1.15])cylinder('piston-bracket',.09,.06,s*3.19,y,z,m.ochre);
      if(z!==0)beacon(s*2.92,z);
    }
    box('side-edge-light',.035,.07,4.94,s*3.15,.15,0,m.cyan);
    for(let i=0;i<12;i++)box('deck-safety',.43,.018,.29,(i-5.5)*.435,.047,s*2.64,m.hazard);
  }
  // Front is open in S06. Hinged leaves fold against the side walls without wide projecting wings.
  for(const s of [-1,1]){
    const gate=new TransformNode(`elevator-gate-${s}`,scene);gate.parent=platform;gates.push(gate);
    box('front-gate-frame',2.61,1.59,.18,s*1.31,.89,-2.86,m.dark,gate);
    box('front-gate-hazard',2.39,1.27,.025,s*1.31,.91,-2.967,m.hazard,gate);
    box('front-gate-back',2.39,1.27,.025,s*1.31,.91,-2.75,m.hazard,gate);
    box('front-gate-cap',2.63,.12,.26,s*1.31,1.73,-2.86,m.trim,gate);
    box('front-gate-shoe',2.63,.14,.26,s*1.31,.14,-2.86,m.steel,gate);
    for(const x of [.06,2.55])box('front-gate-edge',.1,1.62,.27,s*x,.91,-2.86,m.steel,gate);
    box('front-gate-light',.06,.7,.035,s*.14,.89,-3.015,m.cyan,gate);
    for(const x of [.3,2.3])cylinder('front-gate-roller',.08,.14,s*x,.05,-2.86,m.black,gate,'z');
  }
  box('front-light-housing',5.55,.19,.13,0,-.04,-3.04,m.dark);
  box('front-cyan-strip',4.4,.07,.035,0,-.02,-3.12,m.cyan);
  for(const x of [-2.55,2.55])box('front-square-light',.28,.1,.045,x,-.01,-3.12,m.cyan);
  // Rear cage below the tower: vertical bars, diagonal reinforcement and a recessed cyan slot.
  box('rear-cage-base',5.68,.18,.3,0,.13,2.84,m.steel);
  box('rear-cage-top',5.65,.16,.26,0,1.83,2.84,m.trim);
  for(let i=0;i<19;i++)box('rear-cage-bar',.075,1.55,.13,(i-9)*.29,.99,2.84,m.trim);
  beam('rear-cage-brace',new Vector3(-2.5,.28,2.75),new Vector3(-.4,1.73,2.75),.1,.08,m.steel,platform);
  beam('rear-cage-brace',new Vector3(.4,1.73,2.75),new Vector3(2.5,.28,2.75),.1,.08,m.steel,platform);
  box('rear-cyan-sill',1.3,.055,.04,0,.29,2.60,m.cyan);
  const mast=new TransformNode('elevator-fixed-mast',scene);mast.parent=root;
  // Twenty metre lattice mast: full silhouette, not a billboard or truncated prop.
  const front=3.05,back=5.7,left=-1.95,right=1.95;
  for(const x of [left,right])for(const z of [front,back]){
    box('tower-foundation',.95,.48,.94,x,.16,z,m.concrete,mast);
    box('tower-base-plate',.79,.13,.79,x,.46,z,m.steel,mast);
    // I-section beams: dark web plus two visibly separate flanges.
    box('tower-column-web',.17,LIFT_TOWER_HEIGHT,.35,x,LIFT_TOWER_HEIGHT/2+.5,z,m.dark,mast);
    for(const dz of [-.2,.2])box('tower-column-flange',.4,LIFT_TOWER_HEIGHT,.085,x,LIFT_TOWER_HEIGHT/2+.5,z+dz,m.steel,mast);
    box('tower-column-rust-trim',.055,LIFT_TOWER_HEIGHT,.035,x+.21,LIFT_TOWER_HEIGHT/2+.5,z-.2,m.ochre,mast);
    for(let y=.7;y<LIFT_TOWER_HEIGHT;y+=3.2){
      box('tower-splice',.49,.57,.07,x,y,z-.26,m.trim,mast);
      for(const dx of [-.15,.15])for(const dy of [-.19,.19])bolt(x+dx,y+dy,z-.3,mast);
    }
  }
  for(let i=0;i<6;i++){
    const y=.65+i*3.2;
    for(const z of [front,back]){
      box('tower-crossbeam',4.28,.25,.26,0,y,z,m.steel,mast);
      // Alternating diagonal bracing leaves large openings into the shaft.
      const s=i%2?1:-1;
      beam('tower-diagonal',new Vector3(s*1.75,y+.18,z),new Vector3(-s*1.75,y+3.04,z),.18,.12,m.trim,mast);
      box('tower-beam-edge',4.2,.055,.33,0,y+.13,z,m.ochre,mast);
    }
    for(const x of [left,right]){
      box('tower-side-crossbeam',.27,.24,2.78,x,y,4.38,m.steel,mast);
      beam('tower-side-diagonal',new Vector3(x,y+.18,front+.16),new Vector3(x,y+3.04,back-.16),.16,.13,m.trim,mast);
    }
    for(const x of [-1.18,1.18]){
      box('tower-light-channel',.2,2.94,.17,x,y+1.61,3.48,m.dark,mast);
      box('tower-cyan-bar',.075,2.72,.035,x,y+1.61,3.375,m.cyan,mast);
    }
  }
  // Lift machinery remains visible through the lattice.
  for(const x of [-.55,.55]){
    cylinder('hoist-cable',.035,19.6,x,10.1,4.32,m.black,mast);
    cylinder('hoist-pulley',.43,.18,x,19.5,4.32,m.trim,mast,'x',24);
    box('hoist-guide',.16,19.5,.14,x,10.15,4.65,m.trim,mast);
  }
  box('counterweight',1.23,2.5,.51,0,8.5,4.9,m.dark,mast);
  for(let i=0;i<7;i++)box('counterweight-stack',1.32,.18,.58,0,7.45+i*.32,4.9,m.steel,mast);
  box('tower-crown',4.6,.39,3.1,0,20.6,4.38,m.steel,mast);
  for(const z of [3.2,5.5])box('crown-rail',4.5,.12,.14,0,21.3,z,m.trim,mast);
  for(const x of [-2.1,0,2.1])for(const z of [3.2,5.5])box('crown-post',.1,.7,.1,x,20.95,z,m.trim,mast);
  beacon(0,4.35,mast,21.55);
  // Access ladder along the outside of the mast.
  for(const z of [4.05,4.65])cylinder('ladder-rail',.035,19.6,2.3,10.3,z,m.trim,mast);
  for(let y=.6;y<20;y+=.36)cylinder('ladder-rung',.025,.64,2.3,y,4.35,m.trim,mast,'z');
  // Thin climbing ivy on the outer mast, leaving the mechanical core and cyan rails visible.
  for(let i=0;i<84;i++){
    const y=.6+i*.19,x=2.22+Math.sin(i*.58)*.16,z=3.02+Math.cos(i*.39)*.09;
    if(i>0)beam('ivy-stem',new Vector3(x,y,z),new Vector3(2.22+Math.sin((i-1)*.58)*.16,y-.19,3.02+Math.cos((i-1)*.39)*.09),.018,.018,m.foliage,mast);
    for(const side of [-1,1]){
      const leaf=cylinder('ivy-leaf',.09+(i%3)*.025,.018,x+side*.13,y+.06,z-.04,m.foliage,mast,'z',5);
      leaf.scaling.z=1.45;leaf.rotation.y=side*.4;leaf.rotation.z=i*.71;
    }
  }
  // Segmented search/boarding ring, slightly raised so it cannot z-fight with the floor.
  for(let i=0;i<112;i++){
    const a=i*Math.PI*2/112,r=5.4;
    const segment=box('perimeter-light',.19,.035,.075,Math.sin(a)*r,.065,Math.cos(a)*r,m.cyan,root);
    segment.rotation.y=a;
  }
  // Side control panel matches the recessed cyan displays of the official NIKKE elevator.
  box('control-console',.32,.62,.46,2.59,1.12,2.38,m.dark);
  box('control-screen',.025,.3,.28,2.41,1.24,2.38,m.cyan);
  for(const z of [2.27,2.39,2.51])cylinder('control-button',.027,.025,2.4,.95,z,m.ochre,platform,'x');
}

