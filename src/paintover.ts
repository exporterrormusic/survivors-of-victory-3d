import { type Material, Matrix, Mesh, MultiMaterial, StandardMaterial, SubMesh, Texture, TransformNode, Vector3, VertexBuffer, type Scene } from '@babylonjs/core';
import { PAINTOVER_PROJECTIONS } from './paintover-data';

export type PaintedAsset = keyof typeof PAINTOVER_PROJECTIONS;
interface Projection { atlas:string; row:number; rows:number; center:readonly number[]; span:number; size?:readonly number[] }
// Generated from the exact orthographic blockout captures, not hand-authored UV islands.
const PROJECTIONS:Record<PaintedAsset,Projection>=PAINTOVER_PROJECTIONS;
const caches=new WeakMap<Scene,{materials:Map<string,StandardMaterial>;textures:Map<string,Texture>}>();
function cache(scene:Scene) {
  let c=caches.get(scene);if(!c){c={materials:new Map(),textures:new Map()};caches.set(scene,c);}return c;
}
export function paintedMaterial(scene:Scene,asset:PaintedAsset):StandardMaterial {
  const c=cache(scene),atlas=PROJECTIONS[asset].atlas;
  let material=c.materials.get(atlas);if(material)return material;
  let texture=c.textures.get(atlas);
  if(!texture){
    texture=new Texture(`${import.meta.env.BASE_URL}environment/paintover-v1/${atlas}.webp`,scene);
    texture.wrapU=texture.wrapV=Texture.CLAMP_ADDRESSMODE;texture.anisotropicFilteringLevel=16;c.textures.set(atlas,texture);
  }
  material=new StandardMaterial(`paintover-${atlas}`,scene);
  material.diffuseTexture=texture;
  material.diffuseColor.set(.95,.97,1);material.emissiveColor.set(0,0,0);
  material.specularColor.set(.1,.12,.14);material.specularPower=48;
  material.metadata={workflow:'blockout capture → AI paint-over → four-view surface projection bake',atlas};
  c.materials.set(atlas,material);return material;
}

export interface ProjectionBounds { min:Vector3; max:Vector3 }
/** Bounds in the same local coordinate system used by the reference capture. */
export function paintBounds(meshes:readonly Mesh[],space?:TransformNode):ProjectionBounds {
  const min=new Vector3(Infinity,Infinity,Infinity),max=new Vector3(-Infinity,-Infinity,-Infinity);
  space?.computeWorldMatrix(true);
  const inverse=space?Matrix.Invert(space.getWorldMatrix()):null;
  for(const mesh of meshes) {
    mesh.computeWorldMatrix(true);
    const matrix=inverse?mesh.getWorldMatrix().multiply(inverse):Matrix.IdentityReadOnly;
    const positions=mesh.getVerticesData(VertexBuffer.PositionKind)!;
    for(let i=0;i<positions.length;i+=3){const p=Vector3.TransformCoordinates(Vector3.FromArray(positions,i),matrix);min.minimizeInPlace(p);max.maximizeInPlace(p);}
  }
  return {min,max};
}

/** Bake the generated views into UVs. No screen-space projector: the paint follows
 * each surface through camera motion, turret rotation, scale and destruction. */
export function applyPaintover(mesh:Mesh,asset:PaintedAsset,options:{space?:TransformNode;fit?:ProjectionBounds}={}):void {
  const spec=PROJECTIONS[asset];
  mesh.makeGeometryUnique();mesh.convertToFlatShadedMesh();
  mesh.computeWorldMatrix(true);options.space?.computeWorldMatrix(true);
  const matrix=options.space?mesh.getWorldMatrix().multiply(Matrix.Invert(options.space.getWorldMatrix())):Matrix.IdentityReadOnly;
  const positions=mesh.getVerticesData(VertexBuffer.PositionKind)!,indices=mesh.getIndices()!,uvs=new Float32Array(positions.length/3*2);
  const center=Vector3.FromArray(spec.center),p=[new Vector3(),new Vector3(),new Vector3()];
  const fitCenter=options.fit?options.fit.min.add(options.fit.max).scale(.5):null;
  const fitSize=options.fit?options.fit.max.subtract(options.fit.min):null;
  for(let t=0;t<indices.length;t+=3) {
    for(let k=0;k<3;k++)Vector3.TransformCoordinatesToRef(Vector3.FromArray(positions,indices[t+k]*3),matrix,p[k]);
    const normal=Vector3.Cross(p[1].subtract(p[0]),p[2].subtract(p[0])).normalize();
    // Babylon's triangle winding gives the opposite mathematical cross product.
    normal.scaleInPlace(-1);
    const ax=Math.abs(normal.x),ay=Math.abs(normal.y),az=Math.abs(normal.z);
    const column=ay>=ax&&ay>=az?3:ax>=az?2:normal.z>0?0:1;
    for(let k=0;k<3;k++) {
      const point=p[k];
      if(fitCenter&&fitSize&&spec.size){point.subtractInPlace(fitCenter);point.x*=spec.size[0]/Math.max(.001,fitSize.x);point.y*=spec.size[1]/Math.max(.001,fitSize.y);point.z*=spec.size[2]/Math.max(.001,fitSize.z);point.addInPlace(center);}
      point.subtractInPlace(center);
      const u=.5+(column===0?-point.x:column===2?point.z:point.x)/spec.span;
      const v=.5-(column===3?point.z:point.y)/spec.span;
      const index=indices[t+k]*2;
      uvs[index]=(column+Math.max(.003,Math.min(.997,u)))/4;
      uvs[index+1]=1-(spec.row+Math.max(.003,Math.min(.997,v)))/spec.rows;
    }
  }
  mesh.setVerticesData(VertexBuffer.UVKind,uvs);
  const paint=paintedMaterial(mesh.getScene(),asset),original=mesh.material;
  if(original instanceof MultiMaterial) {
    const material=new MultiMaterial(`${mesh.name}-paint`,mesh.getScene());
    material.subMaterials=original.subMaterials.map(m=>m instanceof StandardMaterial&&m.disableLighting?m:paint);
    mesh.material=material;original.dispose();
  } else mesh.material=paint;
  groupSubMeshesByMaterial(mesh);
  mesh.metadata={...mesh.metadata,paintover:asset};
}

/** MergeMeshes keeps one submesh, so one draw call per pass, for each source material,
 * even after the paint maps all of them to one shared material. Collapse such meshes to a
 * single submesh and material. Meshes that keep a second material (turret visors) are left
 * as they are: regrouping their submeshes under a MultiMaterial rendered the whole turret
 * with the visor material in testing, for a saving of only one draw. */
function groupSubMeshesByMaterial(mesh:Mesh):void {
  const multi=mesh.material;
  if(!(multi instanceof MultiMaterial)||mesh.subMeshes.length<2)return;
  const materials=new Set<Material|null>(mesh.subMeshes.map(sub=>multi.subMaterials[sub.materialIndex]??null));
  const only=materials.values().next().value;
  if(materials.size!==1||!only)return;
  mesh.releaseSubMeshes();
  new SubMesh(0,0,mesh.getTotalVertices(),0,mesh.getTotalIndices(),mesh);
  mesh.material=only;multi.dispose();
}
