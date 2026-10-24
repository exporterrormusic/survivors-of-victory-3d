// Small, pooled 3D weapon effects. Geometry follows the world-space shot direction so
// silhouettes remain distinct at any camera angle; no per-shot textures or materials.
import { Color3, Mesh, MeshBuilder, StandardMaterial, Vector3, VertexData, type Scene } from '@babylonjs/core';
import { MeshPool } from './mesh-pool';
import type { World } from './world';
import type { WeaponStyle } from './abilities/types';

export type ProjectileLook = Exclude<WeaponStyle['kind'], 'sword' | 'beam'>;
interface Particle {
  mesh: Mesh; pool: MeshPool; age: number; duration: number;
  velocity: Vector3; scale: Vector3; expand: number; spin: number; alpha: number;
}

export class WeaponVfx {
  private readonly projectiles = new Map<string, MeshPool>();
  private readonly materials = new Map<string, StandardMaterial>();
  private readonly particles: Particle[] = [];
  private readonly sparkPool: MeshPool;
  private readonly puffPool: MeshPool;
  private readonly arcPool: MeshPool;
  private readonly charge: Mesh;

  constructor(private readonly scene: Scene, private readonly world: World) {
    const spark = MeshBuilder.CreateBox('weapon-spark-template', { size: 1 }, scene);
    const puff = MeshBuilder.CreateSphere('weapon-puff-template', { diameter: 1, segments: 6 }, scene);
    const arc = new Mesh('weapon-slash-template', scene);
    const positions: number[] = [], indices: number[] = [];
    // A tapered crescent, open at the ends rather than a filled targeting cone.
    for (let i = 0; i <= 32; i++) {
      const a = (i / 32 - .5) * Math.PI * .78;
      const inner = 1 - Math.sin(i / 32 * Math.PI) * .22;
      positions.push(Math.sin(a) * inner, 0, Math.cos(a) * inner, Math.sin(a), 0, Math.cos(a));
      if (i) { const n = i * 2; indices.push(n - 2, n, n - 1, n - 1, n, n + 1); }
    }
    const data = new VertexData();
    data.positions = positions; data.indices = indices;
    data.applyToMesh(arc);
    for (const mesh of [spark, puff, arc]) { mesh.isPickable = false; mesh.setEnabled(false); }
    this.sparkPool = new MeshPool(spark, 128);
    this.puffPool = new MeshPool(puff, 64);
    this.arcPool = new MeshPool(arc, 8);
    this.charge = MeshBuilder.CreateTorus('weapon-charge', { diameter: 1, thickness: .045, tessellation: 24 }, scene);
    this.charge.isPickable = false;
    this.charge.setEnabled(false);
    world.glow.addIncludedOnlyMesh(this.charge);
  }

  projectile(kind: ProjectileLook, from: Vector3, dir: Vector3, color: Color3, size = 1): { mesh: Mesh; pool: MeshPool } {
    const key = `${kind}:${color.toHexString()}`;
    let pool = this.projectiles.get(key);
    if (!pool) {
      const scene = this.scene;
      const rocket = kind === 'rocket', sniper = kind === 'sniper';
      const length = rocket ? .7 : sniper ? 1.8 : kind === 'shotgun' ? .32 : .6;
      const radius = rocket ? .13 : sniper ? .065 : .045;
      const body = MeshBuilder.CreateCylinder(`weapon-${kind}-body`, {
        height: length, diameterTop: 0, diameterBottom: radius * 2, tessellation: rocket ? 8 : 4,
      }, scene);
      body.rotation.x = Math.PI / 2;
      body.bakeCurrentTransformIntoVertices();
      body.material = this.material(rocket ? new Color3(.65, .58, .32) : color);
      const core = MeshBuilder.CreateBox(`weapon-${kind}-core`, { width: radius * .65, height: radius * .65, depth: length * .85 }, scene);
      core.material = this.material(new Color3(1, .97, .82));
      const pieces = [body, core];
      if (rocket) {
        for (const angle of [0, Math.PI / 2]) {
          const fin = MeshBuilder.CreateBox('rocket-fin', { width: .4, height: .035, depth: .22 }, scene);
          fin.position.z = -.22; fin.rotation.z = angle; fin.material = body.material;
          pieces.push(fin);
        }
        const exhaust = MeshBuilder.CreateCylinder('rocket-exhaust', { diameterTop: .13, diameterBottom: 0, height: .55, tessellation: 6 }, scene);
        exhaust.rotation.x = Math.PI / 2; exhaust.position.z = -.55;
        exhaust.material = this.material(color);
        pieces.push(exhaust);
      }
      const template = Mesh.MergeMeshes(pieces, true, true, undefined, false, true)!;
      template.name = `weapon-${kind}-template`;
      template.isPickable = false; template.setEnabled(false);
      pool = new MeshPool(template, 96);
      this.projectiles.set(key, pool);
    }
    const mesh = pool.acquire(`weapon-${kind}`);
    mesh.position.copyFrom(from); mesh.lookAt(from.add(dir)); mesh.scaling.setAll(size);
    this.world.glow.addIncludedOnlyMesh(mesh);
    return { mesh, pool };
  }

