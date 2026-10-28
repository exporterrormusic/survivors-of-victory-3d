import { Axis, BoundingInfo, Color3, Constants, GlowLayer, Mesh, ShaderMaterial, Vector3, VertexData, type Scene } from '@babylonjs/core';
import type { Vfx } from '../vfx';
import '../snow-white/blue-fire'; // Reuse the existing animated, curled flame shaders.

type Slot = { mesh: Mesh; material: ShaderMaterial; busy: boolean };
const pools = new WeakMap<Scene, Slot[]>();

export function goldenFireDisc(vfx: Vfx) {
  const scene = vfx.camera.getScene();
  let pool = pools.get(scene);
  if (!pool) { pool = []; pools.set(scene, pool); }
  let slot = pool.find(s => !s.busy);
  if (!slot) {
    const mesh = new Mesh('rapunzel-golden-fire', scene);
    const material = new ShaderMaterial('rapunzel-golden-fire', scene, 'swAnimeFire', {
      attributes: ['position', 'uv', 'color'],
      uniforms: ['world', 'viewProjection', 'cameraRight', 'time', 'flameWidth', 'flameHeight', 'origin', 'forward', 'side', 'outerColor', 'flameColor', 'coreColor', 'reach', 'opacity', 'halfWidth', 'fieldRadius'],
      needAlphaBlending: true,
    });
    material.alphaMode = Constants.ALPHA_COMBINE;
    material.disableDepthWrite = true; material.backFaceCulling = false;
    material.setColor3('outerColor', new Color3(.85, .35, .025));
    material.setColor3('flameColor', new Color3(1.3, .85, .12));
    material.setColor3('coreColor', new Color3(1.4, 1.25, .8));
    material.setVector3('forward', Vector3.Zero()); material.setVector3('side', Vector3.Zero());
    material.setFloat('reach', 100); material.setFloat('halfWidth', 100);
    material.setFloat('opacity', 0); material.setFloat('time', 0);
    material.setFloat('fieldRadius', 1); material.setFloat('flameWidth', .8); material.setFloat('flameHeight', .72);
    material.setVector3('origin', Vector3.Zero()); material.setVector3('cameraRight', Vector3.Right());
    const positions: number[] = [], uvs: number[] = [], colors: number[] = [], indices: number[] = [];
    for (let i = 0; i < 48; i++) {
      const a = i * 2.39996, r = Math.sqrt((i + .5) / 48) * .86;
      const seed = [Math.random(), Math.random(), Math.random(), Math.random()];
      for (const [u, v] of [[0,0],[1,0],[1,1],[0,1]]) {
        positions.push(Math.cos(a) * r, 0, Math.sin(a) * r); uvs.push(u,v); colors.push(...seed);
      }
      const b = i * 4; indices.push(b,b+1,b+2,b,b+2,b+3);
    }
    const data = new VertexData(); data.positions = positions; data.uvs = uvs; data.colors = colors; data.indices = indices; data.applyToMesh(mesh);
    mesh.material = material; mesh.isPickable = false; mesh.setEnabled(false);
    mesh.setBoundingInfo(new BoundingInfo(new Vector3(-1.5,0,-1.5), new Vector3(1.5,3,1.5)));
    for (const layer of scene.effectLayers ?? []) if (layer instanceof GlowLayer) {
      layer.addIncludedOnlyMesh(mesh); layer.referenceMeshToUseItsOwnMaterial(mesh);
    }
    slot = { mesh, material, busy: false }; pool.push(slot);
  }
  slot.busy = true;
  const { mesh, material } = slot, right = new Vector3();
  return {
    update(at: Vector3, radius: number, age: number, opacity: number) {
      mesh.position.set(at.x, .045, at.z); mesh.scaling.set(radius, 1, radius);
      vfx.camera.getDirectionToRef(Axis.X, right); material.setVector3('cameraRight', right);
      material.setVector3('origin', mesh.position); material.setFloat('fieldRadius', radius);
      material.setFloat('flameWidth', .65 + radius * .16); material.setFloat('flameHeight', .54 + radius * .132);
      material.setFloat('time', age); material.setFloat('opacity', opacity); mesh.setEnabled(true);
    },
    dispose() { mesh.setEnabled(false); slot.busy = false; },
  };
}
