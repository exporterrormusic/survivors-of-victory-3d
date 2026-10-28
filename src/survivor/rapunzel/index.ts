import { Vector3 } from '@babylonjs/core';
import { SFX, WEAPON_FIRE, WEAPON_RELOAD } from '../../audio/sound-bank';
import { PX, type CharacterKit, type KitContext } from '../kit';
import type { Target } from '../targets';
import { targetContact } from '../projectile-collision';
import { holyGraceImpact, rocketTrail, blessingField, goldenFireField, gardenBurst, holyEmplacement, RAPUNZEL_BLAST_RADIUS, RAPUNZEL_ROCKET_SPEED } from './rocket-effects';

const GOLD = [1, .82, .36] as const;
interface Zone { at: Vector3; life: number; tick: number; fire: boolean; follow: boolean; linger: boolean; incendiary: boolean; seen: Map<Target, number>; inside: Set<Target>; stunned: Map<Target, number> }
/** Endless Desire burn stacks cap */
const ENDLESS_STACKS = 5;
/** Anti-Armor Munitions: halo hits on anything bigger than a normal enemy (specialists, heavies, bosses) deal this much more */
const ARMOR_BONUS = 1;
/** Blinding Radiance: enemies the Burst stuns also burn for this much damage per second, for this long */
const RADIANCE_DPS = 15, RADIANCE_TIME = 4;
/** Holy Shockwave (extra_stuffed): Burst stun length, and its shockwave's push (m/s at her feet, fading to 0 at REACH m) */
const STUFFED_STUN = 8, STUFFED_PUSH = 45, STUFFED_REACH = 14;
/** Lingering Light: damage per second to enemies inside the following halo */
const LINGER_DPS = 40;
/** Judgement: the Burst slows every enemy by 50% for this long */
const JUDGEMENT_SLOW = 10;
/** Holy Ordnance: damage multiplier for both level-10 forms (barrage halos and Lingering Light) */
const ORDNANCE = 2;
/** Consecration: the Burst leaves golden fire this wide (m radius) around her for this long */
const CONSECRATION_RADIUS = 5, CONSECRATION_TIME = 6;
/** Lingering Light: share of incoming damage blocked while its halo is out */
const LINGER_RESIST = .3;
/** Concussive Blast: knock-back from the halo's impact, m/s */
const CONCUSSIVE_PUSH = 14;
/** A Burning Sensation: Divine Blessing damage per second (4× with More, more!) */
const BLESSING_DPS = 10;
/** Divine Blessing recharge, seconds per charge */
const BLESSING_COOLDOWN = 10;
interface Rocket { at: Vector3; goal: Vector3; target?: Target; generation: number; age: number; burst: boolean; trail: ReturnType<typeof rocketTrail> }
interface Turret { at: Vector3; height: number; gate?: ReturnType<typeof holyEmplacement>; ammo: number; timer: number; life: number }

