// Primitive-built Seven Dwarves launcher and rocket. Local forward is +Z.
// Reference, generated surface atlas and exact prompt: assets/weapons-source/snow-white/.
import {
  Color3, Constants, Mesh, MeshBuilder, StandardMaterial, Texture, TransformNode, Vector3, VertexBuffer, VertexData,
  type Scene, type ShadowGenerator,
} from '@babylonjs/core';

export const LAUNCHER_HEAD_HEIGHT = 1.04;
export const ROCKET_EXHAUST_Z = -.31;
/** Exaggerated slightly so the casing and fins read from the survivor camera. */
export const ROCKET_VISUAL_SCALE = 1.6;
export const ROCKET_COLORS = {
  hot: [1, .94, .72] as const,
  flame: [1, .55, .12] as const,
  smoke: [.45, .44, .41] as const,
};
type Tile = 'armor' | 'mechanism' | 'markings' | 'rocket';
type Materials = ReturnType<typeof makeMaterials>;
interface ModelOptions {
  shadows?: ShadowGenerator;
  glow?: (mesh: Mesh) => void;
  /** Neutral geometry capture; never used by the live kit. */
  blockout?: boolean;
}
const cache = new WeakMap<Scene, Materials>();
const blockoutCache = new WeakMap<Scene, Materials>();

export function weaponMaterials(scene: Scene, blockout = false): Materials {
  const materials = blockout ? blockoutCache : cache;
  let m = materials.get(scene);
  if (!m) { m = makeMaterials(scene, blockout); materials.set(scene, m); }
  return m;
}

function makeMaterials(scene: Scene, blockout: boolean) {
  const solid = (name: string, color: string, emission = 0) => {
    const m = new StandardMaterial(`sw-${name}${blockout ? '-blockout' : ''}`, scene);
    m.diffuseColor = Color3.FromHexString(color);
    m.specularColor.set(.18, .19, .2);
    m.specularPower = 56;
    if (emission) { m.emissiveColor = m.diffuseColor.scale(emission); m.disableLighting = true; }
    return m;
  };
  const paint = solid('weapon-paint', '#ffffff');
  let atlas: Texture | null = null;
  if (!blockout) {
    atlas = new Texture(`${import.meta.env.BASE_URL}weapons/snow-white/surface-atlas-v1.webp`, scene);
    atlas.wrapU = atlas.wrapV = Texture.CLAMP_ADDRESSMODE;
    atlas.anisotropicFilteringLevel = 8;
    paint.diffuseTexture = atlas;
  }
  const flame = solid('rocket-flame', '#ff790d', 1.4);
  flame.alpha = .8; flame.alphaMode = Constants.ALPHA_ADD;
  flame.disableDepthWrite = true;
  return {
    paint, atlas,
    armor: solid('blockout-armor', '#dce0df'),
    mechanism: solid('blockout-mechanism', '#30363d'),
    rubber: solid('weapon-recess', '#131920'),
    steel: solid('weapon-steel', '#737d86'),
    brass: solid('weapon-brass', '#c6a14c'),
    cap: solid('missile-cap', '#8d4034'),
    lamp: solid('weapon-amber', '#ffcf3c', 1),
    spent: solid('weapon-lamp-off', '#393322'),
    flame,
    hot: solid('rocket-flame-core', '#fff0b0', 1.5),
  };
}

/** Eight-sided extruded plate with a real bevel around the front and back faces. */
function plate(name: string, w: number, h: number, d: number, scene: Scene): Mesh {
  const cut = Math.min(w, h) * .17;
  const bevel = Math.min(d * .22, .025);
  const outline = [
    [-w / 2 + cut, -h / 2], [w / 2 - cut, -h / 2], [w / 2, -h / 2 + cut], [w / 2, h / 2 - cut],
    [w / 2 - cut, h / 2], [-w / 2 + cut, h / 2], [-w / 2, h / 2 - cut], [-w / 2, -h / 2 + cut],
  ];
  const positions: number[] = [], indices: number[] = [], normals: number[] = [];
  for (const [z, inset] of [[-d / 2, bevel], [-d / 2 + bevel, 0], [d / 2 - bevel, 0], [d / 2, bevel]]) {
    for (const [x, y] of outline) positions.push(x * (1 - inset * 2 / w), y * (1 - inset * 2 / h), z);
  }
  // Babylon's default left-handed clockwise front faces.
  for (let i = 1; i < 7; i++) { indices.push(0, i, i + 1); indices.push(24, 24 + i + 1, 24 + i); }
  for (let r = 0; r < 3; r++) for (let i = 0; i < 8; i++) {
    const a = r * 8 + i, b = r * 8 + (i + 1) % 8;
    indices.push(a, a + 8, b, b, a + 8, b + 8);
  }
  VertexData.ComputeNormals(positions, indices, normals);
  const data = new VertexData(); data.positions = positions; data.indices = indices; data.normals = normals;
  data.uvs = new Float32Array(positions.length / 3 * 2);
  const mesh = new Mesh(name, scene); data.applyToMesh(mesh); mesh.convertToFlatShadedMesh();
  return mesh;
}

