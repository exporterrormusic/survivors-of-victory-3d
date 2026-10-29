import { Matrix, Node, Quaternion, Scene, TransformNode, Vector3 } from '@babylonjs/core';

interface Panel {
  node: TransformNode; tip: Vector3; rest: Quaternion;
  point: Vector3; previous: Vector3; anchor: Vector3; target: Vector3; length: number;
}
interface Capsule { a: Vector3; b: Vector3; radius: number }

/** Lightweight spring panels with swept thigh colliders. Runs after animated
 * poses and the twin-stick rig, before skeleton matrices are sent to the GPU. */
export class WellsCoatPhysics {
  enabled = true;
  readonly stats = { panels: 0, contacts: 0, maxSwing: 0, resets: 0 };
  private initialized = false;
  private previousStep = 1 / 120;
  private lastAnchor = Vector3.Zero();
  private panels: Panel[] = [];
  private readonly legs: [TransformNode, TransformNode][] = [];

  constructor(private readonly nodes: Map<string, TransformNode>) {
    for (let i = 0; i < 11; i++) {
      const name = i.toString().padStart(2, '0');
      const node = nodes.get(`Wells_Hem_${name}`), tip = nodes.get(`Wells_HemTip_${name}`);
      if (!node || !tip) continue;
      const rest = node.rotationQuaternion?.clone() ?? Quaternion.FromEulerVector(node.rotation);
      node.rotationQuaternion = rest.clone();
      this.panels.push({ node, tip: tip.position.clone(), rest, point: Vector3.Zero(), previous: Vector3.Zero(), anchor: Vector3.Zero(), target: Vector3.Zero(), length: 0 });
    }
    for (const side of ['L', 'R']) {
      const thigh = nodes.get(`Bip001 ${side} Thigh`), knee = nodes.get(`Bip001 ${side} Calf`);
      if (thigh && knee) this.legs.push([thigh, knee]);
    }
    this.stats.panels = this.panels.length;
  }

  reset(): void { this.initialized = false; }

  private refresh(node: TransformNode): void {
    const chain: TransformNode[] = [];
    for (let n: Node | null = node; n; n = n.parent) if (n instanceof TransformNode) chain.push(n);
    for (let i = chain.length - 1; i >= 0; i--) chain[i].computeWorldMatrix(true);
  }

