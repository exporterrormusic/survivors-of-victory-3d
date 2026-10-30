import { Matrix, Ray, Vector3, type AbstractMesh, type Material, type Scene, type ShadowGenerator } from '@babylonjs/core';

/** Camera-only transparency: collision, shadows and shared material alpha stay intact. */
export class SceneryOcclusion {
  private enabled=true;
  private faded=new Map<AbstractMesh,{base:number;blocked:boolean;hold:number}>();
  private elapsed=1;
  private groupFade=new Map<unknown,{value:number;velocity:number}>();
  private materials=new Map<Material,{blend:Material['needAlphaBlendingForMesh'];test:Material['needAlphaTestingForMesh'];depth:boolean}>();
  private scene:Scene;
  private shadowVisibility=new Map<AbstractMesh,number>();
  private detachShadowPass?:()=>void;
  constructor(scene:Scene,shadows?:ShadowGenerator){
    this.scene=scene;
    const map=shadows?.getShadowMap();
    if(map){
      // Restore original visibility before shadow render-list classification, so
      // faded opaque casters do not get dropped into the transparent queue.
      const before=map.onBeforeBindObservable.add(()=>{
        for(const [mesh,state] of this.faded)if(!mesh.isDisposed()){
          this.shadowVisibility.set(mesh,mesh.visibility);mesh.visibility=state.base;
        }
      });
      const after=map.onAfterUnbindObservable.add(()=>this.restoreCameraVisibility());
      this.detachShadowPass=()=>{map.onBeforeBindObservable.remove(before);map.onAfterUnbindObservable.remove(after);};
    }
  }
  private restoreCameraVisibility():void{
    for(const [mesh,visibility] of this.shadowVisibility)if(!mesh.isDisposed())mesh.visibility=visibility;
    this.shadowVisibility.clear();
  }
  /** Eye-level play has no third-person silhouette to uncover. Restore both
   * visibility and material depth/blending overrides before suspending scans. */
  setEnabled(enabled:boolean):void{
    if(this.enabled===enabled)return;
    this.enabled=enabled;
    if(!enabled)this.reset();
    this.elapsed=1;
  }
  update(dt:number,player:Vector3,meshes:readonly AbstractMesh[],excluded:readonly AbstractMesh[]=[]):void{
    if(!this.enabled)return;
    // Loading shaders or returning to the tab must not consume the entire fade
    // in one rendered frame. All parts still advance on the same visual clock.
    dt=Number.isFinite(dt)?Math.max(0,Math.min(dt,1/30)):0;
    const excludedSet=new Set([...excluded,...meshes.filter(mesh=>mesh.metadata?.cameraOcclusionDisabled)]);
    for(const mesh of excludedSet){
      const state=this.faded.get(mesh);
      if(state){mesh.visibility=state.base;this.faded.delete(mesh);}
    }
    const groupOf=(mesh:AbstractMesh):unknown=>{
          if(mesh.metadata?.occlusionGroup!==undefined)return mesh.metadata.occlusionGroup;
          let node=mesh.parent;
          while(node?.parent&&!node.parent.name.startsWith('range-environment-'))node=node.parent;
          return node&&!node.name.startsWith('range-environment-')?node:mesh;
        };
    this.elapsed+=dt;
    if(this.elapsed>=.06){
      const elapsed=this.elapsed;this.elapsed=0;
      for(const state of this.faded.values()){state.hold=Math.max(0,state.hold-elapsed);state.blocked=state.hold>0;}
      const camera=this.scene.activeCamera;
      if(camera){
        const origin=camera.globalPosition;
        // Cover the player silhouette, not a wide proximity zone around it.
        const rays=[[-.45,.7],[.45,.7],[-.45,1.7],[.45,1.7],[0,1.2],[0,2.0]].map(([x,y])=>{
          const end=new Vector3(player.x+x,player.y+y,player.z),delta=end.subtract(origin);
          return new Ray(origin,delta.normalizeToNew(),Math.max(0,delta.length()-.25));
        });
        const blockedParents=new Set<unknown>();
        for(const mesh of meshes){
          if(excludedSet.has(mesh)||mesh.isDisposed()||!mesh.isEnabled()||!mesh.isVisible||!mesh.getTotalVertices())continue;
          const material=mesh.material;
          if(material&&!this.materials.has(material)){
            const blend=material.needAlphaBlendingForMesh,test=material.needAlphaTestingForMesh;
            this.materials.set(material,{blend,test,depth:material.needDepthPrePass});
            material.needDepthPrePass=true;
            // Explicit opaque/alpha-test modes otherwise ignore mesh.visibility.
            // Keep foliage cutouts while allowing per-mesh transparency, without
            // changing the alpha of any other object sharing this material.
            material.needAlphaBlendingForMesh=m=>m.visibility<1||blend.call(material,m);
            material.needAlphaTestingForMesh=m=>m.visibility<1?material.needAlphaTesting():test.call(material,m);
          }
          mesh.computeWorldMatrix(true);
          if(mesh.getBoundingInfo().boundingBox.maximumWorld.y<player.y+.35)continue;
          if(rays.some(ray=>{
            const bounds=mesh.getBoundingInfo().boundingBox;
            if(!ray.intersectsBoxMinMax(bounds.minimumWorld,bounds.maximumWorld))return false;
            // Bounds can include empty doorways and space between roof/posts.
            // Only actual geometry in front of the player may trigger the group.
            const local=Ray.Transform(ray,Matrix.Invert(mesh.getWorldMatrix()));
            const hit=mesh.intersects(local,false);
            return hit.hit&&hit.distance<ray.length;
          })){
            const state=this.faded.get(mesh)??{base:mesh.visibility,blocked:false,hold:0};
            state.blocked=true;state.hold=.3;this.faded.set(mesh,state);
            blockedParents.add(groupOf(mesh));
          }
        }
        // A tree or mast fades as one object, including its foliage, trim and lights.
        for(const mesh of meshes)if(!excludedSet.has(mesh)&&blockedParents.has(groupOf(mesh))){
          const state=this.faded.get(mesh)??{base:mesh.visibility,blocked:false,hold:0};state.blocked=true;state.hold=.3;this.faded.set(mesh,state);
        }
      }
    }
    const groups=new Map<unknown,{members:AbstractMesh[];blocked:boolean}>();
    for(const [mesh,state] of this.faded){
      if(mesh.isDisposed()){this.faded.delete(mesh);continue;}
      const key=groupOf(mesh),group=groups.get(key)??{members:[],blocked:false};
      group.members.push(mesh);group.blocked ||= state.blocked;groups.set(key,group);
    }
    for(const [key,group] of groups){
      const target=group.blocked?.10:1,state=this.groupFade.get(key)??{value:1,velocity:0};
      // Critically damped easing starts gently and preserves velocity when the
      // obstruction changes. Fade away in ~.5 s; restore more slowly in ~.75 s.
      const speed=group.blocked?14:10,seconds=Math.max(0,dt);
      const offset=state.value-target,impulse=state.velocity+speed*offset;
      const decay=Math.exp(-speed*seconds);
      let value=target+(offset+impulse*seconds)*decay;
      state.velocity=(state.velocity-speed*impulse*seconds)*decay;
      value=Math.max(.10,Math.min(1,value));state.value=value;
      const restored=!group.blocked&&Math.abs(value-1)<.001;
      if(restored)value=1;
      for(const mesh of group.members){
        mesh.visibility=this.faded.get(mesh)!.base*value;
        if(restored)this.faded.delete(mesh);
      }
      if(restored)this.groupFade.delete(key);else this.groupFade.set(key,state);
    }
    for(const key of this.groupFade.keys())if(!groups.has(key))this.groupFade.delete(key);
  }
  private reset():void{
    this.restoreCameraVisibility();
    for(const [mesh,state] of this.faded)if(!mesh.isDisposed())mesh.visibility=state.base;
    for(const [material,methods] of this.materials){material.needAlphaBlendingForMesh=methods.blend;material.needAlphaTestingForMesh=methods.test;material.needDepthPrePass=methods.depth;}
    this.faded.clear();this.materials.clear();this.groupFade.clear();
  }
  dispose():void{
    this.detachShadowPass?.();this.reset();
  }
}