  muzzle(at: Vector3, dir: Vector3, color: Color3, heavy = false): void {
    const scale = new Vector3(heavy ? .24 : .12, heavy ? .24 : .12, heavy ? .7 : .35);
    const p = this.particle(this.sparkPool, at, color, scale, .065);
    p.mesh.lookAt(at.add(dir));
  }

  trail(at: Vector3, dir: Vector3, color: Color3, rocket: boolean): void {
    const p = this.particle(rocket ? this.puffPool : this.sparkPool, at,
      rocket ? new Color3(.38, .39, .43) : color,
      rocket ? new Vector3(.2, .2, .2) : new Vector3(.025, .025, .8), rocket ? .4 : .09);
    p.mesh.lookAt(at.add(dir)); p.expand = rocket ? 3 : 0;
    p.alpha = rocket ? .35 : .6;
    if (rocket) p.velocity.y = .35;
  }

  impact(at: Vector3, color: Color3, heavy = false): void {
    for (let i = 0; i < (heavy ? 7 : 3); i++) {
      const a = i * 2.399;
      const p = this.particle(this.sparkPool, at, color, new Vector3(.04, .04, heavy ? .35 : .18), heavy ? .25 : .12);
      p.velocity.set(Math.cos(a) * (heavy ? 3 : 1.5), .5 + (i % 3) * .5, Math.sin(a) * (heavy ? 3 : 1.5));
      p.mesh.lookAt(at.add(p.velocity));
    }
    if (heavy) {
      const p = this.particle(this.puffPool, at, color, new Vector3(.6, .6, .6), .25);
      p.expand = 4; p.alpha = .65;
    }
  }

  slash(at: Vector3, dir: Vector3, reach: number, color: Color3, reverse: boolean): void {
    const p = this.particle(this.arcPool, at.add(new Vector3(0, .75, 0)), color, new Vector3(reach, 1, reach), .2);
    p.mesh.rotation.y = Math.atan2(dir.x, dir.z) + (reverse ? .22 : -.22);
    p.spin = reverse ? -2.2 : 2.2;
    p.expand = .12;
    const core = this.particle(this.arcPool, p.mesh.position, new Color3(1, .9, .98), new Vector3(reach * .98, 1, reach * .98), .09);
    core.mesh.rotation.copyFrom(p.mesh.rotation); core.spin = p.spin;
  }

  charging(at: Vector3, dir: Vector3, progress: number, color: Color3): void {
    this.charge.setEnabled(progress > 0);
    if (progress <= 0) return;
    this.charge.position.copyFrom(at); this.charge.lookAt(at.add(dir));
    this.charge.rotation.x += Math.PI / 2;
    this.charge.scaling.setAll(.25 + (1 - progress) * .55);
    this.charge.material = this.material(color);
    this.charge.visibility = .3 + progress * .7;
  }

  stopCharge(): void { this.charge.setEnabled(false); }

  update(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.age += dt;
      if (p.age >= p.duration) { p.pool.release(p.mesh); this.particles.splice(i, 1); continue; }
      const t = p.age / p.duration;
      p.mesh.position.addInPlaceFromFloats(p.velocity.x * dt, p.velocity.y * dt, p.velocity.z * dt);
      p.mesh.rotation.y += p.spin * dt;
      p.mesh.scaling.copyFrom(p.scale).scaleInPlace(1 + t * p.expand);
      p.mesh.visibility = (1 - t) * p.alpha;
    }
  }

  private particle(pool: MeshPool, at: Vector3, color: Color3, scale: Vector3, duration: number): Particle {
    const mesh = pool.acquire('weapon-fx');
    mesh.position.copyFrom(at); mesh.material = this.material(color); mesh.scaling.copyFrom(scale);
    this.world.glow.addIncludedOnlyMesh(mesh);
    const p = { mesh, pool, age: 0, duration, velocity: new Vector3(), scale, expand: 0, spin: 0, alpha: 1 };
    this.particles.push(p);
    return p;
  }

  private material(color: Color3): StandardMaterial {
    const key = color.toHexString();
    let mat = this.materials.get(key);
    if (!mat) {
      mat = new StandardMaterial(`weapon-${key}`, this.scene);
      mat.emissiveColor = color; mat.disableLighting = true; mat.backFaceCulling = false;
      this.materials.set(key, mat);
    }
    return mat;
  }
}
