// Placeholder props for sites and exits (built from boxes until real art exists), plus their
// cyan rings: a site's ring fills as it's worked; a lift's ring fills as its gates cycle.

import { Color3, MeshBuilder, StandardMaterial, TransformNode, type Mesh, type Scene, type ShadowGenerator } from '@babylonjs/core';
import { GATE_CYCLE, type Exit, type ExitSet } from './exits';
import type { Site, SiteKind, SiteSet } from './sites';
import { TELL, type Tell, type TelegraphLayer } from './telegraph';

const CYAN = new Color3(.3, .9, 1);
const GOLD = new Color3(1, .72, .2);
const OFF = new Color3(0, 0, 0);

interface SiteProp { readonly site: Site; readonly glow: StandardMaterial[]; ring: Tell | null }
interface ExitProp {
  readonly exit: Exit;
  readonly gates: readonly Mesh[];
  readonly lights: StandardMaterial[];
  ring: Tell | null;
}

export class SiteView {
  private readonly root: TransformNode;
  private readonly siteProps: SiteProp[] = [];
  private readonly exitProps: ExitProp[] = [];
  private readonly materials = new Map<string, StandardMaterial>();
  private readonly scene: Scene;
  private readonly shadows: ShadowGenerator;
  private readonly tells: TelegraphLayer;

  constructor(scene: Scene, shadows: ShadowGenerator, tells: TelegraphLayer, sites: SiteSet, exits: ExitSet) {
    this.scene = scene;
    this.shadows = shadows;
    this.tells = tells;
    this.root = new TransformNode('sortie-props', scene);
    for (const exit of exits.exits) this.exitProps.push(this.buildExit(exit));
    for (const site of sites.sites) this.siteProps.push({ site, glow: this.buildSite(site), ring: null });
  }

  update(): void {
    for (const prop of this.siteProps) {
      const { site } = prop;
      // A shaft's own ring gives way to the lift ring once restored.
      const show = !site.done;
      if (show && !prop.ring) prop.ring = this.tells.circle(site.x, site.z, site.radius, TELL.friendly, site.kind === 'priority' ? .95 : .75);
      if (!show && prop.ring) { this.tells.release(prop.ring); prop.ring = null; }
      if (prop.ring) prop.ring.fill = site.fraction;
      if (site.done) for (const m of prop.glow) m.emissiveColor = OFF;
    }
    for (const prop of this.exitProps) {
      const { exit } = prop;
      if (exit.active && !prop.ring) prop.ring = this.tells.circle(exit.x, exit.z, exit.platformRadius, TELL.friendly, .6);
      if (prop.ring) prop.ring.fill = exit.boarding / GATE_CYCLE;
      for (const m of prop.lights) m.emissiveColor = exit.active ? CYAN : OFF;
      // Gates slide in from beyond the platform's sides as the cycle runs.
      const closed = exit.boarding / GATE_CYCLE;
      prop.gates.forEach((gate, i) => { gate.position.x = (i ? 1 : -1) * (4.45 - 2.95 * closed); });
    }
  }

  dispose(): void {
    for (const prop of [...this.siteProps, ...this.exitProps]) if (prop.ring) this.tells.release(prop.ring);
    this.root.dispose(false, true);
  }

  // --- building ----------------------------------------------------------------------------

  private material(key: string, hex: string, emissive?: Color3): StandardMaterial {
    const shared = !emissive;
    if (shared && this.materials.has(key)) return this.materials.get(key)!;
    const m = new StandardMaterial(`sortie-${key}`, this.scene);
    m.diffuseColor = Color3.FromHexString(hex);
    m.specularColor = new Color3(.08, .08, .08);
    if (emissive) m.emissiveColor = emissive.clone();
    if (shared) this.materials.set(key, m);
    return m;
  }

  private box(parent: TransformNode, w: number, h: number, d: number, x: number, y: number, z: number, material: StandardMaterial, cast = true): Mesh {
    const mesh = MeshBuilder.CreateBox('sortie-box', { width: w, height: h, depth: d }, this.scene);
    mesh.parent = parent;
    mesh.position.set(x, y, z);
    mesh.material = material;
    mesh.isPickable = false;
    mesh.receiveShadows = true;
    if (cast) this.shadows.addShadowCaster(mesh);
    return mesh;
  }

  private node(x: number, z: number, yaw = 0): TransformNode {
    const node = new TransformNode('sortie-prop', this.scene);
    node.parent = this.root;
    node.position.set(x, 0, z);
    node.rotation.y = yaw;
    return node;
  }

