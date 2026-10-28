import { Vector3 } from '@babylonjs/core';
import { type Vfx, type Rgb, type FxQuad } from '../vfx';
import { smoothstep } from '../math';
import { goldenFireDisc } from './golden-fire';

export const RAPUNZEL_ROCKET_SPEED = 18;
export const RAPUNZEL_BLAST_RADIUS = 3.75;
export const GOLD: Rgb = [1.3, .78, .15], IVORY: Rgb = [1.4, 1.22, .72];
const lit = (vfx: Vfx, texture: Parameters<Vfx['quad']>[0], color: Rgb = GOLD, alpha = 1) => {
  const q = vfx.quad(texture, color, alpha); vfx.glowing(q); return q;
};
// The asymmetric priest emblem needs a half-turn in the effect quad orientation.
const SEAL_START_ROTATION = Math.PI;
const release = (vfx: Vfx, quads: FxQuad[]) => { for (const q of quads) vfx.release(q); };

/** A hollow halo is the projectile itself; its wake fades independently after impact. */
export function rocketTrail(vfx: Vfx, start: Vector3) {
  const halo = lit(vfx, 'holy-halo', IVORY), inner = lit(vfx, 'holy-halo');
  const wake = lit(vfx, 'streak', GOLD, .7);
  const samples: { at: Vector3; born: number; q: FxQuad; spin: number }[] = [];
  const head = start.clone(), direction = new Vector3(0, 0, 1);
  let age = 0, ended = false, distanceSinceSpark = 0;
  vfx.add({ update: dt => {
    age += dt;
    while (samples.length && age - samples[0].born > .5) vfx.release(samples.shift()!.q);
    for (const s of samples) {
      const t = (age - s.born) / .5;
      const at = s.at.add(new Vector3(Math.sin(s.spin) * t * .3, t * .22, Math.cos(s.spin) * t * .3));
      vfx.sprite(s.q, at, .12 + .12 * (1 - t), s.spin + t);
      vfx.tint(s.q, IVORY, (1 - t) * .8);
    }
    halo.visible = inner.visible = wake.visible = !ended;
    if (!ended) {
      vfx.sprite(halo, head, 1.25, age * 3);
      vfx.sprite(inner, head, .96, -age * 2);
      vfx.streak(wake, head.subtract(direction.scale(1.7)), head, .15);
    }
    return !ended || samples.length > 0;
  }, dispose: () => release(vfx, [halo, inner, wake, ...samples.map(s => s.q)]) });
  return {
    move(to: Vector3) {
      const delta = to.subtract(head), distance = delta.length();
      if (distance > .001) direction.copyFrom(delta).normalize();
      const count = Math.ceil(distance / .18);
      for (let i = 0; i < count; i++) {
        distanceSinceSpark += distance / count;
        if (distanceSinceSpark < .23) continue;
        distanceSinceSpark = 0;
        if (samples.length >= 48) vfx.release(samples.shift()!.q);
        samples.push({at: Vector3.Lerp(head, to, i / count), born: age, q: lit(vfx, 'holy-shard', IVORY), spin: age * 37 + i * 2.4});
      }
      head.copyFrom(to);
    },
    stop() { ended = true; },
  };
}

