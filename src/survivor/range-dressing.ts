import { createFrozenAsset, FrozenMaterials } from './frozen-kit';
import { OutskirtsGrass } from './outskirts-grass';
import { OutskirtsCrater } from './outskirts-crater';
import { isFrozenAsset } from './frozen-assets';
import { Color3, GlowLayer, Mesh, MeshBuilder, Quaternion, StandardMaterial, TransformNode, Vector3, type Scene, type ShadowGenerator } from '@babylonjs/core';
import { createEnvironmentProp } from '../environment-kit';
import { createSakuraTree } from '../sakura';
import { brokenPier } from '../environment';
import { RangeMaterials } from './range-materials';
import { createCityAsset } from './city-kit';
import { isCityAsset } from './city-layout';
import { CityDust } from './city-dust';
import { CityMaterials } from './city-materials';
import { createSakuraAsset, SakuraMaterials } from './sakura-kit';
import { isSakuraAsset } from './sakura-assets';
import { FROZEN_RADIUS } from './frozen-layout';
import { STORM_RADIUS } from './storm-field';
import { inThicket } from './storm-layout';
import { FOREST_RADIUS } from './forest-layout';
import { createForestAsset, ForestMaterials, isForestAsset } from './forest-kit';
import { createCalderaProp } from './caldera-art';
import { RANGE_ENVIRONMENTS, rangePlacements, type RangeEnvironment, type RangeProp } from './range-environments';

/** Switchable visual staging in the existing training arena. Static dressing is
 * merged in spatial groups; shared materials/templates survive theme switches. */