  private buildSite(site: Site): StandardMaterial[] {
    const yaw = ((site.x * 7.3 + site.z * 3.1) % 6.28);
    const n = this.node(site.x, site.z, site.kind === 'shaft' ? 0 : yaw);
    const glow: StandardMaterial[] = [];
    const lit = (key: string, hex: string, color: Color3) => { const m = this.material(key, hex, color); glow.push(m); return m; };
    const kinds: Record<SiteKind, () => void> = {
      cache: () => {
        this.box(n, 1.1, .75, .75, 0, .375, 0, this.material('crate', '#3e4b3c'));
        this.box(n, 1.13, .08, .78, 0, .56, 0, lit('cache-stripe', '#2a3a3e', CYAN), false);
      },
      priority: () => {
        this.box(n, 1.6, 1, 1, 0, .5, 0, this.material('priority', '#2c3135'));
        this.box(n, 1.63, .1, 1.03, 0, .78, 0, lit('priority-stripe', '#3a3020', GOLD), false);
      },
      wreck: () => {
        this.box(n, 3.6, 1.3, 1.9, 0, .65, 0, this.material('wreck', '#3a3d3a'));
        this.box(n, 1.4, 1.7, 1.9, 2.4, .85, 0, this.material('wreck-cab', '#30342f'));
      },
      shaft: () => {
        // the tower stands behind its platform; the platform itself is built with the exit
        this.box(n, 2.4, 14, 2.4, 0, 7, 4.6, this.material('tower', '#2b2f33'));
      },
      terminal: () => {
        this.box(n, .7, 1.5, .45, 0, .75, 0, this.material('terminal', '#262b2f'));
        this.box(n, .55, .45, .05, 0, 1.15, .24, lit('terminal-screen', '#10303a', CYAN), false);
      },
      scrambler: () => {
        this.box(n, .9, .4, .9, 0, .2, 0, this.material('scrambler', '#2b2f33'));
        this.box(n, .18, 3, .18, 0, 1.9, 0, this.material('mast', '#3b4145'));
        this.box(n, .3, .3, .3, 0, 3.45, 0, lit('scrambler-tip', '#401010', new Color3(1, .25, .2)), false);
      },
      med: () => {
        this.box(n, .9, .6, .6, 0, .3, 0, this.material('med', '#d9dcdc'));
        this.box(n, .5, .12, .62, 0, .45, 0, lit('med-cross', '#601010', new Color3(1, .2, .2)), false);
      },
      module: () => {
        this.box(n, 1, .5, .6, 0, .25, 0, this.material('module', '#24292d'));
        this.box(n, 1.02, .06, .62, 0, .4, 0, lit('module-stripe', '#10303a', CYAN), false);
      },
    };
    kinds[site.kind]();
    return glow;
  }

  private buildExit(exit: Exit): ExitProp {
    const n = this.node(exit.x, exit.z);
    this.box(n, 6, .16, 6, 0, .08, 0, this.material('platform', '#2a2e31'), false);
    const hazard = this.material('hazard', '#d9a92a');
    for (const [w, d, x, z] of [[6, .3, 0, 2.85], [6, .3, 0, -2.85], [.3, 6, 2.85, 0], [.3, 6, -2.85, 0]] as const) {
      this.box(n, w, .05, d, x, .18, z, hazard, false);
    }
    const lights: StandardMaterial[] = [];
    for (const side of [-1, 1]) {
      const m = this.material(`lift-light-${exit.id}-${side}`, '#16242a', exit.active ? CYAN : OFF);
      lights.push(m);
      this.box(n, .12, .08, 5.2, side * 2.55, .2, 0, m, false);
    }
    if (exit.kind === 'shaft') {
      // light strips up the tower's front corners, dark until restored
      for (const side of [-1, 1]) {
        const m = this.material(`tower-light-${exit.id}-${side}`, '#16242a', OFF);
        lights.push(m);
        this.box(n, .14, 13, .14, side * 1.25, 6.8, 3.35, m, false);
      }
    }
    // frame posts and the two sliding gates on the far edge
    const steel = this.material('lift-frame', '#4a5257');
    for (const x of [-3, 3]) this.box(n, .2, 1.4, .2, x, .7, 3, steel);
    const gates = [-1, 1].map((side) => this.box(n, 2.9, 1.1, .1, side * 4.45, .7, 3, this.material('gate', '#c7a23a')));
    return { exit, gates, lights, ring: null };
  }
}