/** Each part gets a padded, face-local patch of the generated four-surface atlas. */
function texturePart(mesh: Mesh, tile: Tile) {
  mesh.convertToFlatShadedMesh();
  const p = mesh.getVerticesData(VertexBuffer.PositionKind)!;
  const n = mesh.getVerticesData(VertexBuffer.NormalKind)!;
  const uv = new Float32Array(p.length / 3 * 2);
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < p.length; i++) { const k = i % 3; min[k] = Math.min(min[k], p[i]); max[k] = Math.max(max[k], p[i]); }
  const column = tile === 'mechanism' || tile === 'rocket' ? 1 : 0;
  const row = tile === 'markings' || tile === 'rocket' ? 1 : 0;
  for (let i = 0; i < p.length / 3; i++) {
    const dominant = Math.abs(n[i * 3 + 1]) > Math.abs(n[i * 3]) && Math.abs(n[i * 3 + 1]) > Math.abs(n[i * 3 + 2]) ? 1
      : Math.abs(n[i * 3]) > Math.abs(n[i * 3 + 2]) ? 0 : 2;
    const a = dominant === 0 ? 2 : 0, b = dominant === 1 ? 2 : 1;
    const u = (p[i * 3 + a] - min[a]) / Math.max(.0001, max[a] - min[a]);
    const v = (p[i * 3 + b] - min[b]) / Math.max(.0001, max[b] - min[b]);
    uv[i * 2] = (column + .035 + u * .93) / 2;
    uv[i * 2 + 1] = (1 - row + .035 + v * .93) / 2;
  }
  mesh.setVerticesData(VertexBuffer.UVKind, uv);
}

function builder(scene: Scene, materials: Materials, options: ModelOptions) {
  const groups = new Map<TransformNode, Mesh[]>();
  const add = (mesh: Mesh, parent: TransformNode, surface: Tile | StandardMaterial, x = 0, y = 0, z = 0) => {
    mesh.parent = parent; mesh.position.set(x, y, z); mesh.isPickable = false; mesh.receiveShadows = true;
    if (typeof surface === 'string') {
      texturePart(mesh, surface);
      mesh.material = options.blockout ? (surface === 'mechanism' ? materials.mechanism : materials.armor) : materials.paint;
    } else mesh.material = surface;
    const list = groups.get(parent) ?? []; list.push(mesh); groups.set(parent, list);
    return mesh;
  };
  const box = (name: string, parent: TransformNode, surface: Tile | StandardMaterial, size: number[], at: number[]) =>
    add(MeshBuilder.CreateBox(name, { width: size[0], height: size[1], depth: size[2] }, scene), parent, surface, ...at as [number, number, number]);
  const panel = (name: string, parent: TransformNode, surface: Tile | StandardMaterial, size: number[], at: number[]) =>
    add(plate(name, size[0], size[1], size[2], scene), parent, surface, ...at as [number, number, number]);
  const cylinder = (name: string, parent: TransformNode, surface: Tile | StandardMaterial, diameter: number, height: number, at: number[], forward = false, tip?: number) => {
    const mesh = add(MeshBuilder.CreateCylinder(name, { diameter, diameterTop: tip ?? diameter, height, tessellation: 12 }, scene), parent, surface, ...at as [number, number, number]);
    if (forward) mesh.rotation.x = Math.PI / 2;
    return mesh;
  };
  // Merge by material under each moving part. The model stays inexpensive even with bevels,
  // tube rims and pistons; the yaw/head/launch sockets remain independent transforms.
  const finish = () => {
    const result: Mesh[] = [];
    for (const [parent, meshes] of groups) {
      const byMaterial = new Map<StandardMaterial, Mesh[]>();
      for (const mesh of meshes) {
        const mat = mesh.material as StandardMaterial;
        const list = byMaterial.get(mat) ?? []; list.push(mesh); byMaterial.set(mat, list);
        // Bake only the part-local transform, independent of parent pose.
        mesh.parent = null; mesh.computeWorldMatrix(true);
      }
      for (const [material, parts] of byMaterial) {
        const merged = Mesh.MergeMeshes(parts, true, true, undefined, false, false)!;
        merged.name = `${parent.name}-${material.name}`; merged.parent = parent;
        merged.isPickable = false; merged.receiveShadows = !material.disableLighting;
        if (material.disableLighting) options.glow?.(merged);
        else options.shadows?.addShadowCaster(merged, false);
        result.push(merged);
      }
    }
    return result;
  };
  return { add, box, panel, cylinder, finish };
}

