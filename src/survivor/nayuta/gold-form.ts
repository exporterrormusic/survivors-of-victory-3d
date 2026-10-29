import { MaterialPluginBase, PBRMaterial, StandardMaterial, type UniformBuffer } from '@babylonjs/core';
import type { Chibi } from '../../chibi';

/** Gold light follows the equipped skinned model, preserving its textures and silhouette. */
export class GoldForm {
 time = 0;
 strength = 0;
 silver = false;
 constructor(model: Chibi, public hologram = false) {
  for(const material of new Set(model.meshes.map(m=>m.material)))
   if(material instanceof PBRMaterial || material instanceof StandardMaterial)new GoldMaterial(material,this);
 }
}
class GoldMaterial extends MaterialPluginBase {
 constructor(material:PBRMaterial|StandardMaterial,private state:GoldForm){
  super(material,'NayutaGoldForm',310,{},true,true);this.doNotSerialize=true;
 }
 override getClassName(){return 'NayutaGoldForm';}
 override getUniforms(){return {ubo:[{name:'nayutaGoldTime',size:4,type:'vec4'}],fragment:'uniform vec4 nayutaGoldTime;'};}
 override bindForSubMesh(buffer:UniformBuffer){buffer.updateFloat4('nayutaGoldTime',this.state.time,this.state.strength,this.state.hologram?1:0,this.state.silver?1:0);}
 override getCustomCode(type:string):Record<string,string>|null{
  if(type!=='fragment')return null;
  const output=this._material instanceof PBRMaterial?'finalColor':'color';
  return {CUSTOM_FRAGMENT_BEFORE_FOG:`
   float nayutaRim=pow(1.0-abs(dot(normalize(normalW),normalize(viewDirectionW))),1.6);
   float nayutaPulse=.94+.06*sin(nayutaGoldTime.x*2.0);
   // Broad, slow scan bands remain readable on small animated clones without flickering.
   float nayutaScan=.5+.5*sin(vPositionW.y*38.0-nayutaGoldTime.x*2.5);
   float nayutaBand=smoothstep(.78,.98,nayutaScan);
   float nayutaLuma=dot(${output}.rgb,vec3(.299,.587,.114));
   vec3 nayutaTint=mix(vec3(1.0,.72,.24),vec3(.83,.93,1.0),nayutaGoldTime.w);
   vec3 nayutaProjection=nayutaTint*(.18+nayutaLuma*.75+nayutaRim*.65+nayutaBand*.16);
   ${output}.rgb=mix(${output}.rgb,nayutaProjection,nayutaGoldTime.z*.78);
   ${output}.a*=mix(1.0,.82+.12*nayutaScan,nayutaGoldTime.z);
   ${output}.rgb=mix(${output}.rgb,${output}.rgb*nayutaTint+nayutaTint*(.22+nayutaRim*1.2)*nayutaPulse,nayutaGoldTime.y);
  `};
 }
}
