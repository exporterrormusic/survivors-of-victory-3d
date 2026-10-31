import { Matrix, Vector3 } from '@babylonjs/core';
import { SFX, WEAPON_FIRE, WEAPON_SPECIAL } from '../../audio/sound-bank';
import { PX, type CharacterKit, type KitContext } from '../kit';
import type { Target } from '../targets';
import { burstHpAfterCost, missingHpMultiplier, slashContains, SWORD_HALF_ANGLE } from './mechanics';
import { crescent, cut, petals, teleportImpact, VIOLET } from './effects';
import { SwordSweep } from './sword-sweep';
import { BurstCinematic } from './burst-cinematic';
import { waveCoverContact } from './wave-cover';
import { ScarletStatusVfx } from './status-vfx';

/** Twin Moon side waves, radians off the aim */
const TWIN_MOON_ANGLE = .3;
/** Execution also takes heavies below this share of health */
const EXECUTE_HEAVY = .3;
/** Expose Weakness: +100% damage taken for 6 s (one mark per target) */
const EXPOSE_BONUS = 1, EXPOSE_TIME = 6;
/** D1 Crashout: seconds frozen after the Burst (bosses longer: the talent is a boss window) */
const CRASHOUT = 3, CRASHOUT_BOSS = 5;
/** Finishing Blow doubles slashes on enemies below this share of health */
const FINISHING_HEALTH = .3;
/** Rising Tide: Burst gauge per wave hit */
const RISING_TIDE_GAUGE = 2;

interface Wave { position: Vector3; direction: Vector3; yaw: number; age: number; scale: number; damage: number; hits: Set<Target>; petal: boolean }