export function buildSnowWhiteLauncher(scene: Scene, options: ModelOptions = {}) {
  const m = weaponMaterials(scene, options.blockout);
  const b = builder(scene, m, options);
  const root = new TransformNode('sw-turret', scene);
  const yaw = new TransformNode('sw-turret-yaw', scene); yaw.parent = root; yaw.position.y = LAUNCHER_HEAD_HEIGHT;
  const head = new TransformNode('sw-turret-head', scene); head.parent = yaw;
  // Open mechanical stand and spread skids, echoing the weapon's exposed support legs.
  b.cylinder('sw-bearing-foot', root, 'mechanism', .46, .12, [0, .13, 0]);
  b.cylinder('sw-support-column', root, 'mechanism', .19, .72, [0, .52, -.04]);
  b.cylinder('sw-turntable', root, m.steel, .35, .08, [0, .86, -.04]);
  for (const side of [-1, 1]) {
    const strut = b.box('sw-splayed-strut', root, 'mechanism', [.12, .62, .14], [side * .22, .35, -.03]);
    strut.rotation.z = side * .52;
    const piston = b.cylinder('sw-leg-piston', root, m.steel, .055, .43, [side * .2, .39, .085]);
    piston.rotation.z = side * .52;
    b.panel('sw-skid', root, 'mechanism', [.21, .1, .62], [side * .38, .07, .08]);
    b.panel('sw-skid-armor', root, 'armor', [.17, .06, .33], [side * .38, .135, .18]);
    b.panel('sw-knee', root, 'armor', [.19, .28, .13], [side * .13, .57, .10]).rotation.z = side * .35;
  }
  b.panel('sw-rear-stabilizer', root, 'mechanism', [.24, .1, .3], [0, .07, -.34]);
  // Tall central spine, narrow illuminated slit, and the overhanging white crown.
  b.panel('sw-spine', head, 'mechanism', [.28, .82, .42], [0, -.02, -.015]);
  b.panel('sw-spine-top', head, 'armor', [.31, .18, .62], [0, .48, -.08]).rotation.x = -.13;
  b.panel('sw-spine-light-well', head, m.rubber, [.15, .57, .035], [0, .035, .215]);
  b.box('sw-spine-light', head, m.lamp, [.045, .47, .014], [0, .07, .239]);
  b.box('sw-spine-light-guard', head, m.brass, [.075, .075, .03], [0, -.22, .242]);
  b.panel('sw-rear-controller', head, 'mechanism', [.3, .51, .18], [0, .01, -.3]);
  const pods: TransformNode[] = [];
  const sockets: TransformNode[] = [];
  const caps: Mesh[] = [];
  for (const side of [-1, 1]) {
    const pod = new TransformNode(`sw-pod-${side}`, scene); pod.parent = head;
    pod.position.set(side * .43, .1, 0); pod.rotation.z = -side * .16;
    pods.push(pod);
    b.panel('sw-pod-chassis', pod, 'mechanism', [.57, .56, .68], [0, .08, -.055]);
    // The swept shoulders are large white planes above the triangular launch cells.
    b.panel('sw-pod-shoulder', pod, 'armor', [.57, .24, .76], [0, .36, -.10]).rotation.x = -.19;
    b.panel('sw-pod-outer-cheek', pod, 'armor', [.12, .33, .58], [side * .28, .10, -.06]).rotation.z = side * .12;
    b.panel('sw-launch-face', pod, m.rubber, [.52, .39, .055], [0, .055, .31]);
    for (const [x, y] of [[-.135, .025], [0, .17], [.135, .025]]) {
      b.cylinder('sw-launch-rim', pod, m.steel, .168, .035, [x, y, .356], true);
      b.cylinder('sw-launch-bore', pod, m.rubber, .139, .039, [x, y, .378], true);
      // Separate red caps recess into the tubes and disappear in firing order.
      const cap = MeshBuilder.CreateCylinder('sw-loaded-missile', { diameter: .109, height: .016, tessellation: 12 }, scene);
      cap.parent = pod; cap.position.set(x, y, .399); cap.rotation.x = Math.PI / 2; cap.material = m.cap; cap.isPickable = false;
      caps.push(cap);
      const socket = new TransformNode('sw-launch-socket', scene); socket.parent = pod; socket.position.set(x, y, .43); sockets.push(socket);
      // Small key notch on the face keeps each tube legible without extra emissive rings.
      b.box('sw-launch-key', pod, m.brass, [.024, .025, .014], [x, y - .073, .399]);
    }
    // Hanging split shields are the most distinctive part of the reference silhouette.
    b.panel('sw-lower-shield-frame', pod, 'mechanism', [.53, .66, .17], [side * .025, -.46, .08]).rotation.z = side * .13;
    b.panel('sw-upper-shield', pod, 'markings', [.42, .245, .06], [0, -.27, .185]).rotation.z = side * .13;
    b.panel('sw-lower-shield', pod, 'armor', [.36, .32, .065], [side * .055, -.565, .193]).rotation.z = side * .23;
    b.box('sw-shield-rail', pod, m.steel, [.035, .47, .04], [-side * .22, -.44, .19]).rotation.z = side * .13;
    b.panel('sw-rear-pod-cover', pod, 'armor', [.43, .41, .055], [0, .075, -.423]);
    for (let i = 0; i < 4; i++) b.box('sw-rear-vent', pod, m.rubber, [.25, .022, .012], [0, .16 - i * .055, -.456]);
    b.cylinder('sw-side-hinge', pod, m.steel, .13, .12, [-side * .26, -.23, -.02]).rotation.z = Math.PI / 2;
  }
  const meshes = b.finish();
  const pips: Mesh[] = [];
  for (let i = 0; i < 8; i++) {
    const pip = MeshBuilder.CreateBox('sw-ammo-lamp', { width: .04, height: .035, depth: .018 }, scene);
    pip.parent = head; pip.position.set((i % 4 - 1.5) * .057, .13 - Math.floor(i / 4) * .055, -.399); pip.material = m.lamp; pip.isPickable = false;
    pip.setEnabled(i < 4);
    pips.push(pip); options.glow?.(pip);
  }
  return { root, yaw, head, pods, sockets, caps, pips, meshes: [...meshes, ...caps, ...pips] };
}