  step(dt: number): void {
    if (!this.enabled || !this.panels.length || !Number.isFinite(dt) || dt <= 0) return;
    for (const p of this.panels) {
      p.node.rotationQuaternion!.copyFrom(p.rest);
      this.refresh(p.node);
      p.anchor.copyFrom(p.node.getAbsolutePosition());
      Vector3.TransformCoordinatesToRef(p.tip, p.node.getWorldMatrix(), p.target);
      p.length = Vector3.Distance(p.anchor, p.target);
    }
    const anchor = this.panels[5].anchor;
    const scale = this.panels[5].length / .30;
    if (!this.initialized || dt > .25 || Vector3.Distance(anchor, this.lastAnchor) > .8 * scale) {
      for (const p of this.panels) { p.point.copyFrom(p.target); p.previous.copyFrom(p.target); }
      this.initialized = true; this.stats.resets++;
    }
    this.lastAnchor.copyFrom(anchor);
    const capsules: Capsule[] = this.legs.map(([thigh, knee]) => {
      this.refresh(thigh); this.refresh(knee);
      const a = thigh.getAbsolutePosition().clone(), b = knee.getAbsolutePosition().clone();
      return { a, b, radius: Vector3.Distance(a, b) * .40 + .035 * scale };
    });
    const steps = Math.max(1, Math.ceil(Math.min(dt, .05) / (1 / 120)));
    const h = Math.min(dt, .05) / steps;
    this.stats.contacts = 0; this.stats.maxSwing = 0;
    for (let step = 0; step < steps; step++) {
      const predicted: Vector3[] = [];
      for (const p of this.panels) {
        const velocity = p.point.subtract(p.previous).scaleInPlace(Math.exp(-12 * h) * h / this.previousStep);
        p.previous.copyFrom(p.point);
        p.point.addInPlace(velocity).addInPlace(p.target.subtract(p.point).scaleInPlace(65 * h * h));
        p.point.y -= .45 * scale * h * h;
        predicted.push(p.point.clone());
      }
      for (let iteration = 0; iteration < 8; iteration++) {
        // Adjacent panels share fabric: resist stretching without closing the
        // front opening or tying the two front corners together.
        for (let i = 1; i < this.panels.length; i++) {
          const a = this.panels[i - 1], b = this.panels[i];
          const delta = b.point.subtract(a.point), length = delta.length();
          const limit = Vector3.Distance(a.target, b.target) * 1.20;
          if (length > limit) {
            const correction = delta.scale((length - limit) / length * .35);
            a.point.addInPlace(correction); b.point.subtractInPlace(correction);
          }
        }
        for (const p of this.panels) {
          const direction = p.point.subtract(p.anchor).normalize();
          const rest = p.target.subtract(p.anchor).normalize();
          const angle = Math.acos(Math.max(-1, Math.min(1, Vector3.Dot(direction, rest))));
          if (angle > 1.30) direction.copyFrom(Vector3.Lerp(rest, direction, 1.30 / angle).normalize());
          p.point.copyFrom(p.anchor).addInPlace(direction.scaleInPlace(p.length));
          // Test the entire panel, not only its tip, against both moving thighs.
          for (const t of [.35, .6, .8, 1]) for (const c of capsules) {
            const sample = Vector3.Lerp(p.anchor, p.point, t);
            const axis = c.b.subtract(c.a);
            const along = Math.max(0, Math.min(1, Vector3.Dot(sample.subtract(c.a), axis) / Math.max(1e-8, axis.lengthSquared())));
            const closest = c.a.add(axis.scale(along));
            const normal = sample.subtract(closest), distance = normal.length();
            if (distance < c.radius && distance > 1e-6) {
              p.point.addInPlace(normal.scale((c.radius - distance) / distance / t));
              // Bones rotate at a fixed length. Solve against that actual
              // length, not an extended particle the renderer cannot reach.
              this.keepLength(p);
              this.stats.contacts++;
            }
          }
        }
        // The skinned fabric spans adjacent bones. A thigh can pass between
        // two clear centerlines at maximum stride, so solve the intervening
        // strips as well, distributing each contact to both panel endpoints.
        for (let i = 1; i < this.panels.length; i++) {
          const a = this.panels[i - 1], b = this.panels[i];
          for (const u of [.33, .67]) for (const t of [.4, .7, 1]) for (const c of capsules) {
            const anchor = Vector3.Lerp(a.anchor, b.anchor, u);
            const tip = Vector3.Lerp(a.point, b.point, u);
            const sample = Vector3.Lerp(anchor, tip, t);
            const axis = c.b.subtract(c.a);
            const along = Math.max(0, Math.min(1, Vector3.Dot(sample.subtract(c.a), axis) / Math.max(1e-8, axis.lengthSquared())));
            const normal = sample.subtract(c.a.add(axis.scale(along))), distance = normal.length();
            if (distance < c.radius && distance > 1e-6) {
              const correction = normal.scale((c.radius - distance) / distance / t);
              const sum = (1 - u) ** 2 + u ** 2;
              a.point.addInPlace(correction.scale((1 - u) / sum));
              b.point.addInPlace(correction.scale(u / sum));
              this.keepLength(a); this.keepLength(b);
              this.stats.contacts++;
            }
          }
        }
      }
      // Constraint projection is not an impulse. Without correcting the
      // Verlet history, a thigh contact becomes artificial outward velocity
      // on the following substep and kicks the panel off the body.
      for (let i = 0; i < this.panels.length; i++) {
        const p = this.panels[i], correction = p.point.subtract(predicted[i]);
        const velocity = predicted[i].subtract(p.previous);
        if (correction.lengthSquared() > 1e-10) {
          const normal = correction.normalize();
          const inward = Vector3.Dot(velocity, normal);
          if (inward < 0) velocity.subtractInPlace(normal.scale(inward));
          velocity.scaleInPlace(.85);
        }
        p.previous.copyFrom(p.point).subtractInPlace(velocity);
      }
      this.previousStep = h;
    }
    for (const p of this.panels) {
      const local = Vector3.TransformCoordinates(p.point, Matrix.Invert(p.node.getWorldMatrix())).normalize();
      const delta = Quaternion.Identity();
      Quaternion.FromUnitVectorsToRef(p.tip.normalizeToNew(), local, delta);
      p.node.rotationQuaternion!.copyFrom(p.rest.multiply(delta));
      p.node.computeWorldMatrix(true);
      this.stats.maxSwing = Math.max(this.stats.maxSwing, 2 * Math.acos(Math.min(1, Math.abs(delta.w))));
    }
  }

  private keepLength(panel: Panel): void {
    const direction = panel.point.subtract(panel.anchor).normalize();
    panel.point.copyFrom(panel.anchor).addInPlace(direction.scale(panel.length));
  }
}

export function attachWellsCoatPhysics(variant: string, scene: Scene, nodes: Map<string, TransformNode>, owner: Node): WellsCoatPhysics | undefined {
  if (variant !== 'wells_research') return;
  const physics = new WellsCoatPhysics(nodes);
  if (physics.stats.panels !== 11) throw new Error('Wells coat is missing its 11 hem bones; rebuild wells_research.glb');
  owner.metadata = { ...owner.metadata, wellsCoatPhysics: physics };
  let frame = -1;
  const observer = scene.onBeforeActiveMeshesEvaluationObservable.add(() => {
    if (frame === scene.getFrameId()) return;
    frame = scene.getFrameId();
    physics.step(scene.getEngine().getDeltaTime() / 1000);
  });
  owner.onDisposeObservable.addOnce(() => scene.onBeforeActiveMeshesEvaluationObservable.remove(observer));
  return physics;
}
