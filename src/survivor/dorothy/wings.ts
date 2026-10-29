import { Quaternion, TransformNode, Vector3 } from '@babylonjs/core';
import type { KitContext } from '../kit';

/** Drive only the default outfit's authored armor bones, after the locomotion blend. */
export function createDorothyWings(ctx: KitContext) {
  let disposed=false;
  return {
    async prepare(){},
    update(amount:number) {
      const model=ctx.playerModel;
      if(disposed || model?.meta.variant!=='c233_00')return;
      const rest=model.animationGroup('idle_01');
      const deployed=model.animationGroup('cover_aim_idle');
      if(!rest || !deployed)return;
      for(const track of deployed.targetedAnimations){
        const node=track.target;
        if(!(node instanceof TransformNode) || !/^(Bone_Skirt_Wing|Bone022)/.test(node.name))continue;
        const property=track.animation.targetProperty;
        const base=rest.targetedAnimations.find(t=>t.target===node && t.animation.targetProperty===property);
        if(!base)continue;
        const a=base.animation.evaluate(rest.from),b=track.animation.evaluate(deployed.from);
        if(property==='rotationQuaternion' && a instanceof Quaternion && b instanceof Quaternion){
          node.rotationQuaternion=Quaternion.Slerp(a,b,amount);
        }else if(a instanceof Vector3 && b instanceof Vector3){
          if(property==='scaling')Vector3.LerpToRef(a,b,amount,node.scaling);
          if(property==='position')Vector3.LerpToRef(a,b,amount,node.position);
        }
      }
    },
    dispose(){disposed=true;},
  };
}
