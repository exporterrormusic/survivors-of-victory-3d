// Procedural stand-ins for things NKAS has no model for. Each returns a PropModel, so units using
// it render through the same instanced path as crowds (src/crowd.ts).
import { Color3, Mesh, MeshBuilder, Scene, ShadowGenerator, StandardMaterial, VertexBuffer } from '@babylonjs/core';
import { PropModel } from './crowd';

/** Built at chibi-minion proportions, then scaled to stand about 1.7 units tall. */
const TURRET_SCALE = 1.3;

/** Deployable missile turret: tripod base, armoured head, pods either side and a barrel along +Z. */
export function createTurretModel(scene: Scene, shadows: ShadowGenerator): PropModel {
  const parts: Mesh[] = [];
  const part = (mesh: Mesh, hex: string, x: number, y: number, z: number): Mesh => {
    mesh.position.set(x, y, z);
    paint(mesh, hex);
    parts.push(mesh);
    return mesh;
  };
  part(MeshBuilder.CreateCylinder('t-base', { diameterTop: 0.6, diameterBottom: 1.05, height: 0.3, tessellation: 14 }, scene), '#2b3038', 0, 0.15, 0);
  for (let i = 0; i < 3; i++) {
    const leg = part(MeshBuilder.CreateBox('t-leg', { width: 0.12, height: 0.08, depth: 0.7 }, scene), '#3d4450', 0, 0.06, 0);
    leg.rotation.y = (i * Math.PI * 2) / 3 + Math.PI / 3;
    leg.position.set(Math.sin(leg.rotation.y) * 0.5, 0.05, Math.cos(leg.rotation.y) * 0.5);
  }
  part(MeshBuilder.CreateCylinder('t-column', { diameter: 0.3, height: 0.5, tessellation: 10 }, scene), '#4a525e', 0, 0.55, 0);
  part(MeshBuilder.CreateBox('t-head', { width: 0.8, height: 0.48, depth: 0.78 }, scene), '#808b98', 0, 1.02, -0.04);
  part(MeshBuilder.CreateBox('t-stripe', { width: 0.82, height: 0.07, depth: 0.8 }, scene), '#3aa7ff', 0, 1.2, -0.04);
  for (const side of [-1, 1]) {
    part(MeshBuilder.CreateBox('t-pod', { width: 0.26, height: 0.34, depth: 0.6 }, scene), '#3a414b', side * 0.53, 1.04, 0.06);
    part(MeshBuilder.CreateBox('t-pod-face', { width: 0.2, height: 0.26, depth: 0.04 }, scene), '#ff9b3d', side * 0.53, 1.04, 0.37);
  }
  const barrel = part(MeshBuilder.CreateCylinder('t-barrel', { diameter: 0.16, height: 0.72, tessellation: 10 }, scene), '#252a31', 0, 0.98, 0.66);
  barrel.rotation.x = Math.PI / 2;
  part(MeshBuilder.CreateBox('t-sight', { width: 0.3, height: 0.1, depth: 0.06 }, scene), '#5ee0ff', 0, 1.12, 0.36);

  const mesh = Mesh.MergeMeshes(parts, true, true)!;
  mesh.name = 'turret';
  mesh.scaling.setAll(TURRET_SCALE);
  mesh.bakeCurrentTransformIntoVertices();
  const mat = new StandardMaterial('turret-mat', scene);
  mat.diffuseColor = Color3.White(); // vertex colours carry the paint
  mat.specularColor = new Color3(0.25, 0.27, 0.3);
  mat.emissiveColor = new Color3(0.05, 0.06, 0.08);
  mesh.material = mat;
  return new PropModel(mesh, shadows, [0, 0.98 * TURRET_SCALE, 1.04 * TURRET_SCALE]);
}

function paint(mesh: Mesh, hex: string): void {
  const c = Color3.FromHexString(hex);
  const colors = new Float32Array(mesh.getTotalVertices() * 4);
  for (let i = 0; i < colors.length; i += 4) colors.set([c.r, c.g, c.b, 1], i);
  mesh.setVerticesData(VertexBuffer.ColorKind, colors);
}