export function createScarlet(ctx: KitContext): CharacterKit {
  const statusVfx = new ScarletStatusVfx(ctx);
  const cinematic = new BurstCinematic(ctx);
  const swordSweep = new SwordSweep(ctx);
  const dashWave = new SwordSweep(ctx, true);
  const has = (id: string) => ctx.run.talents.has(id);
  let cooldown = 0, charge: number | null = null, parryTime = 0, parryYaw = 0, freeze = 0;
  let burst: { target: Target; generation: number }[] = [], burstScale = 1, cadence = .3;
  let burstFrom = new Vector3(), burstTo = new Vector3(), burstElapsed = 0, burstMarked = false, ghostIn = 0;
  const pending: { target: Target; generation: number }[] = [];
  let selfCost = 0;
  /** Evasion: a parry readies a double-damage slash */
  let evasionReady = false;
  const combos = new WeakMap<Target, { generation: number; count: number }>();
  const waves: Wave[] = [];
  const maxHp = () => ctx.maxHp ?? 50;
  const hpScale = () => missingHpMultiplier(ctx.hp ?? maxHp(), maxHp(), has('low_hp_damage'));
  const visible = (t: Target) => {
    const p = Vector3.Project(t.position.add(new Vector3(0, 1, 0)), Matrix.Identity(),
      ctx.scene.getTransformMatrix(), ctx.camera.camera.viewport.toGlobal(ctx.scene.getEngine().getRenderWidth(), ctx.scene.getEngine().getRenderHeight()));
    return p.z >= 0 && p.z <= 1 && p.x >= 0 && p.y >= 0 && p.x <= ctx.scene.getEngine().getRenderWidth() && p.y <= ctx.scene.getEngine().getRenderHeight();
  };
  const clear = (a: Vector3, b: Vector3) => ctx.targets.navigation.traceCover(a.add(new Vector3(0, .8, 0)), b.add(new Vector3(0, .8, 0))) == null;
  function area(at: Vector3, radius: number, damage: number, stun = false, teleport = false): void {
    if (teleport) {
      teleportImpact(ctx.vfx, at, radius, ctx.aimYaw ?? 0);
      ctx.camera.shake(.10, .16);
    } else { ctx.vfx.ring(at, VIOLET, .2, radius, .35, .8); petals(ctx.vfx, at); }
    ctx.targets.areaHit((x, z, pad) => Math.hypot(x - at.x, z - at.z) <= radius + pad);
    for (const t of ctx.targets.targets) if (t.alive && Vector3.Distance(at, t.position) <= radius + t.radius && clear(at, t.position)) {
      ctx.run.damage(t, damage, 'special'); if (stun && t.alive) t.stunned = Math.max(t.stunned, 2);
    }
  }
  const specialCooldown = () => has('special_cd') ? 3 : 5;
  function addWave(yaw: number, scale: number, damage: number): void {
    const wave: Wave = { position: ctx.playerPosition.clone(), direction: new Vector3(Math.sin(yaw), 0, Math.cos(yaw)), yaw, age: 0, scale,
      damage, hits: new Set(), petal: false };
    waves.push(wave);
    dashWave.launchWave(wave.position, yaw, scale, () => waves.includes(wave));
  }
  function launch(scale = 1): boolean {
    if (cooldown > 0 || burst.length) return false;
    const yaw = ctx.aimYaw ?? 0;
    // No Hard Feelings doubles a fully charged Musashi wave (scale 3).
    const damage = 8 * scale * hpScale() * (has('no_hard_feelings') && scale >= 2.95 ? 2 : 1);
    addWave(yaw, scale, damage);
    // Twin Moon: two extra waves angled to either side at 60% damage.
    if (has('twin_moon')) for (const side of [-1, 1]) addWave(yaw + side * TWIN_MOON_ANGLE, scale, damage * .6);
    cooldown = specialCooldown();
    ctx.sound(WEAPON_SPECIAL.sword!, ctx.playerPosition);
    return true;
  }
  function teleportWave(): boolean {
    const wave = waves.find(w => !w.petal);
    if (!wave || !has('nothing_personal')) return false;
    const before = ctx.playerPosition.clone(); ctx.teleport?.(wave.position);
    cut(ctx.vfx, before, ctx.playerPosition);
    area(ctx.playerPosition, 3, wave.damage * (has('no_hard_feelings') ? 12 : 3), has('surprise'), true);
    waves.splice(waves.indexOf(wave), 1); return true;
  }
  return {
    aimFacing: 'head',
    weapon: { damage: 10, magazine: 0, reload: 0, cooldown: .3, automatic: false, moveSpeed: 800 * PX, maxHp: 50, melee: true },
    dash: { speed: 26, duration: .22, afterimageInterval: .025, cooldown: .5 },
    talentTiers: true,
    specialName: 'Dash Slash', burstName: 'Scarlet Flash', affiliation: 'Pilgrim', accent: VIOLET,
    icons: { weapon: 'sword', special: 'wave', dash: 'dash' },
    prepare: async () => { await swordSweep.prepare(); await dashWave.prepare(); },
    get busy() { return burst.length > 0; },
    get freezesEnemies() { return burst.length > 0 || freeze > 0; },
    fire: () => {
      if (burst.length) return;
      // Each swing costs 3% max HP, never below half health.
      const floor = maxHp() / 2;
      if ((ctx.hp ?? maxHp()) > floor) { selfCost += maxHp() * .03; const cost = Math.floor(selfCost); selfCost -= cost; ctx.setHp?.(Math.max(floor, (ctx.hp ?? maxHp()) - cost)); }
      ctx.run.beginShot();
      // Evasion: the swing after a parry hits twice as hard.
      const empowered = evasionReady ? 2 : 1;
      evasionReady = false;
      const yaw = ctx.aimYaw ?? 0, origin = ctx.playerPosition;
      parryTime = .22; parryYaw = yaw;
      ctx.sound(WEAPON_FIRE.sword, origin);
      const hit = new Set<Target>();
      swordSweep.fire(origin, yaw, wipe => {
      ctx.targets.areaHit((x, z, pad) => slashContains(x - origin.x, z - origin.z, yaw, pad, wipe));
      for (const t of ctx.targets.targets) {
        if (!t.alive || hit.has(t) || !slashContains(t.position.x - origin.x, t.position.z - origin.z, yaw, t.radius, wipe) || !clear(origin, t.position)) continue;
        hit.add(t);
        const old = combos.get(t), count = old?.generation === t.generation ? Math.min(4, old.count + 1) : 0;
        combos.set(t, { generation: t.generation, count });
        const finisher = has('finishing_blow') && t.hp < t.maxHp * FINISHING_HEALTH ? 2 : 1;
        const damage = 10 * hpScale() * finisher * empowered * (has('i_am_cheating') ? 2 ** Math.min(2, count) : 1);
        ctx.run.damage(t, damage, 'attack');
        if (has('eviscerate')) { ctx.run.burn(t, 'scarlet-bleed', damage * (has('hemorrhage') ? 2 : 1), 5); petals(ctx.vfx, t.position, true, 4); }
      }
      });
      if (has('roses_core')) for (let i = -2; i <= 2; i++) {
        const angle = yaw + i / 2 * SWORD_HALF_ANGLE * .875;
        const wave: Wave = { position: origin.clone(), direction: new Vector3(Math.sin(angle), 0, Math.cos(angle)), yaw: angle, age: 0, scale: .2,
          damage: 5 * hpScale(), hits: new Set(), petal: true };
        waves.push(wave);
        const petal = ctx.vfx.quad('rose-petal', [1, 1, 1], 1, 'alpha');
        const at = new Vector3();
        ctx.vfx.add({
          update: () => {
            if (!waves.includes(wave)) return false;
            at.copyFrom(wave.position).addInPlaceFromFloats(0, .9 + Math.sin(wave.age * 12 + i) * .12, 0);
            ctx.vfx.sprite(petal, at, .62, angle + wave.age * (i % 2 ? -7 : 7));
            // Fold around its long axis as it tumbles, retaining a readable silhouette.
            petal.scaling.x *= .45 + .55 * Math.abs(Math.cos(wave.age * 10 + i));
            return true;
          },
          dispose: () => ctx.vfx.release(petal),
        });
      }
    },
    useSpecial: () => teleportWave() || (!has('musashi') && launch()),
    chargeSpecial: (dt, held, released) => {
      if (!has('musashi') || burst.length) { charge = null; return; }
      if (held && cooldown <= 0) { charge = Math.min(2, (charge ?? 0) + dt); crescent(ctx.vfx, ctx.playerPosition, ctx.aimYaw ?? 0, .7 + charge * .5, .08); }
      if (charge !== null && (released || !held)) { launch(1 + charge); charge = null; }
    },
    special: () => ({ charges: cooldown <= 0 || (has('nothing_personal') && waves.some(w => !w.petal)) ? 1 : 0, maxCharges: 1,
      progress: 1 - cooldown / specialCooldown(), charge: charge === null ? null : charge / 2 }),
    // Dodge is part of her base kit: dashes pass through enemies (walls still block).
    dashThroughEnemies: true,
    parry: (from, to) => {
      // Parry is part of her base kit; Evasion and Retaliation upgrade it.
      if (parryTime <= 0) return 0;
      // Swept samples avoid tunnelling through the sword envelope at low frame rates.
      const steps = Math.max(1, Math.ceil(Vector3.Distance(from, to) / .25));
      for (let i = 0; i <= steps; i++) {
        const p = Vector3.Lerp(from, to, i / steps);
        if (slashContains(p.x - ctx.playerPosition.x, p.z - ctx.playerPosition.z, parryYaw) && clear(ctx.playerPosition, p)) {
          if (has('evasion')) { ctx.invulnerable?.(1, true); evasionReady = true; }
          petals(ctx.vfx, p, false, 5); return has('retaliation') ? 10 : 1;
        }
      }
      return 0;
    },
    useBurst: () => {
      ctx.sound(SFX.scarletBurst, ctx.playerPosition);
      cinematic.start(); pending.length = 0; ctx.run.beginBurst();
      burstElapsed = 0; burstMarked = false; ghostIn = 0;
      burstFrom.copyFrom(ctx.playerPosition);
      ctx.setHp?.(burstHpAfterCost(ctx.hp ?? maxHp())); burstScale = hpScale(); freeze = 0;
      burst = ctx.targets.targets.filter(t => t.alive && visible(t)).sort((a, b) => b.hp - a.hp).map(target => ({target, generation: target.generation}));
      cadence = .3 / (burst.length > 10 ? 2 : burst.length > 5 ? 1.5 : 1);
      ctx.invulnerable?.(burst.length * cadence + 1);
      if (burst.length) burstTo.copyFrom(burst[0].target.position);
      else { freeze = .3; cinematic.finish(); }
    },
    update: dt => {
      statusVfx.update();
      cooldown = Math.max(0, cooldown - dt); parryTime = Math.max(0, parryTime - dt); freeze = Math.max(0, freeze - dt);
      if (burst.length) {
        const entry = burst[0], t = entry.target;
        burstElapsed += dt;
        const dashDuration = cadence / 3;
        if (t.alive && t.generation === entry.generation) {
          if (!burstMarked) {
            const ratio = Math.min(1, burstElapsed / dashDuration);
            ctx.teleport?.(Vector3.Lerp(burstFrom, burstTo, 1 - (1-ratio)**2));
            ghostIn -= dt;
            if (ghostIn <= 0) { ctx.afterimage?.([1.8,.01,.025]); ghostIn = .025; }
            if (ratio >= 1) {
              cinematic.mark(t); ctx.sound(WEAPON_FIRE.sword, t.position, .65);
              pending.push(entry); burstMarked = true;
            }
          }
        } else burstElapsed = cadence;
        if (burstElapsed >= cadence) {
          burst.shift(); burstElapsed = 0; burstMarked = false;
          if (burst.length) { burstFrom.copyFrom(ctx.playerPosition); burstTo.copyFrom(burst[0].target.position); }
          else {
            // The frozen victims resolve together, matching the Phaser finishing cut.
            for (const hit of pending) {
              const victim = hit.target;
              if (!victim.alive || victim.generation !== hit.generation) continue;
              const execute = has('burst_execute') && victim.combatTier !== 'boss'
                && (victim.combatTier !== 'heavy' || victim.hp < victim.maxHp * EXECUTE_HEAVY);
              ctx.run.damage(victim, execute ? Math.max(victim.hp, 1) : 100 * burstScale, 'burst');
              if (has('expose_weakness') && victim.alive) victim.marks.add('scarlet-expose', EXPOSE_BONUS, EXPOSE_TIME);
              // D1 Crashout freezes only what the Burst hit, so other fights (and players) carry on.
              if (has('d1_crashout') && victim.alive) victim.frozen = Math.max(victim.frozen, victim.combatTier === 'boss' ? CRASHOUT_BOSS : CRASHOUT);
              if (!victim.alive) {
                if (execute) ctx.run.gainXp(20);
                if (has('drink_to_victory')) ctx.heal(2.5);
                if (has('fire_in_my_veins') && Math.random() < .5) ctx.run.addBurst(5);
              }
            }
            pending.length = 0; freeze = .3;
            ctx.camera.shake(.14,.18); cinematic.finish(); ctx.invulnerable?.(1);
          }
        }
      }
      cinematic.update(dt, burst.length > 0 || freeze > 0);
      if (burst.length || freeze > 0) return;
      for (let i = waves.length - 1; i >= 0; i--) {
        const w = waves[i], before = w.position.clone(); w.age += dt;
        w.position.addInPlace(w.direction.scale((w.petal ? 15 : 30.375) * dt));
        const blocked = w.petal ? !clear(before, w.position) : waveCoverContact(before, w.position, w.yaw, w.scale,
          (from, to, padding) => ctx.targets.navigation.traceCover(from, to, padding)) !== null;
        if (w.age > (w.petal ? .9 : 1.8) || blocked) { waves.splice(i, 1); continue; }

        const segment = w.position.subtract(before), length2 = segment.lengthSquared();
        const reach = w.petal ? .35 : 2.025 * w.scale;
        ctx.targets.areaHit((x, z, pad) => {
          const u = Math.max(0, Math.min(1, ((x - before.x) * segment.x + (z - before.z) * segment.z) / Math.max(.00001, length2)));
          return Math.hypot(x - before.x - segment.x * u, z - before.z - segment.z * u) <= reach + pad;
        });
        for (const t of ctx.targets.targets) {
          if (!t.alive || w.hits.has(t)) continue;
          const u = Math.max(0, Math.min(1, Vector3.Dot(t.position.subtract(before), segment) / Math.max(.00001, length2)));
          const near = before.add(segment.scale(u));
          if (Vector3.Distance(near, t.position) > (w.petal ? .35 : 2.025 * w.scale) + t.radius || !clear(near, t.position)) continue;
          w.hits.add(t); ctx.run.damage(t, w.damage, 'special');
          if (!w.petal && has('special_heal')) ctx.heal(1.5);
          if (!w.petal && t.alive && has('crimson_edge')) ctx.run.burn(t, 'scarlet-bleed', w.damage * (has('hemorrhage') ? 2 : 1), 5);
          if (!w.petal && has('rising_tide')) ctx.run.addBurst(RISING_TIDE_GAUGE);
          if (!w.petal && !t.alive && has('in_one_strike')) area(t.position, 4, w.damage);
        }
      }
    },
  };
}