/** Gold-only light detonation: open halo, pointed rays and scattering diamonds. */
export function holyGraceImpact(vfx: Vfx, impact: Vector3): void {
  const origin = impact.clone(); origin.y = Math.max(.22, origin.y);
  const ground = new Vector3(impact.x, .06, impact.z), radius = RAPUNZEL_BLAST_RADIUS;
  const halo = lit(vfx, 'holy-halo'), flash = lit(vfx, 'holy-shard', IVORY), core = lit(vfx, 'glow', IVORY, .65);
  const rays = Array.from({length: 12}, (_, i) => ({q: lit(vfx, 'streak', i % 3 ? GOLD : IVORY), spark: lit(vfx, 'holy-shard', IVORY), angle: i * Math.PI / 6 + .07 * Math.sin(i * 4)}));
  vfx.flash(origin, GOLD, 2, radius * 2.5, .2);
  vfx.add({update: (_dt, age) => {
    if (age > .85) return false;
    const spread = 1 - Math.exp(-age * 13), fade = 1 - smoothstep(.1, .6, age);
    vfx.decal(halo, ground, radius * 2 / .75 * spread, age * .4);
    vfx.tint(halo, GOLD, .8 * (1 - smoothstep(.12, .48, age)));
    vfx.sprite(flash, origin, radius * (1.2 + age * 2), .15);
    vfx.tint(flash, IVORY, 1 - smoothstep(.02, .18, age));
    vfx.sprite(core, origin, radius * 1.2 * spread);
    vfx.tint(core, IVORY, .7 * (1 - smoothstep(.05, .3, age)));
    rays.forEach((r, i) => {
      const direction = new Vector3(Math.cos(r.angle), .08 + i % 3 * .12, Math.sin(r.angle));
      const tip = origin.add(direction.scale(radius * spread * (.7 + i % 3 * .15)));
      vfx.streak(r.q, origin.add(direction.scale(radius * spread * .3)), tip, (.08 + (i % 3 === 0 ? .07 : 0)) * fade);
      vfx.tint(r.q, i % 3 ? GOLD : IVORY, fade);
      const at = origin.add(direction.scale(radius * (.3 + age * 1.25))); at.y += age * .5;
      vfx.sprite(r.spark, at, .12 + (i % 3) * .07, r.angle + age);
      vfx.tint(r.spark, IVORY, Math.sin(Math.min(1, age / .85) * Math.PI) * .9);
    });
    return true;
  },dispose:()=>release(vfx,[halo,flash,core,...rays.flatMap(r=>[r.q,r.spark])])});
}

/** Burning Desire uses the shared animated fire shader, tinted gold inside its halo border. */
export function goldenFireField(vfx: Vfx, position: () => Vector3, radius: () => number, alive: () => boolean): void {
  const fire = goldenFireDisc(vfx);
  const bed = lit(vfx, 'glow', GOLD, .14), border = lit(vfx, 'holy-halo', GOLD, .7);
  vfx.add({update: (_dt, age) => {
    if (!alive()) return false;
    const at = position(), r = radius(), appear = smoothstep(0, .2, age);
    fire.update(at, r, age, appear * .85);
    vfx.decal(bed, at.add(new Vector3(0, .04, 0)), r * 2.2);
    vfx.decal(border, at.add(new Vector3(0, .06, 0)), r * 2 / .75, age * .1);
    vfx.tint(border, GOLD, appear * .7);
    return true;
  }, dispose: () => { fire.dispose(); release(vfx, [bed, border]); }});
}

/** Layered prayer seal, sharp outer ticks, floating diamonds and slow rising light. */
export function blessingField(vfx: Vfx, position: () => Vector3, radius: () => number, alive: () => boolean, offensive = false): void {
  const seal = lit(vfx, 'holy-seal', GOLD, .65), rim = lit(vfx, 'holy-halo', IVORY, .6);
  const fill = vfx.quad('glow', GOLD, .12);
  const motes = Array.from({length: offensive ? 10 : 16}, (_,i)=>({q:lit(vfx,'holy-shard',i%3?GOLD:IVORY), ray:lit(vfx,'streak',GOLD,.35),phase:i*.618}));
  vfx.add({update:(_dt,age)=>{
    if(!alive())return false;
    const at=position().add(new Vector3(0,.055,0)),r=radius(),appear=smoothstep(0,.25,age);
    vfx.decal(seal,at,r*2/.75,SEAL_START_ROTATION+age*.12);vfx.tint(seal,GOLD,appear*(offensive?.45:.6));
    vfx.decal(rim,at.add(new Vector3(0,.015,0)),r*1.55/.75,-age*.17);vfx.tint(rim,IVORY,appear*(.4+Math.sin(age*2)*.08));
    vfx.decal(fill,at,r*2.2);
    motes.forEach((m,i)=>{
      const t=(age*.3+m.phase)%1,a=i*2.399+age*.13,d=r*(.38+(i%4)*.18);
      const foot=at.add(new Vector3(Math.cos(a)*d,0,Math.sin(a)*d)),point=foot.add(new Vector3(0,.1+t*(offensive?.7:1.5),0));
      const alpha=Math.sin(t*Math.PI)*appear;
      vfx.sprite(m.q,point,.13+(i%3)*.065,Math.PI/4);vfx.tint(m.q,i%3?GOLD:IVORY,alpha*.85);
      vfx.streak(m.ray,point.add(new Vector3(0,-.35,0)),point,.035);vfx.tint(m.ray,GOLD,alpha*.3);
    });return true;
  },dispose:()=>release(vfx,[seal,rim,fill,...motes.flatMap(m=>[m.q,m.ray])])});
}

