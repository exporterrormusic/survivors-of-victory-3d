import { Vector3 } from '@babylonjs/core';
import type { Vfx, Rgb } from '../vfx';
export const VIOLET: Rgb = [.7, .16, .86];
export const IVORY: Rgb = [1, .88, 1];
export const ROSE: Rgb = [1, .06, .18];

/** Teleport arrival: a fast circular draw-cut, crossing blades and flying petal shards. */
export function teleportImpact(vfx: Vfx, origin: Vector3, radius: number, yaw: number): void {
  const center = origin.clone();
  const arcs = Array.from({length: 56}, () => [vfx.quad('sword-cut', VIOLET), vfx.quad('sword-cut', IVORY)]);
  const cuts = Array.from({length: 6}, () => [vfx.quad('sword-cut', VIOLET), vfx.quad('sword-cut', IVORY)]);
  const shards = Array.from({length: 14}, (_, i) => ({
    q: vfx.quad('rose-petal', [1, 1, 1], 1, 'alpha'), angle: yaw + i * Math.PI * 2 / 14,
  }));
  for (const [body] of [...arcs, ...cuts]) vfx.glowing(body);
  const a = new Vector3(), b = new Vector3();
  vfx.flashSprite(center.add(new Vector3(0, .8, 0)), IVORY, 2.1, .13, .8, 'star');
  vfx.add({update: (_dt, age) => {
    if (age >= .65) return false;
    const expansion = Math.min(1, age / .12);
    const reach = radius * (.35 + .65 * (1 - (1 - expansion) ** 3));
    arcs.forEach(([body, edge], i) => {
      const local = age - i / arcs.length * .14;
      const fade = local < 0 ? 0 : Math.max(0, 1 - local / .32) ** 1.4;
      const angle = yaw + i / arcs.length * Math.PI * 2;
      const next = angle + Math.PI * 2 / arcs.length * 1.2;
      a.set(center.x + Math.sin(angle) * reach, center.y + .65 + .18 * Math.sin(angle * 2), center.z + Math.cos(angle) * reach);
      b.set(center.x + Math.sin(next) * reach, center.y + .65 + .18 * Math.sin(next * 2), center.z + Math.cos(next) * reach);
      vfx.streak(body, a, b, .6 * fade); vfx.tint(body, VIOLET, fade);
      vfx.streak(edge, a, b, .17 * fade); vfx.tint(edge, IVORY, fade);
    });
    cuts.forEach(([body, edge], i) => {
      const local = age - .035 * i;
      const fade = local < 0 ? 0 : Math.max(0, 1 - local / .24);
      const angle = yaw + i * Math.PI / 6;
      const length = radius * Math.min(1, Math.max(0, local) / .055);
      a.set(center.x - Math.sin(angle) * length, center.y + .25, center.z - Math.cos(angle) * length);
      b.set(center.x + Math.sin(angle) * length, center.y + 1.3, center.z + Math.cos(angle) * length);
      vfx.streak(body, a, b, .36 * fade); vfx.tint(body, VIOLET, fade * .8);
      vfx.streak(edge, a, b, .075 * fade); vfx.tint(edge, IVORY, fade);
    });
    for (const {q, angle} of shards) {
      const travel = radius * Math.min(1.15, age * 2.8);
      a.set(center.x + Math.sin(angle) * travel, center.y + .5 + Math.sin(age / .65 * Math.PI) * .9, center.z + Math.cos(angle) * travel);
      vfx.sprite(q, a, .27, angle + age * 8);
      q.alpha = Math.min(1, (.65 - age) / .2);
    }
    return true;
  }, dispose: () => {
    for (const pair of [...arcs, ...cuts]) for (const q of pair) vfx.release(q);
    for (const {q} of shards) vfx.release(q);
  }});
}

/** Curved sword ribbon, with a separate fine cutting edge. Uses the shared quad pool. */
export function crescent(vfx: Vfx, origin: Vector3, yaw: number, radius: number, life = .24, follow = false): void {
  const center = follow ? origin : origin.clone();
  const quads = Array.from({length: 24}, () => [vfx.quad('streak', VIOLET), vfx.quad('streak', IVORY)]);
  const a = new Vector3(), b = new Vector3();
  vfx.add({ update: (_dt, age) => {
    if (age >= life) return false;
    const wipe = Math.min(1, age / .065), fade = (1 - age / life) ** .6;
    quads.forEach(([body, edge], i) => {
      const t0 = yaw - Math.PI / 4 + i / 24 * Math.PI / 2;
      const t1 = t0 + Math.PI / 48;
      const alpha = i / 24 <= wipe ? fade : 0;
      a.set(center.x + Math.sin(t0) * radius, center.y + .85, center.z + Math.cos(t0) * radius);
      b.set(center.x + Math.sin(t1) * radius, center.y + .85, center.z + Math.cos(t1) * radius);
      vfx.streak(body, a, b, .32 * fade); vfx.tint(body, VIOLET, alpha * .8);
      vfx.streak(edge, a, b, .055); vfx.tint(edge, IVORY, alpha);
    });
    return true;
  }, dispose: () => quads.flat().forEach(q => vfx.release(q)) });
}

export function petals(vfx: Vfx, at: Vector3, rose = false, count = 9): void {
  const pieces = Array.from({length: count}, () => ({ q: vfx.quad('petal', rose ? ROSE : IVORY, 1, 'alpha'),
    p: at.clone().addInPlaceFromFloats(0, .9, 0), angle: Math.random() * Math.PI * 2, speed: 1 + Math.random() * 3 }));
  vfx.add({ update: (dt, age) => {
    if (age > .8) return false;
    for (const p of pieces) {
      p.p.addInPlaceFromFloats(Math.sin(p.angle) * p.speed * dt, (.8 - age * 2) * dt, Math.cos(p.angle) * p.speed * dt);
      p.q.spin = p.angle + age * 5;
      vfx.sprite(p.q, p.p, .13 + .1 * Math.abs(Math.sin(age * 8 + p.angle)));
      vfx.tint(p.q, rose ? ROSE : IVORY, 1 - age / .8);
    }
    return true;
  }, dispose: () => pieces.forEach(p => vfx.release(p.q)) });
}

export function cut(vfx: Vfx, from: Vector3, to: Vector3): void {
  const q = vfx.quad('streak', IVORY), a = from.add(new Vector3(0, .9, 0)), b = to.add(new Vector3(0, 1.2, 0));
  vfx.add({ update: (_dt, age) => {
    if (age >= .3) return false;
    vfx.streak(q, a, b, .1 * (1 - age / .3)); return true;
  }, dispose: () => vfx.release(q) });
  petals(vfx, to);
}
