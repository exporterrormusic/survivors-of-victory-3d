import { Quaternion, Space, Vector3, type TransformNode } from '@babylonjs/core';
import type { Chibi } from '../../chibi';

/** Two-bone lotus pose, blended after locomotion so movement never uncrosses the legs. */
export class MeditationPose {
 constructor(private model:Chibi){}
 apply(weight:number,yaw:number){
  if(weight<=0)return;
  const right=new Vector3(Math.cos(yaw),0,-Math.sin(yaw)),forward=new Vector3(Math.sin(yaw),0,Math.cos(yaw));
  for(const [side,sign] of [['L',-1],['R',1]] as const){
   const thigh=this.model.joint(`Bip001 ${side} Thigh`),calf=this.model.joint(`Bip001 ${side} Calf`),foot=this.model.joint(`Bip001 ${side} Foot`);
   if(!thigh?.rotationQuaternion||!calf?.rotationQuaternion||!foot)continue;
   const oldThigh=thigh.rotationQuaternion.clone(),oldCalf=calf.rotationQuaternion.clone();
   thigh.computeWorldMatrix(true);calf.computeWorldMatrix(true);foot.computeWorldMatrix(true);
   const hip=thigh.getAbsolutePosition().clone(),knee=calf.getAbsolutePosition().clone(),ankle=foot.getAbsolutePosition().clone();
   const upper=Vector3.Distance(hip,knee),lower=Vector3.Distance(knee,ankle);
   const target=hip.add(right.scale(-sign*.27)).addInPlace(forward.scale(.25)).addInPlaceFromFloats(0,-.13,0);
   const direction=target.subtract(hip).normalize(),distance=Math.min(Vector3.Distance(hip,target),upper+lower-.001);
   const along=(upper*upper-lower*lower+distance*distance)/(2*distance),height=Math.sqrt(Math.max(0,upper*upper-along*along));
   const outward=right.scale(sign);outward.subtractInPlace(direction.scale(Vector3.Dot(outward,direction))).normalize();
   const kneeTarget=hip.add(direction.scale(along)).addInPlace(outward.scale(height));
   this.aimBone(thigh,calf,kneeTarget);
   this.aimBone(calf,foot,target);
   const foldedThigh=thigh.rotationQuaternion.clone(),foldedCalf=calf.rotationQuaternion.clone();
   Quaternion.SlerpToRef(oldThigh,foldedThigh,weight,thigh.rotationQuaternion);
   Quaternion.SlerpToRef(oldCalf,foldedCalf,weight,calf.rotationQuaternion);
   thigh.computeWorldMatrix(true);calf.computeWorldMatrix(true);foot.computeWorldMatrix(true);
  }
 }
 private aimBone(bone:TransformNode,child:TransformNode,target:Vector3){
  bone.computeWorldMatrix(true);child.computeWorldMatrix(true);
  const from=child.getAbsolutePosition().subtract(bone.getAbsolutePosition()).normalize(),to=target.subtract(bone.getAbsolutePosition()).normalize();
  const axis=Vector3.Cross(from,to),length=axis.length();if(length<.00001)return;
  bone.rotate(axis.scale(1/length),Math.acos(Math.max(-1,Math.min(1,Vector3.Dot(from,to)))),Space.WORLD);
  bone.computeWorldMatrix(true);child.computeWorldMatrix(true);
 }
}