/** Garden of Shangri-La: cathedral seal, central prayer cross and outward divine wave. */
export function gardenBurst(vfx: Vfx, at: Vector3): void {
  const origin=at.clone(),ground=at.add(new Vector3(0,.07,0));
  const seal=lit(vfx,'holy-seal'),wave=lit(vfx,'holy-halo',IVORY),cross=lit(vfx,'holy-shard',IVORY),column=lit(vfx,'streak',GOLD,.5);
  const shards=Array.from({length:32},(_,i)=>({q:lit(vfx,'holy-shard',i%3?GOLD:IVORY),a:i*2.399,r:1+(i%7)*.6}));
  vfx.flash(origin.add(new Vector3(0,1,0)),GOLD,2.8,12,.45);
  vfx.add({update:(_dt,age)=>{
    if(age>2)return false;
    const appear=smoothstep(0,.12,age),fade=1-smoothstep(.65,2,age);
    vfx.decal(seal,ground,12,SEAL_START_ROTATION+age*.12);vfx.tint(seal,GOLD,appear*fade*.7);
    vfx.decal(wave,ground,24/.75*(1-Math.exp(-age*3)),age*.15);vfx.tint(wave,IVORY,(1-smoothstep(.25,.9,age))*.7);
    vfx.streak(column,origin,origin.add(new Vector3(0,7,0)),1.1);vfx.tint(column,GOLD,appear*(1-smoothstep(.3,.9,age))*.5);
    vfx.sprite(cross,origin.add(new Vector3(0,2.4,0)),4.5,0);vfx.tint(cross,IVORY,appear*(1-smoothstep(.3,1.1,age))*.8);
    shards.forEach((s,i)=>{const r=s.r+age*1.2,point=origin.add(new Vector3(Math.cos(s.a)*r,.15+age*(.8+i%4*.5),Math.sin(s.a)*r));vfx.sprite(s.q,point,.14+(i%4)*.06,s.a*.1);vfx.tint(s.q,i%3?GOLD:IVORY,appear*fade*(.55+.35*Math.sin(age*9+i)));});
    return true;
  },dispose:()=>release(vfx,[seal,wave,cross,column,...shards.map(s=>s.q)])});
}

/** Keep portal openings round and upright in the overhead camera. */
function portalPlane(q: FxQuad, at: Vector3, size: number, _yaw: number, spin = 0): void {
  q.billboard = true; q.visible = true; q.position.copyFrom(at);
  q.scaling.set(size, size, 1); q.spin = spin;
}

/** Golden gates with luminous depths and concentric ripples on each launch. */
export function holyEmplacement(vfx: Vfx, position: () => Vector3, yaw: number, alive: () => boolean) {
  const rim = lit(vfx, 'holy-halo'), inner = lit(vfx, 'holy-halo', IVORY, .65);
  const depth = lit(vfx, 'glow', GOLD, .35), ripple = lit(vfx, 'holy-halo', IVORY, 0);
  let shotAge = 10;
  const normal = new Vector3(Math.sin(yaw), 0, Math.cos(yaw));
  vfx.add({update: (dt, age) => {
    if (!alive()) return false;
    shotAge += dt;
    const at = position(), open = smoothstep(0, .25, age), size = 2.5 * open;
    portalPlane(depth, at.subtract(normal.scale(.04)), size * .9, yaw);
    vfx.tint(depth, GOLD, (.28 + .06 * Math.sin(age * 4)) * open);
    portalPlane(rim, at, size, yaw, age * .08);
    portalPlane(inner, at.add(normal.scale(.025)), size * .82, yaw, -age * .12);
    const pulse = 1 - smoothstep(0, .45, shotAge);
    portalPlane(ripple, at.add(normal.scale(.06 + shotAge * .25)), size * (.45 + Math.min(shotAge, .45) * 1.5), yaw);
    vfx.tint(ripple, IVORY, pulse);
    return true;
  }, dispose: () => release(vfx, [rim, inner, depth, ripple])});
  return { fire() { shotAge = 0; } };
}
