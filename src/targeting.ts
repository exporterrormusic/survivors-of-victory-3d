// Ground indicators for aiming: skillshot lines, circles with a range ring, dash arrows, cones,
// and the attack-range ring shown while choosing an attack-move target.

import { Color3, Mesh, MeshBuilder, Scene, StandardMaterial, Vector3 } from '@babylonjs/core';
import type { SlotInfo } from './abilities/types';
import { createSector } from './sector';

const Y = 0.05;

export class Indicators {
  private readonly line: Mesh; // unit quad from the origin along +Z
  private readonly disc: Mesh; // unit-radius disc, flat
  private readonly rings = new Map<number, Mesh>(); // range rings, one per radius
  private readonly sectors = new Map<number, Mesh>(); // cones, one per width
  private readonly mat: StandardMaterial;
  private readonly ringMat: StandardMaterial;

  constructor(private readonly scene: Scene) {
    this.mat = new StandardMaterial('indicator-mat', scene);
    this.mat.emissiveColor = new Color3(0.55, 0.85, 1);
    this.mat.disableLighting = true;
    this.mat.alpha = 0.28;
    this.mat.backFaceCulling = false;
    this.ringMat = this.mat.clone('indicator-ring-mat');
    this.ringMat.alpha = 0.6;

    this.line = MeshBuilder.CreateGround('indicator-line', { width: 1, height: 1 }, scene);
    this.line.position.z = 0.5;
    this.line.bakeCurrentTransformIntoVertices();
    this.disc = MeshBuilder.CreateDisc('indicator-disc', { radius: 1, tessellation: 48 }, scene);
    this.disc.rotation.x = Math.PI / 2;
    this.disc.bakeCurrentTransformIntoVertices();
    for (const m of [this.line, this.disc]) {
      m.material = this.mat;
      m.isPickable = false;
      m.setEnabled(false);
    }
  }

  /** Show the indicator for `spec` (or the attack-move ring) from `hero` toward `cursor`. */
  show(spec: SlotInfo | { attackRange: number }, hero: Vector3, cursor: Vector3): void {
    this.hide();
    if ('attackRange' in spec) {
      this.ring(hero, spec.attackRange);
      return;
    }
    const dx = cursor.x - hero.x;
    const dz = cursor.z - hero.z;
    const dist = Math.hypot(dx, dz);
    const yaw = Math.atan2(dx, dz);
    const reach = Math.min(spec.range, dist);
    const end = dist > 1e-3
      ? new Vector3(hero.x + (dx / dist) * reach, Y, hero.z + (dz / dist) * reach)
      : new Vector3(hero.x, Y, hero.z);

    if (spec.aim === 'line') {
      this.placeLine(hero, yaw, spec.width ?? 1, spec.range);
    } else if (spec.aim === 'dash') {
      this.placeLine(hero, yaw, spec.width ?? 1, reach);
      this.placeDisc(end, 0.7);
      this.ring(hero, spec.range);
    } else if (spec.aim === 'circle') {
      this.placeDisc(end, spec.radius ?? 1);
      this.ring(hero, spec.range);
    } else if (spec.aim === 'cone') {
      this.placeSector(hero, yaw, spec.angle ?? Math.PI / 3, spec.range);
    }
  }

  hide(): void {
    this.line.setEnabled(false);
    this.disc.setEnabled(false);
    for (const r of this.rings.values()) r.setEnabled(false);
    for (const s of this.sectors.values()) s.setEnabled(false);
  }

  private placeSector(from: Vector3, yaw: number, angle: number, range: number): void {
    let sector = this.sectors.get(angle);
    if (!sector) {
      sector = createSector(`indicator-cone-${angle.toFixed(2)}`, angle, this.scene);
      sector.material = this.mat;
      this.sectors.set(angle, sector);
    }
    sector.position.set(from.x, Y, from.z);
    sector.rotation.y = yaw;
    sector.scaling.set(range, 1, range);
    sector.setEnabled(true);
  }

  private placeLine(from: Vector3, yaw: number, width: number, length: number): void {
    this.line.position.set(from.x, Y, from.z);
    this.line.rotation.y = yaw;
    this.line.scaling.set(width, 1, length);
    this.line.setEnabled(true);
  }

  private placeDisc(at: Vector3, radius: number): void {
    this.disc.position.set(at.x, Y + 0.01, at.z);
    this.disc.scaling.set(radius, 1, radius);
    this.disc.setEnabled(true);
  }

  private ring(at: Vector3, radius: number): void {
    let r = this.rings.get(radius);
    if (!r) {
      r = MeshBuilder.CreateTorus(`range-${radius}`, { diameter: radius * 2, thickness: 0.07, tessellation: 96 }, this.scene);
      r.material = this.ringMat;
      r.isPickable = false;
      this.rings.set(radius, r);
    }
    r.position.set(at.x, Y, at.z);
    r.setEnabled(true);
  }
}