export function buildSnowWhiteMissile(scene: Scene, options: ModelOptions = {}) {
  const m = weaponMaterials(scene, options.blockout);
  const b = builder(scene, m, options);
  const root = new TransformNode('sw-missile', scene);
  root.scaling.setAll(ROCKET_VISUAL_SCALE);
  // Physical white casing, dark pointed seeker and four broad fins; only the exhaust glows.
  b.cylinder('sw-rocket-casing', root, 'rocket', .115, .37, [0, 0, 0], true);
  b.cylinder('sw-rocket-nose-collar', root, m.steel, .116, .035, [0, 0, .19], true);
  b.cylinder('sw-rocket-nose', root, 'mechanism', .115, .15, [0, 0, .28], true, .012);
  b.cylinder('sw-rocket-tail', root, 'mechanism', .105, .09, [0, 0, -.22], true);
  b.cylinder('sw-rocket-nozzle', root, m.steel, .075, .035, [0, 0, -.278], true);
  b.cylinder('sw-rocket-nozzle-hole', root, m.rubber, .052, .008, [0, 0, -.301], true);
  // Four swept plates give a readable cruciform silhouette.
  for (let i = 0; i < 4; i++) {
    const blade = b.panel('sw-rocket-fin-blade', root, 'armor', [.012, .15, .17], [0, 0, -.15]);
    const angle = i * Math.PI / 2;
    blade.position.x = Math.sin(angle) * .072;
    blade.position.y = Math.cos(angle) * .072;
    blade.rotation.z = -angle;
  }
  const meshes = b.finish();
  const exhaust = new TransformNode('sw-missile-exhaust', scene); exhaust.parent = root; exhaust.position.z = ROCKET_EXHAUST_Z;
  const flame = MeshBuilder.CreateCylinder('sw-short-exhaust', { diameterTop: .085, diameterBottom: 0, height: .28, tessellation: 12 }, scene);
  flame.parent = exhaust; flame.rotation.x = Math.PI / 2; flame.position.z = -.14; flame.material = m.flame; flame.isPickable = false;
  const core = MeshBuilder.CreateCylinder('sw-exhaust-core', { diameterTop: .052, diameterBottom: .009, height: .13, tessellation: 10 }, scene);
  core.parent = exhaust; core.rotation.x = Math.PI / 2; core.position.z = -.065; core.material = m.hot; core.isPickable = false;
  options.glow?.(flame); options.glow?.(core);
  return { root, exhaust, flame, meshes: [...meshes, flame, core] };
}
