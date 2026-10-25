// Dash afterimages (Survivors drew tinted copies of the sprite every 55 ms, fading over 220 ms).
// In 3D each ghost is a frozen copy of the chibi's current pose: the skinned meshes are cloned and
// skinned once on the CPU, then drawn with a glowing rim that fades out.

import { Color3, Constants, Material, type Mesh, Quaternion, StandardMaterial, Vector3 } from '@babylonjs/core';
import type { Chibi } from '../chibi';
import type { Rgb, Vfx } from './vfx';

const LIFE = .22;
const scale = new Vector3(), rotation = new Quaternion(), position = new Vector3();

export function spawnAfterimage(vfx: Vfx, chibi: Chibi, color: Rgb): void {
  const material = new StandardMaterial('afterimage', vfx.scene);
  material.disableLighting = true;
  material.diffuseColor = Color3.Black();
  material.specularColor = Color3.Black();
  material.emissiveColor = new Color3(color[0], color[1], color[2]);
  material.alphaMode = Constants.ALPHA_ADD;
  material.transparencyMode = Material.MATERIAL_ALPHABLEND;
  material.disableDepthWrite = true;
  material.backFaceCulling = false;
  material.alpha = .45;
  const ghosts: Mesh[] = [];
  for (const source of chibi.meshes) {
    if (!source.isVisible || !source.skeleton) continue;
    const mesh = source as Mesh;
    const ghost = mesh.clone(`${mesh.name}-ghost`, null, true, false);
    if (!ghost) continue;
    ghost.makeGeometryUnique();
    ghost.applySkeleton(mesh.skeleton!);
    ghost.skeleton = null;
    ghost.parent = null;
    mesh.computeWorldMatrix(true).decompose(scale, rotation, position);
    ghost.position.copyFrom(position);
    ghost.rotationQuaternion = rotation.clone();
    ghost.scaling.copyFrom(scale);
    ghost.material = material;
    ghost.isPickable = false;
    ghost.alwaysSelectAsActiveMesh = true;
    ghost.layerMask = mesh.layerMask;
    ghosts.push(ghost);
  }
  vfx.add({
    update: (_dt, age) => {
      const t = age / LIFE;
      if (t >= 1) return false;
      material.alpha = .45 * (1 - t) * (1 - t);
      return true;
    },
    dispose: () => {
      for (const ghost of ghosts) ghost.dispose();
      material.dispose();
    },
  });
}