/** Authored Survivors kit, with shared cover, damage accounting and scene-owned effects. */
export function createRapunzel(ctx: KitContext): CharacterKit {
  const has = (id: string) => ctx.run.talents.has(id);
  const zones: Zone[] = [], rockets: Rocket[] = [], turrets: Turret[] = [];
  let cooldown = 0, kills = ctx.run.kills, previousZoom: number | undefined;
  // All the Toys stores a second Blessing charge.
  const maxCharges = () => has('all_the_toys') ? 2 : 1;
  let charges = 1;
  /** healing and HP figures were authored for 50 max HP; they grow with her level */
  const hpUnit = () => (ctx.maxHp ?? 50) / 50;
  const stacks = new WeakMap<Target, { generation: number; count: number }>();
  const clear = (a: Vector3, b: Vector3) => ctx.targets.navigation.traceCover(
    new Vector3(a.x, .7, a.z), new Vector3(b.x, .7, b.z)) === null;
  const nearest = (at: Vector3, range = 30) => {
    let best: Target | undefined, distance = range * range;
    for (const t of ctx.targets.targets) if (t.alive && clear(at, t.position)) {
      const d = Vector3.DistanceSquared(at, t.position);
      if (d < distance) { best = t; distance = d; }
    }
    return best;
  };
  // `incendiary` fire is Consecration's large Burst field.
  const radius = (z: Zone) => z.fire ? (z.incendiary ? CONSECRATION_RADIUS : 115 * PX) * (has('spread_love') ? 2 : 1)
    : z.linger ? 230 * PX : 190 * PX * (has('special_size') ? 2 : 1);
  function zone(at: Vector3, fire = false, follow = false, linger = false, incendiary = false): void {
    const z: Zone = { at: at.clone(), fire, follow, linger, incendiary, life: fire ? incendiary ? CONSECRATION_TIME : 5 : linger ? 8 : follow ? Infinity : 9,
      tick: 0, seen: new Map(), inside: new Set(), stunned: new Map() };
    if (fire) z.at.y = 0;
    zones.push(z);
    const effect = fire ? goldenFireField : blessingField;
    effect(ctx.vfx, () => z.at, () => radius(z), () => zones.includes(z));
  }

  function burn(t: Target): void {
    if (has('endless_desire')) {
      const prior = stacks.get(t), count = prior?.generation === t.generation ? Math.min(ENDLESS_STACKS, prior.count + 1) : 1;
      stacks.set(t, { generation: t.generation, count });
      ctx.run.burn(t, 'rapunzel-endless', 12 * count, Infinity);
    } else ctx.run.burn(t, 'rapunzel-burn', 12, 5);
  }
  function launch(at: Vector3, goal: Vector3, burst = false, target?: Target): void {
    rockets.push({ at: at.clone(), goal: goal.clone(), target, generation: target?.generation ?? -1, age: 0, burst, trail: rocketTrail(ctx.vfx, at) });
    ctx.sound(WEAPON_FIRE.rocket, at, burst ? .35 : 1);
  }
  function explode(r: Rocket): void {
    r.trail.stop(); holyGraceImpact(ctx.vfx, r.at); ctx.sound(SFX.explosion, r.at, .85);
    if (!r.burst) ctx.run.beginShot();
    let refunded = false;
    ctx.targets.areaHit((x, z, pad) => Math.hypot(x - r.at.x, z - r.at.z) <= RAPUNZEL_BLAST_RADIUS + pad);
    for (const t of ctx.targets.targets) if (t.alive && Vector3.Distance(r.at, t.position.add(new Vector3(0, .7, 0))) <= RAPUNZEL_BLAST_RADIUS + t.radius && clear(r.at, t.position)) {
      const armored = !r.burst && has('anti_armor') && t.combatTier !== 'horde';
      ctx.run.damage(t, 15 * (r.burst && has('holy_ordnance') ? ORDNANCE : 1) * (armored ? 1 + ARMOR_BONUS : 1), r.burst ? 'burst' : 'attack');
      if (!r.burst && t.alive) {
        // Concussive Blast: halo hits knock enemies away from the impact (heavies and bosses hold their ground).
        if (has('concussive_blast') && t.combatTier !== 'heavy' && t.combatTier !== 'boss') {
          const dx = t.position.x - r.at.x, dz = t.position.z - r.at.z, d = Math.hypot(dx, dz) || 1;
          t.shove(new Vector3(dx / d * CONCUSSIVE_PUSH, 0, dz / d * CONCUSSIVE_PUSH));
        }
        if (has('it_burns') || has('endless_desire')) burn(t);
      }
      if (!r.burst && !t.alive && has('quick_hands') && !refunded) { refunded = true; ctx.refundRound?.(); }
    }
    if (!r.burst && has('burning_desire')) zone(r.at, true);
  }
  return {
    aimFacing: 'head',
    groundTargeted: true,
    talentTiers: true,
    weapon: { damage: 15, magazine: 4, reload: 3, cooldown: .5, automatic: false, moveSpeed: 560 * PX, maxHp: 50 },
    specialName: 'Divine Blessing', burstName: 'Garden of Shangri-La', affiliation: 'Pilgrim', accent: GOLD,
    reloadSound: WEAPON_RELOAD.rocket, icons: { weapon: 'halo', special: 'goddess', dash: 'dash' },
    fire: (muzzle, aim) => launch(muzzle, new Vector3(aim.x, 0, aim.z)),
    useSpecial: () => {
      if (charges <= 0) return false;
      zone(ctx.playerPosition); charges--;
      if (cooldown <= 0) cooldown = BLESSING_COOLDOWN;
      return true;
    },
    special: () => ({ charges, maxCharges: maxCharges(), progress: charges >= maxCharges() ? 1 : 1 - cooldown / BLESSING_COOLDOWN }),
    useBurst: (_origin, yaw) => {
      ctx.sound(SFX.rapunzelBurst, ctx.playerPosition);
      ctx.run.beginBurst();
      ctx.heal(ctx.maxHp ?? 50);
      // Her Burst restores the whole squad too.
      for (const ally of ctx.targets.squad) ally.heal(ally.maxHp);
      // Heavies and bosses resist the Burst stun.
      for (const t of ctx.targets.targets) if (t.alive) {
        const stun = t.combatTier === 'boss' || t.combatTier === 'heavy' ? 0 : has('extra_stuffed') ? STUFFED_STUN : 4;
        if (has('judgement')) t.slowedHard = Math.max(t.slowedHard, JUDGEMENT_SLOW);
        // Holy Shockwave: the Burst also blasts nearby enemies away from her.
        if (has('extra_stuffed')) {
          const dx = t.position.x - ctx.playerPosition.x, dz = t.position.z - ctx.playerPosition.z, d = Math.hypot(dx, dz);
          if (d < STUFFED_REACH && d > 1e-3) t.shove(new Vector3(dx / d, 0, dz / d).scaleInPlace(STUFFED_PUSH * (1 - d / STUFFED_REACH)));
        }
        if (stun > 0) t.stunned = Math.max(t.stunned, stun);
        // Blinding Radiance: the Burst burns every enemy, heavies and bosses included.
        if (has('burst_stun')) ctx.run.burn(t, 'rapunzel-radiance', RADIANCE_DPS, RADIANCE_TIME);
      }
      gardenBurst(ctx.vfx, ctx.playerPosition);
      if (has('consecration')) zone(ctx.playerPosition, true, false, false, true);
      if (has('lingering_light')) zone(ctx.playerPosition, false, true, true);
      // 6,000? Really?: the halo barrage is a level-10 Burst form, not part of the base Burst.
      if (!has('burst_turrets')) return;
      previousZoom ??= ctx.camera.distance; ctx.camera.setDistance(previousZoom / .72);
      for (let i = 0; i < 10; i++) {
        const row = Math.floor(i / 5), side = (i % 5 - 2) * 2.6 + row * 1.3;
        const forward = new Vector3(Math.sin(yaw), 0, Math.cos(yaw));
        const right = new Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
        const at = ctx.playerPosition.add(right.scale(side)).subtract(forward.scale(1.5 + row * .4));
        const safe = ctx.targets.navigation.project(at, .6);
        const ammo = 4;
        const turret: Turret = { at: new Vector3(safe.x, 0, safe.z), height: 2.1 + row * 3, ammo, timer: i * .08, life: ammo * 2.05 };
        turrets.push(turret);
        turret.gate = holyEmplacement(ctx.vfx, () => turret.at.add(new Vector3(0, turret.height, 0)), yaw, () => turrets.includes(turret));
      }
    },
    update: dt => {
      if (dt <= 0) return;
      if (charges < maxCharges()) {
        cooldown -= dt;
        if (cooldown <= 0) { charges++; cooldown = charges < maxCharges() ? BLESSING_COOLDOWN : 0; }
      } else cooldown = 0;
      if (has('im_a_healer')) ctx.heal(Math.max(0, ctx.run.kills - kills));
      kills = ctx.run.kills;
      const deployed = zones.some(z => !z.fire && !z.follow);
      const follow = has('personal_toy') && (!deployed || has('all_the_toys'));
      if (follow && !zones.some(z => z.follow && !z.linger)) zone(ctx.playerPosition, false, true);
      for (let i = zones.length - 1; i >= 0; i--) {
        const z = zones[i];
        if (z.follow && !z.linger && !follow) { zones.splice(i, 1); continue; }
        const elapsed = Math.min(dt, z.life); z.life -= elapsed;
        if (z.follow) z.at.copyFrom(ctx.playerPosition);
        // Lingering Light no longer heals (the Burst already fully heals); it blocks damage instead.
        const heal = z.linger ? 0 : (has('special_power') ? 5 : 1.5) * hpUnit();
        if (z.linger) ctx.resist?.(LINGER_RESIST, .1);
        if (!z.fire && Vector3.Distance(z.at, ctx.playerPosition) <= radius(z) && clear(z.at, ctx.playerPosition)) ctx.heal(heal * elapsed);
        // Squad NIKKEs standing in a healing zone recover the same share of their health she does.
        if (!z.fire && heal > 0) for (const ally of ctx.targets.squad)
          if (ally.alive && Vector3.Distance(z.at, ally.position) <= radius(z) && clear(z.at, ally.position)) ally.heal(heal * elapsed / (ctx.maxHp ?? 50) * ally.maxHp);
        z.tick += elapsed;
        const tick = z.tick >= 1 || z.life <= 0, interval = z.tick;
        const inside = new Set<Target>();
        ctx.targets.areaHit((px, pz, r) => Math.hypot(px - z.at.x, pz - z.at.z) <= radius(z) + r);
        for (const t of ctx.targets.targets) if (t.alive && Vector3.Distance(z.at, t.position) <= radius(z) + t.radius && clear(z.at, t.position)) {
          inside.add(t);
          if (z.fire && (has('it_burns') || z.incendiary || has('endless_desire')) && (tick || !z.inside.has(t) || z.seen.get(t) !== t.generation)) burn(t);
          // Oooh, Ahhhh: one stun per enemy per Blessing, on first entry.
          if (!z.fire && !z.linger && has('oooh_ahhhh') && t.combatTier !== 'boss' && z.stunned.get(t) !== t.generation) {
            z.stunned.set(t, t.generation); t.stunned = Math.max(t.stunned, 1);
          }
          // Lingering Light's halo scorches whatever it passes over (counts as her Burst).
          if (tick && z.linger) ctx.run.damage(t, LINGER_DPS * (has('holy_ordnance') ? ORDNANCE : 1) * interval, 'burst');
          if (tick && !z.linger) {
            // Ground fire is an effect; Blessing damage counts as her Special.
            const damage = z.fire ? 15 : has('burning_sensation') ? BLESSING_DPS * (has('more_more') ? 4 : 1) : 0;
            if (damage > 0) ctx.run.damage(t, damage * interval, z.fire ? 'effect' : 'special');
          }
          if (z.fire || tick) z.seen.set(t, t.generation);
        }
        z.inside = inside;
        if (tick) z.tick = 0;
        if (z.life <= 0) zones.splice(i, 1);
      }
      for (let i = turrets.length - 1; i >= 0; i--) {
        const t = turrets[i]; t.timer -= dt; t.life -= dt;
        if (t.ammo <= 0 || t.life <= 0) { turrets.splice(i, 1); continue; }
        if (t.timer <= 0) {
          const target = nearest(t.at);
          if (target) {
            t.gate?.fire();
            launch(t.at.add(new Vector3(0, t.height, 0)), target.position.add(new Vector3(0, .7, 0)), true, target);
            t.ammo--; t.timer += 2;
          }
        }
      }
      if (!turrets.length && previousZoom !== undefined) { ctx.camera.setDistance(previousZoom); previousZoom = undefined; }
      for (let i = rockets.length - 1; i >= 0; i--) {
        const r = rockets[i]; r.age += dt;
        if (r.target?.alive && r.target.generation === r.generation) r.goal.copyFrom(r.target.position).addInPlaceFromFloats(0, .7, 0);
        const delta = r.goal.subtract(r.at), distance = delta.length(), step = Math.min(distance, RAPUNZEL_ROCKET_SPEED * dt);
        const end = r.at.add(delta.normalize().scale(step));
        let contact = ctx.targets.navigation.traceCover(r.at, end, .08) ?? 1;
        const shield = ctx.targets.shieldContact(r.at, end);
        if (shield && shield.t < contact) contact = shield.t;
        let hit = contact < 1;
        for (const t of ctx.targets.targets) if (t.alive) { const c = targetContact(r.at, end, t); if (c !== null && c <= contact) { contact = c; hit = true; } }
        Vector3.LerpToRef(r.at, end, contact, r.at);
        // Report shield hits (the rocket's blast does the damage; scripted props listen for the touch).
        if (shield && contact === shield.t) shield.shield.block(r.at.clone(), 0);
        r.trail.move(r.at);
        if (hit || distance <= step || r.age >= 6) { explode(r); rockets.splice(i, 1); }
      }
    },
  };
}
