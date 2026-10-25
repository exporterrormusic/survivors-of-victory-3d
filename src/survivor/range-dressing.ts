import { Color3, Mesh, MeshBuilder, StandardMaterial, TransformNode, type Scene, type ShadowGenerator } from '@babylonjs/core';
import { createEnvironmentProp } from '../environment-kit';
import { createSakuraTree } from '../sakura';
import { brokenPier } from '../environment';
import { RangeMaterials } from './range-materials';
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
  private wind: {pivot:TransformNode;phase:number;amplitude:number}[]=[];
  private reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
  update(dt:number):void {
    if(this.reducedMotion.matches)return;
    this.windTime+=dt;
    for(const item of this.wind){
      const t=this.windTime,p=item.phase,a=item.amplitude*(this.theme==='storm'?1.5:1);
      item.pivot.rotation.x=a*(Math.sin(t*.83+p)*.7+Math.sin(t*1.47+p*1.7)*.3);
      item.pivot.rotation.z=a*(Math.sin(t*.67+p+1.2)*.7+Math.sin(t*1.19+p*.8)*.3);
    }
  }
  constructor(private scene:Scene,private shadows:ShadowGenerator){this.painter=new RangeMaterials(scene);}
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
    if(asset==='ruin'){
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
    this.wind=[];this.root?.dispose();this.root=new TransformNode(`range-environment-${theme}`,this.scene);this.theme=theme;
    const finish=theme==='frozen'?'snowy':theme==='outskirts'||theme==='sakura'||theme==='storm'?'mossy':'clean';
    const groups=new Map<string,Mesh[]>();
    for(const placement of rangePlacements(theme)){
      const key=`${placement.asset}-${finish}`;
      let template=this.templates.get(key);
      if(!template){
        const foliage=placement.asset==='pine'?'pine':placement.asset==='plant-bush'?'bush':placement.asset==='plant-fern'||placement.asset==='plant-grass'?'fern':placement.asset==='jungle-tree'?'tree':null;
        template=foliage?this.painter.foliage(foliage):placement.asset==='sakura'?createSakuraTree(this.scene):['ruin','fallen-column'].includes(placement.asset)?this.landmark(placement.asset,theme):createEnvironmentProp(this.scene,placement.asset as Parameters<typeof createEnvironmentProp>[1],finish);
        if(!foliage)this.painter.paint(template,placement.asset,finish);
        if(placement.asset==='plant-grass')template.scaling.setAll(.5);
        template.setEnabled(false);this.templates.set(key,template);
      }
      const node=template.clone(`dressing-${placement.asset}`,this.root)!;
      node.setEnabled(true);node.position.set(placement.x,0,placement.z);node.scaling.scaleInPlace(placement.scale);node.rotation.y=placement.yaw;
      const moving=['sakura','pine','jungle-tree','plant-bush','plant-fern','plant-grass'].includes(placement.asset);
      const plantGroups=new Map<string,Mesh[]>();
      for(const child of node.getChildMeshes()){
        const mesh=child as Mesh;mesh.computeWorldMatrix(true);
        const groupKey=`${mesh.material!.uniqueId}:${Math.floor(placement.x/12)}:${Math.floor(placement.z/12)}`;
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
      const merged=Mesh.MergeMeshes(parts,true,true)!;merged.name=`range-dressing-${theme}`;merged.parent=this.root;
      merged.isPickable=false;merged.receiveShadows=true;this.shadows.addShadowCaster(merged);merged.freezeWorldMatrix();
      merged.metadata={rangeDressing:true,theme};
    }
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
  dispose():void{this.root?.dispose();this.templates.forEach(t=>t.dispose());this.templates.clear();this.panel?.remove();}
}