export class RangeDressing {
  theme:RangeEnvironment='plain';
  private root:TransformNode|null=null;
  private templates=new Map<string,TransformNode>();
  private materials=new Map<string,StandardMaterial>();
  private panel:HTMLElement|null=null;
  private select:HTMLSelectElement|null=null;
  private painter:RangeMaterials;
  private windTime=0;
  private dust:CityDust|null=null;
  private grass:OutskirtsGrass|null=null;
  private crater:OutskirtsCrater|null=null;
  private cityMaterials:CityMaterials;
  private frozenMaterials:FrozenMaterials|null=null;
  private sakuraMaterials:SakuraMaterials|null=null;
  private forestMaterials:ForestMaterials|null=null;
  private wind: {pivot:TransformNode;phase:number;amplitude:number}[]=[];
  private reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
  update(dt:number,_focus?:Vector3):void {
    this.crater?.setPaused(this.reducedMotion.matches||dt===0);
    this.grass?.update(dt,_focus,this.reducedMotion.matches);
    this.dust?.setPaused(this.reducedMotion.matches||dt===0);
    if(this.reducedMotion.matches)return;
    this.windTime+=dt;
    for(const item of this.wind){
      const t=this.windTime,p=item.phase,a=item.amplitude*(this.theme==='storm'?1.5:1);
      item.pivot.rotation.x=a*(Math.sin(t*.83+p)*.7+Math.sin(t*1.47+p*1.7)*.3);
      item.pivot.rotation.z=a*(Math.sin(t*.67+p+1.2)*.7+Math.sin(t*1.19+p*.8)*.3);
    }
  }
  constructor(private scene:Scene,private shadows:ShadowGenerator){this.painter=new RangeMaterials(scene);this.cityMaterials=new CityMaterials(scene);}
  private mat(name:string,hex:string):StandardMaterial {
    let m=this.materials.get(name);if(m)return m;
    m=new StandardMaterial(`range-${name}`,this.scene);m.diffuseColor=Color3.FromHexString(hex);m.specularColor.set(0,0,0);
    this.materials.set(name,m);return m;
  }
  private landmark(asset:RangeProp,theme:RangeEnvironment):TransformNode {
    const root=new TransformNode(`range-${asset}`,this.scene),parts:Mesh[]=[];
    const metal=this.mat('column','#57636c');
    const box=(w:number,h:number,d:number,x:number,y:number,z:number)=>{
      const m=MeshBuilder.CreateBox(asset,{width:w,height:h,depth:d},this.scene);m.position.set(x,y,z);m.material=metal;parts.push(m);return m;
    };
    if(asset==='dead-pine'){
      const wood=this.painter.material('wood');
      const branch=(from:Vector3,to:Vector3,bottom:number,top:number)=>{
        const direction=to.subtract(from);
        const m=MeshBuilder.CreateCylinder('dead-pine-branch',{height:direction.length(),diameterBottom:bottom,diameterTop:top,tessellation:7},this.scene);
        m.position.copyFrom(from.add(to).scale(.5));
        m.rotationQuaternion=Quaternion.FromUnitVectorsToRef(Vector3.Up(),direction.normalize(),new Quaternion());
        m.material=wood;parts.push(m);
      };
      branch(new Vector3(0,0,0),new Vector3(.55,7.7,.18),.52,.08);
      for(let i=0;i<7;i++){
        const y=2.6+i*.62,a=i*2.4,reach=1.1+(i%2)*.35;
        const start=new Vector3(y*.071,y,y*.023);
        const tip=start.add(new Vector3(Math.cos(a)*reach,.24,Math.sin(a)*reach));
        branch(start,tip,.16,.045);
        branch(tip,tip.add(new Vector3(Math.cos(a+.5)*.3,.65,Math.sin(a+.5)*.3)),.07,.015);
      }
    } else if(asset==='ruin'){
      const concrete=this.mat('concrete','#87939b');
      const m=brokenPier(this.scene,.8,.65,()=>.43);m.scaling.z=.5;m.position.set(1.4,.03,.4);m.material=concrete;parts.push(m);
      for(const x of [-1.2,1.2])box(.52,3.2,.42,x,1.6,0).material=concrete;
      box(2.9,.5,.48,0,3.15,0).material=concrete;
      box(.48,2.3,2.2,-1.2,1.15,1.2).material=concrete;
      box(.15,3.5,.16,-1.1,1.6,.05).rotation.z=.08;
      box(2.3,.19,.35,.3,2.7,.02).rotation.z=-.12;
    } else {
      // A collapsed industrial column silhouette, not an interactable exit tower.
      box(2.2,2.1,9,0,1.3,0).rotation.z=.15;
      for(const z of [-4,-2,0,2,4]){box(2.6,.26,.4,0,2.38,z);box(.28,2.3,.4,-1.2,1.3,z);box(.28,2.3,.4,1.2,1.3,z);}
      box(3.1,.5,3.1,0,.25,5.2);
    }
    for(const p of parts){p.parent=root;p.isPickable=false;p.receiveShadows=true;}
    root.metadata={asset,theme};return root;
  }
  set(theme:RangeEnvironment):void {
    this.crater?.dispose();this.crater=null;
    this.grass?.dispose();this.grass=null;
    this.dust?.dispose();this.dust=null;
    this.wind=[];this.root?.dispose();this.root=new TransformNode(`range-environment-${theme}`,this.scene);this.theme=theme;
    const finish=theme==='volcano'?'caldera':theme==='frozen'?'snowy':theme==='storm'?'storm':theme==='outskirts'||theme==='sakura'||theme==='forest'?'mossy':'clean';
    // The shared bough texture carries snow; Stormbringer tints it to rain-dark spruce.
    // storm-kit-v3/spruce-boughs.png doesn't match the pine card layout yet; keep the tinted original.
    this.painter.pineBoughs(false);if(theme==='storm')this.painter.material('pine').diffuseColor.set(.34,.5,.4);
    const groups=new Map<string,Mesh[]>();
    for(const [placementIndex,placement] of rangePlacements(theme).entries()){
      if(isCityAsset(placement.asset)){
        const key=placement.asset;
        let template=this.templates.get(key);
        if(!template){const m=this.cityMaterials;template=createCityAsset(this.scene,placement.asset,m.concrete,m.steel,m.glass);template.setEnabled(false);this.templates.set(key,template);}
        const node=template.clone(`dressing-${key}`,this.root)!;
        node.setEnabled(true);node.position.set(placement.x,.04,placement.z);node.rotation.y=placement.yaw;node.scaling.setAll(placement.scale);
        const meshes=node.getChildMeshes() as Mesh[];
        // Tall self-shadowing shells produced unstable acne around their foundations.
        // They still cast onto streets; their own depth is shaded by the light rig.
        for(const mesh of meshes){mesh.metadata={rangeDressing:true,theme,city:true};mesh.receiveShadows=false;this.shadows.addShadowCaster(mesh);
          // Glow renders its own depth buffer. Scenery must participate as black
          // occluders or enemy cores and weapon flashes show through opaque walls.
          for(const layer of this.scene.effectLayers??[])if(layer instanceof GlowLayer){
            layer.addIncludedOnlyMesh(mesh);
            mesh.onDisposeObservable.addOnce(()=>layer.removeIncludedOnlyMesh(mesh));
          }
        }
        continue;
      }
      const key=`${placement.asset}-${finish}`;
      let template=this.templates.get(key);
      if(!template){
        const foliage=placement.asset==='pine'?'pine':placement.asset==='plant-bush'?'bush':placement.asset==='plant-fern'||placement.asset==='plant-grass'?'fern':placement.asset==='jungle-tree'?'tree':null;
        template=theme==='volcano'?createCalderaProp(this.scene,placement.asset):isForestAsset(placement.asset)?createForestAsset(this.scene,placement.asset,this.forestMaterials??=new ForestMaterials(this.scene)):isFrozenAsset(placement.asset)?createFrozenAsset(this.scene,placement.asset,this.frozenMaterials??=new FrozenMaterials(this.scene)):isSakuraAsset(placement.asset)?createSakuraAsset(this.scene,placement.asset,this.sakuraMaterials??=new SakuraMaterials(this.scene)):foliage?this.painter.foliage(foliage,theme==='frozen'):placement.asset==='sakura'?createSakuraTree(this.scene):['ruin','fallen-column','dead-pine'].includes(placement.asset)?this.landmark(placement.asset,theme):createEnvironmentProp(this.scene,placement.asset as Parameters<typeof createEnvironmentProp>[1],finish==='storm'||finish==='caldera'?'clean':finish);
        if(theme!=='volcano'&&!foliage&&placement.asset!=='dead-pine'&&!isSakuraAsset(placement.asset)&&!isFrozenAsset(placement.asset)&&!isForestAsset(placement.asset))this.painter.paint(template,placement.asset,finish);
        if(placement.asset==='plant-grass')template.scaling.setAll(.5);
        template.setEnabled(false);this.templates.set(key,template);
      }
      const node=template.clone(`dressing-${placement.asset}`,this.root)!;
      node.setEnabled(true);node.position.set(placement.x,0,placement.z);node.scaling.scaleInPlace(placement.scale);node.rotation.y=placement.yaw;
      if(placement.asset==='frozen-mountain')node.scaling.y*=.7+(.5+.5*Math.sin(placement.x*.13+placement.z*.17))*.65;
      if((theme==='forest'||theme==='storm')&&placement.asset==='pine')node.scaling.y*=1.65;
      // The distant forest is scenery beyond the playable boundary. Batch small
      // spatial patches; nearby trees keep individual fading and wind pivots.
      const farForest=placement.asset==='pine'&&theme==='frozen'&&Math.hypot(placement.x,placement.z)>FROZEN_RADIUS-10
        ||theme==='forest'&&['dead-pine','forest-thorn'].includes(placement.asset)&&Math.hypot(placement.x,placement.z)>FOREST_RADIUS-3
        // Stormbringer's border rows, hedge and solid thicket are scenery walls: batch them too.
        ||theme==='storm'&&['pine','plant-bush','plant-fern'].includes(placement.asset)
          &&(Math.hypot(placement.x,placement.z)>STORM_RADIUS-1.5||inThicket(placement.x,placement.z,.5));
      const moving=['sakura','pine','jungle-tree','plant-bush','plant-fern','plant-grass'].includes(placement.asset)&&!farForest;
      const patch=`${theme==='forest'?'forest-border':'frozen-forest'}-${Math.floor(placement.x/12)}-${Math.floor(placement.z/12)}`;
      const plantGroups=new Map<string,Mesh[]>();
      // Caldera dead trees stay whole, unbatched nodes: the lava sets them alight and sinks them (Volcano).
      if(theme==='volcano'&&placement.asset==='dead-pine'){
        for(const mesh of node.getChildMeshes()){mesh.isPickable=false;mesh.receiveShadows=true;mesh.metadata={rangeDressing:true,theme};this.shadows.addShadowCaster(mesh);}
        continue;
      }
      for(const child of node.getChildMeshes()){
        const mesh=child as Mesh;mesh.computeWorldMatrix(true);
        const groupKey=`${farForest?patch:placementIndex}:${mesh.material!.uniqueId}:${mesh.getVerticesDataKinds().sort().join(",")}:${Math.floor(placement.x/12)}:${Math.floor(placement.z/12)}`;
        mesh.metadata={...mesh.metadata,occlusionGroup:farForest?patch:node.uniqueId};
        const target=moving?plantGroups:groups;
        const group=target.get(groupKey)??[];group.push(mesh);target.set(groupKey,group);
      }
      if(moving){
        // Merge each plant by material, then pivot at its ground contact. The same
        // transforms drive geometry, normals, culling and shadow rendering.
        const pivot=new TransformNode(`wind-${placement.asset}`,this.scene);
        pivot.parent=this.root;pivot.position.set(placement.x,0,placement.z);
        for(const parts of plantGroups.values()){
          const merged=Mesh.MergeMeshes(parts,true,true)!;
          merged.setParent(pivot);merged.isPickable=false;merged.receiveShadows=true;
          merged.metadata={rangeDressing:true,theme,wind:true};this.shadows.addShadowCaster(merged);
        }
        this.wind.push({pivot,phase:placement.x*.73+placement.z*1.17,amplitude:placement.asset.startsWith('plant-')?.018:.006});
      }
    }
    for(const parts of groups.values()){
      const occlusionGroup=parts[0].metadata.occlusionGroup;
      const merged=Mesh.MergeMeshes(parts,true,true)!;merged.name=`range-dressing-${theme}`;merged.parent=this.root;
      merged.isPickable=false;merged.receiveShadows=true;if(typeof occlusionGroup!=='string')this.shadows.addShadowCaster(merged);merged.freezeWorldMatrix();
      // The forest's boundary wall stays opaque: fading it would show the map edge is see-through.
      merged.metadata={rangeDressing:true,theme,occlusionGroup,cameraOcclusionDisabled:typeof occlusionGroup==='string'&&occlusionGroup.startsWith('forest-border')};
    }
    if(theme==='city')this.dust=new CityDust(this.scene);
    if(theme==='outskirts')this.grass=new OutskirtsGrass(this.scene);
    if(theme==='outskirts')this.crater=new OutskirtsCrater(this.scene,this.shadows);
    if(this.select)this.select.value=theme;
  }
  /** Mounted inside the existing lab: no extra overlay covering the playing field. */
  mount(onChange:(theme:RangeEnvironment)=>void):void {
    const body=document.querySelector('#weather-lab .weather-lab-body');if(!body)return;
    const panel=document.createElement('section');panel.className='range-dressing-controls';
    const label=document.createElement('label');label.textContent='Map';
    const select=document.createElement('select');select.id='lab-environment';select.setAttribute('aria-label','Test Range environment');
    for(const [id,name] of Object.entries(RANGE_ENVIRONMENTS))select.add(new Option(name,id));
    select.value=this.theme;select.addEventListener('change',()=>onChange(select.value as RangeEnvironment));label.append(select);panel.append(label);
    const hint=document.createElement('p');hint.textContent='Solid scenery blocks movement and shots. Foliage stays passable.';panel.append(hint);
    body.prepend(panel);this.panel=panel;this.select=select;
  }
  get meshes():Mesh[]{return this.root?.getChildMeshes().filter(m=>m.getTotalVertices()>0) as Mesh[]??[];}
  dispose():void{this.crater?.dispose();this.grass?.dispose();this.dust?.dispose();this.root?.dispose();this.templates.forEach(t=>t.dispose());this.templates.clear();this.panel?.remove();}
}
