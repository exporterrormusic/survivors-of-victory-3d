// Sakura Grove easter egg: the shrine offering.
//
//   1. cup       a red sake cup sits on one random red bench; walk up to it (sakura icon by RADAR)
//   2. flask     the sake flask appears on the south side of one random tree; take it (flask icon)
//   3. shrine    walk up to the shrine's steps: the cutscene
//   4. cutscene  the offering is laid on the box, the doors slide open, Sakura walks out and speaks
//   5. blessing  for 20 s every Rapture stands swaying in its idle with Scarlet's drink effect
//   6. done      once per run
//
// The Test Lab's Events tab steps back and forward through these on any Sakura run.

import { AnimationGroupMask, AnimationGroupMaskMode, Texture, Vector3, type AnimationGroup, type TransformNode, type UniversalCamera } from '@babylonjs/core';
import { audioEngine } from '../audio/audio-engine';
import { SakuraBackdrop } from './sakura-backdrop';
import { playPlaylist, setNowPlaying } from '../audio/music-control';
import { BATTLE_TRACKS, UI, type Cue, type Track } from '../audio/sound-bank';
import { Chibi, loadChibiIndex } from '../chibi';
import type { EggContext } from './goddess-fall-egg';
import { drunkEffect } from './passives';
import { createSakeSet } from './sake-set';
import { ARENA_RADIUS } from './arena';
import { SAKURA_SCALE, sakuraPlacements } from './sakura-layout';
import type { Player } from './player';
import type { Target } from './targets';

export const SAKURA_STEPS = ['cup', 'flask', 'shrine', 'cutscene', 'blessing', 'done'] as const;
export type SakuraStep = typeof SAKURA_STEPS[number];
const STEP_LABELS: Record<SakuraStep, string> = {
  cup: 'Take the sake cup (a red bench)', flask: 'Take the sake flask (south of a tree)', shrine: 'Go to the shrine',
  cutscene: 'Shrine cutscene', blessing: 'Raptures drunk for 20 s', done: 'Offering made',
};

const SAKURA = 'c282_00';
const LINE = 'The Seimeikai acknowledge your wonderful offering.';
/** seconds every Rapture stays drunk once the cutscene hands control back */
export const BLESSING = 20;
/**
 * Cutscene seconds, paced like a samurai film: long holds, hard cuts, wind in the blossom.
 * The cup and the flask are laid on the box, the doors slide, a gust, her slow walk out, her line,
 * the blessing, control back.
 */
/** the gameplay music fades out over these first seconds of the arrival shot; everything after waits for it */
const LEAD = 2;
const CUP_AT = LEAD + 3.5, JUG_AT = LEAD + 4.4, DOORS_AT = LEAD + 6.2, DOORS_TIME = 1.6, GUST_AT = LEAD + 7.4, WALK_AT = LEAD + 9.2, WALK_TIME = 2.4,
  LINE_AT = LEAD + 12.3, LINE_TIME = 3, BLESS_AT = LEAD + 15.8, END_AT = LEAD + 18.4;
/** sakura_intro.mp3 (12.34 s) starts after the lead-in; her song comes in 1.5 s before the intro ends */
const INTRO_AT = LEAD, INTRO_LENGTH = 12.34, SONG_AT = INTRO_AT + INTRO_LENGTH - 1.5;
/**
 * The intro plays once from the doors; her song then becomes the music strip's track and loops. Neither is
 * in the normal rotation: skipping the song returns to the battle playlist, which never includes it.
 */
/** on the SFX bus, not the music one: it is part of the scene and plays even with the music muted */
const INTRO: Cue = { url: 'assets/audio/music/sakura_intro.mp3', volume: .3, voices: 1, gap: 0 };
const SONG: Track = { url: 'assets/audio/music/sakura_song.mp3', title: 'Sakura Song', volume: .27 };
/** shot start times: arrival, offering, doors, emergence, her line, the blessing crane */
const SHOTS: readonly number[] = [0, LEAD + 3, LEAD + 6.2, LEAD + 9, LEAD + 12, LEAD + 15.6];
/**
 * Shrine-local spots (sakura-kit.ts): floor top, her mark just inside the doorway (the offering box's
 * back face is at -1.725, so she never reaches it), inside, the player's mark, the box lid.
 */
const FLOOR = .685, INSIDE_Z = -.2, MARK_Z = -1.15, PLAYER_Z = -5, LID = 1.35;
/** the walk clip drives everything outside this subtree (hips and legs); talk_idle holds the spine up */
const SPINE = 'Bip001 Spine';
/** centre door leaves slide this far (sakura-kit.ts openX), stepping back off the front track first */
const DOOR_SLIDE = 1.1, DOOR_STEP = .2;

const SAKURA_ICON = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'><g fill='%23ffb3c8' stroke='%23e46a91' stroke-width='.5'>${[0, 72, 144, 216, 288].map((a) => `<path transform='rotate(${a} 8 8)' d='M8 8C6 6.4 5.9 3.4 7.2 1.9l.8.9.8-.9C10.1 3.4 10 6.4 8 8z'/>`).join('')}</g><circle cx='8' cy='8' r='1.3' fill='%23ffd75e'/></svg>`).replace(/%2523/g, '%23')}`;
const FLASK_ICON = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'><path d='M6.9 1.2h2.2v.8l-.3 1.6c.4 1 3.3 3.4 3.3 6.4 0 2.8-1.6 4.8-4.1 4.8S3.9 12.8 3.9 10c0-3 2.9-5.4 3.3-6.4l-.3-1.6z' fill='%23f7f4eb' stroke='%23293f54' stroke-width='.7'/><rect x='6.7' y='.8' width='2.6' height='.9' rx='.3' fill='%23293f54'/><circle cx='8' cy='10.4' r='1.5' fill='%23ad172e'/></svg>`).replace(/%2523/g, '%23')}`;
const PINK: [number, number, number] = [1, .55, .72];
/** each NIKKE's line on taking the cup, on taking the flask, and once the cutscene hands control back */
const BARKS: Record<'cup' | 'flask' | 'after', Record<string, string>> = {
  cup: { 'snow-white': "Is this cup's Scarlet's?", rapunzel: "Is this cup's Scarlet's?", scarlet: 'Ahh, mine cup.', nayuta: "Verily, formeth this cup a part of Scarlet's effects?" },
  flask: { 'snow-white': "It's full.  So must not be Scarlet's.", rapunzel: "It's full.  So must not be Scarlet's.", scarlet: 'Full?  Splendid!', nayuta: "Verily, it is replete. Hence, it belongeth not to Scarlet" },
  after: { 'snow-white': "Scarlet won't be happy I gave that away.", rapunzel: "Scarlet won't be happy I gave that away.", scarlet: 'Dost thou not share?!', nayuta: 'Verily, Scarlet shall be most displeased that I have relinquished that item.' },
};

const ease = (t: number): number => { const c = Math.max(0, Math.min(1, t)); return c * c * (3 - 2 * c); };
const flat = (a: { x: number; z: number }, b: { x: number; z: number }): number => Math.hypot(a.x - b.x, a.z - b.z);
const pick = <T>(list: T[]): T => list[Math.floor(Math.random() * list.length)];

export type SakuraEggContext = Pick<EggContext, 'scene' | 'shadows' | 'vfx' | 'targets' | 'player' | 'camera' | 'toScreen' | 'refreshUnits' | 'hud' | 'radarLabel' | 'liftBusy' | 'lockLift' | 'characterId'>;

export class SakuraShrineEgg {
  step: SakuraStep = 'cup';
  /** Raptures, the run clock and the kit hold still (the cutscene). */
  get freezesWorld(): boolean { return this.cutsceneRunning; }
  /** where the player looks during the cutscene; null otherwise */
  aim: Vector3 | null = null;
  onStep: ((step: SakuraStep) => void) | null = null;

  private enabled = false;
  private readonly shrine: { x: number; z: number; scale: number };
  private readonly cupAt: Vector3;
  /** the bench seat's long axis (unit) and half length, for 'near the cup' anywhere along it */
  private readonly seatAxis: Vector3;
  private readonly seatHalf: number;
  private readonly flaskAt = new Vector3();
  /** where the flask can stand: south of a tree the player can walk up to */
  private readonly flaskSpots: Vector3[];
  private cup: TransformNode | null = null;
  private flask: TransformNode | null = null;
  private glint = 0;
  private icon: HTMLImageElement | null = null;
  private sakura: Chibi | null = null;
  /** her walk: talk_idle for the body, walk on the legs (masked clones, outside Chibi's own crossfade) */
  private gait: AnimationGroup[] = [];
  /** the cup and flask laid on the offering box */
  private offerings: TransformNode[] = [];
  private bars: HTMLDivElement[] = [];
  private walking: 'out' | 'in' | null = null;
  private walkAge = 0;
  private caption: HTMLDivElement | null = null;
  private bark: { el: HTMLDivElement; age: number; delay: number } | null = null;
  private captionAge = 0;
  private cutsceneWaiting = false;
  private cutsceneRunning = false;
  private backdrop: SakuraBackdrop | null = null;
  private cut = 0;
  private blessed = false;
  /** seconds of the blessing left; drunk Raptures carry it as their own timer */
  private blessing = 0;
  /** doors: 0 shut, 1 open; `doorTo` is where they are heading */
  private door = 0;
  private doorTo = 0;
  private readonly tipsy = new Set<Target>();
  private readonly camFrom = new Vector3();
  private readonly head = new Vector3();
  private token = 0;

  constructor(private readonly ctx: SakuraEggContext) {
    const all = sakuraPlacements();
    const shrine = all.find((p) => p.asset === 'sakura-shrine')!;
    this.shrine = { x: shrine.x, z: shrine.z, scale: shrine.scale };
    // The centre of the seat: worn-seat-plank tops out at 0.89 m (sakura-kit.ts).
    const bench = pick(all.filter((p) => p.asset === 'sakura-bench'));
    this.cupAt = new Vector3(bench.x, .89 * bench.scale, bench.z);
    // The 3 m seat runs along the bench's local X; a turned bench keeps the player off its ends.
    this.seatAxis = new Vector3(Math.cos(bench.yaw), 0, -Math.sin(bench.yaw));
    this.seatHalf = 1.5 * bench.scale;
    // Clear of the trunk on the south side; the underplanting sits north of every tree. The outer
    // decorative ring stands past the playable edge, so only trees well inside it count.
    this.flaskSpots = all.filter((p) => p.asset === 'sakura')
      .map((p) => new Vector3(p.x, 0, p.z - (.55 * p.scale + .9)))
      .filter((v) => Math.hypot(v.x, v.z) < ARENA_RADIUS * SAKURA_SCALE - 2);
  }

  get label(): string { return STEP_LABELS[this.step]; }
  get active(): boolean { return this.enabled; }
  /** the current objective's ground position, for the lab's teleport */
  get objective(): { x: number; z: number } {
    // Beside the seat's long side.
    if (this.step === 'cup') return { x: this.cupAt.x - this.seatAxis.z * 1.6, z: this.cupAt.z + this.seatAxis.x * 1.6 };
    if (this.step === 'flask') return { x: this.flaskAt.x, z: this.flaskAt.z - 1.5 };
    return this.local(0, PLAYER_Z + 1);
  }

  /** Only the Sakura Grove hosts the egg. */
  setEnabled(enabled: boolean): void {
    if (enabled === this.enabled) return;
    this.enabled = enabled;
    // Decoded with the map: a cue's first play() only loads it, and the intro opens the cutscene.
    if (enabled) audioEngine.preload([INTRO.url]);
    this.goTo('cup', true);
  }

  /** Jump to a step: clears everything in flight, then sets up that step's world state. */
  goTo(step: SakuraStep, quiet = false): void {
    this.token++;
    this.clear(step);
    this.step = step;
    const at = SAKURA_STEPS.indexOf(step);
    if (this.enabled) {
      if (step === 'cup') this.placeCup();
      if (step === 'flask') this.placeFlask();
      if (step === 'flask') this.setIcon(SAKURA_ICON);
      if (step === 'shrine') this.backdrop ??= new SakuraBackdrop(this.ctx.scene);
      if (at >= SAKURA_STEPS.indexOf('shrine') && at <= SAKURA_STEPS.indexOf('cutscene')) this.setIcon(FLASK_ICON);
      if (step === 'cutscene') { if (this.ctx.liftBusy()) this.cutsceneWaiting = true; else this.startCutscene(); }
      if (step === 'blessing') this.bless();
    }
    if (!quiet) this.onStep?.(step);
  }

  update(dt: number): void {
    if (!this.enabled) return;
    const player = this.ctx.player;
    if (this.step === 'cup' && this.cup) {
      if (player.hp > 0 && this.nearSeat(player.position)) { this.pickup(this.cupAt); this.goTo('flask'); this.speak('cup'); }
    }
    if (this.step === 'flask' && this.flask) {
      // A pink glint now and then, so it can be spotted under the blossom.
      if ((this.glint -= dt) <= 0) { this.glint = 2.4; this.ctx.vfx.flashSprite(this.flaskAt.add(new Vector3(0, .9, 0)), PINK, .9, .5, .7, 'star'); }
      if (player.hp > 0 && flat(player.position, this.flaskAt) < 1.2) { this.pickup(this.flaskAt); this.goTo('shrine'); this.speak('flask'); }
    }
    if (this.step === 'shrine' && player.hp > 0 && !this.ctx.liftBusy() && flat(player.position, this.local(0, -3.4)) < 4.5) this.goTo('cutscene');
    if (this.step === 'cutscene' && this.cutsceneWaiting && !this.ctx.liftBusy()) { this.cutsceneWaiting = false; this.startCutscene(); }
    if (this.step === 'cutscene' && this.cutsceneRunning) this.updateCutscene(dt);
    if (this.step === 'blessing') this.updateBlessing(dt);
    this.updateDoors(dt);
    this.updateSakura(dt);
    this.updateCaption(dt);
    this.updateBark(dt);
  }

  /** Shrine-local metres (sakura-kit.ts) to the world; the shrine faces south (-Z) unrotated. */
  private local(x: number, z: number, y = 0): Vector3 {
    const s = this.shrine.scale;
    return new Vector3(this.shrine.x + x * s, y * s, this.shrine.z + z * s);
  }

  // --- 1–2. cup and flask --------------------------------------------------------------
  /** within reach of the seat: beside it anywhere along its length, or at either end */
  private nearSeat(p: Vector3): boolean {
    const dx = p.x - this.cupAt.x, dz = p.z - this.cupAt.z;
    const along = Math.max(-this.seatHalf, Math.min(this.seatHalf, dx * this.seatAxis.x + dz * this.seatAxis.z));
    return Math.hypot(dx - this.seatAxis.x * along, dz - this.seatAxis.z * along) < 1.7;
  }
  private placeCup(): void {
    // Three times its 9 cm so it reads on the seat from the gameplay camera. Unrotated, its inscription faces south (-Z) toward the camera.
    const node = this.cup = createSakeSet(this.ctx.scene, 'cup');
    node.scaling.setAll(3); node.position.copyFrom(this.cupAt);
    for (const m of node.getChildMeshes()) this.ctx.shadows.addShadowCaster(m);
  }
  private placeFlask(): void {
    // Chosen when it appears, against the live collision map: never inside scenery.
    const nav = this.ctx.targets.navigation;
    const open = this.flaskSpots.filter((v) => nav.clear(v, v, .5));
    this.flaskAt.copyFrom(pick(open.length ? open : this.flaskSpots));
    const node = this.flask = createSakeSet(this.ctx.scene, 'jug');
    node.scaling.setAll(2.4); node.position.copyFrom(this.flaskAt);
    for (const m of node.getChildMeshes()) this.ctx.shadows.addShadowCaster(m);
    this.glint = 0;
  }
  private pickup(at: Vector3): void {
    audioEngine.play(UI.select);
    this.ctx.vfx.flashSprite(at.clone().addInPlaceFromFloats(0, .4, 0), PINK, 1.4, .4, .9);
    this.ctx.vfx.ring(at.clone(), PINK, .2, 1.4, .45, .7);
    for (let i = 0; i < 6; i++) this.ctx.vfx.flashSprite(at.add(new Vector3(Math.cos(i * 2.4) * .5, .3 + (i % 3) * .25, Math.sin(i * 2.4) * .5)), PINK, .5, .7, .8, 'petal');
  }
  private setIcon(url: string | null): void {
    if (!url) { this.icon?.remove(); this.icon = null; return; }
    const label = this.ctx.radarLabel; if (!label) return;
    if (!this.icon) {
      const img = this.icon = document.createElement('img');
      img.className = 'egg-radar-icon'; img.alt = '';
      Object.assign(img.style, { position: 'absolute', width: '1em', height: '1em', right: '100%', top: '50%', transform: 'translate(-1.6em,-50%)', opacity: '.8', pointerEvents: 'none' });
      label.style.position ||= 'absolute';
      label.append(img);
    }
    this.icon.src = url;
  }

  // --- 3–4. the shrine cutscene ------------------------------------------------------------
  private doors(): TransformNode[] {
    // range-dressing.ts keeps the placed shrine's centre leaves live; the hidden template has its own.
    return this.ctx.scene.transformNodes.filter((n) => /\.shrine-door-(left|right)$/.test(n.name) && n.isEnabled());
  }
  private updateDoors(dt: number): void {
    if (this.door === this.doorTo) return;
    this.door = this.doorTo > this.door ? Math.min(this.doorTo, this.door + dt / DOORS_TIME) : Math.max(this.doorTo, this.door - dt / DOORS_TIME);
    this.setDoors(this.door);
  }
  private setDoors(open: number): void {
    for (const leaf of this.doors()) {
      const side = leaf.name.endsWith('left') ? -1 : 1;
      // Back off the front track, then slide behind the fixed outer panels.
      leaf.position.z = DOOR_STEP * ease(open / .25);
      leaf.position.x = side * DOOR_SLIDE * ease((open - .2) / .8);
    }
  }
  private async raiseSakura(): Promise<void> {
    const token = this.token;
    const index = await loadChibiIndex();
    const variant = index.variants[SAKURA];
    const chibi = variant ? await Chibi.load(this.ctx.scene, variant).catch(() => null) : null;
    if (!chibi) return;
    if (token !== this.token) { chibi.dispose(); return; }
    this.despawn();
    this.sakura = chibi;
    // Waiting inside, behind the shut doors.
    chibi.root.position.copyFrom(this.local(0, INSIDE_Z));
    chibi.root.rotation.y = Math.PI;
    chibi.setLift(FLOOR * this.shrine.scale);
    for (const m of chibi.meshes) this.ctx.shadows.addShadowCaster(m);
    this.ctx.refreshUnits();
    // No gun in the shrine: hide the weapon meshes for the whole scene.
    for (const m of chibi.meshes) if (/weapon/i.test(m.name)) m.isVisible = false;
    chibi.play('talk_idle', { loop: true, fade: 0 });
    chibi.update(0);
  }
  /** Take her away with her walk clones. */
  private despawn(): void {
    for (const g of this.gait) g.dispose();
    this.gait = [];
    this.sakura?.dispose(); this.sakura = null; this.walking = null;
  }
  /** Walk with the legs only: talk_idle keeps her upper body composed. */
  private setGait(on: boolean): void {
    const s = this.sakura; if (!s) return;
    for (const g of this.gait) g.dispose();
    this.gait = [];
    if (!on) { s.play('talk_idle', { loop: true, fade: 0 }); return; }
    // Split at the spine like the player rig (rig.ts): legs keep the walk's own pelvis, so they stay on the hips.
    const spine = s.joint(SPINE), upper = spine ? [spine.name, ...spine.getDescendants(false).map((d) => d.name)] : [];
    for (const name of s.clipNames()) { const g = s.animationGroup(name); if (g) { g.stop(); g.weight = 0; } }
    for (const [clip, mode] of [['walk', AnimationGroupMaskMode.Exclude], ['talk_idle', AnimationGroupMaskMode.Include]] as const) {
      const g = s.animationGroup(clip)?.clone(`sakura-gait-${clip}`, (t) => t);
      if (!g) continue;
      g.mask = new AnimationGroupMask(upper, mode);
      g.weight = 1;
      g.start(true, clip === 'walk' ? .8 : 1);
      this.gait.push(g);
    }
    // Chibi.update is paused while walking; hold talk_idle's facing.
    s.facingNode.rotation.y = s.clipYaw('talk_idle');
  }
  private updateSakura(dt: number): void {
    const s = this.sakura; if (!s) return;
    if (this.walking) {
      const t = Math.min(1, (this.walkAge += dt) / WALK_TIME);
      const [from, to] = this.walking === 'out' ? [INSIDE_Z, MARK_Z] : [MARK_Z, INSIDE_Z];
      s.root.position.copyFrom(this.local(0, from + (to - from) * t));
      s.root.rotation.y = this.walking === 'out' ? Math.PI : 0;
      if (t >= 1) {
        const back = this.walking === 'in';
        this.walking = null;
        this.setGait(false);
        // Home again: shut the doors behind her, then she is gone.
        if (back) { this.doorTo = 0; this.despawn(); return; }
      }
    }
    if (!this.walking) s.update(dt);
  }
  private walk(dir: 'out' | 'in'): void {
    if (!this.sakura) return;
    this.walking = dir; this.walkAge = 0;
    this.setGait(true);
  }
  private startCutscene(): void {
    const backdrop = this.backdrop ??= new SakuraBackdrop(this.ctx.scene);
    const token = this.token;
    void Promise.all([backdrop.ready, this.raiseSakura()]).then(async () => {
      if (token !== this.token || !this.enabled || this.step !== 'cutscene') return;
      // The Events tool can enter immediately after changing maps. Wait for
      // architecture and character textures too, not just the distant orchard.
      const meshes = this.ctx.scene.meshes.filter(m => m.isEnabled() && m.material);
      const textures = [...new Set(meshes.flatMap(m => m.material!.getActiveTextures()))];
      await new Promise<void>(resolve => Texture.WhenAllReady(textures, resolve));
      if (token !== this.token || !this.enabled || this.step !== 'cutscene') return;
      await this.ctx.scene.whenReadyAsync();
      if (token !== this.token || !this.enabled || this.step !== 'cutscene') return;
      if (this.ctx.liftBusy()) { this.cutsceneWaiting = true; return; }
      backdrop.show();
      this.beginCutscene();
    });
  }
  private beginCutscene(): void {
    const { player, camera, hud } = this.ctx;
    this.cutsceneRunning = true;
    this.ctx.lockLift(true);
    this.cut = 0;
    // Stand the player on a fixed mark below the steps, facing the shrine, so every shot frames the same.
    const mark = this.local(0, PLAYER_Z);
    player.position.set(mark.x, player.position.y, mark.z);
    player.unstick();
    player.transported = true;
    this.camFrom.copyFrom(camera.camera.position);
    hud.style.visibility = 'hidden';
    this.aim = this.local(0, MARK_Z, 1.2);
    camera.override = (cam) => this.placeCamera(cam);
    this.letterbox(true);
    audioEngine.stopMusic(); setNowPlaying(null);
    this.petals();
  }
  private updateCutscene(dt: number): void {
    const t = this.cut += dt, prev = t - dt;
    this.ctx.player.rig.legYaw = 0;
    const crossed = (at: number) => prev < at && t >= at;
    // The tall flask on the left, so the close-up on her line (from the right) looks past the small cup.
    if (crossed(CUP_AT)) this.offer('cup', .22);
    if (crossed(JUG_AT)) this.offer('jug', -.22);
    if (crossed(INTRO_AT)) audioEngine.play(INTRO);
    if (crossed(DOORS_AT)) this.doorTo = 1;
    if (crossed(SONG_AT)) {
      void audioEngine.playMusic(SONG);
      const battle = () => playPlaylist(Object.values(BATTLE_TRACKS).sort(() => Math.random() - .5));
      setNowPlaying(SONG.title, { next: battle, previous: battle });
    }
    if (crossed(GUST_AT)) this.gust();
    if (crossed(WALK_AT)) this.walk('out');
    if (crossed(LINE_AT)) {
      this.caption = this.captionElement(LINE); this.captionAge = 0;
      const s = this.sakura;
      if (s && !this.walking) s.play(s.has('talk_1') ? 'talk_1' : 'talk_idle', { loop: false, fade: .25, onEnd: () => s.play('talk_idle', { loop: true, fade: .3 }) });
    }
    if (crossed(BLESS_AT)) {
      // The garden answers: a pink bloom from the offering box out over the court.
      const box = this.local(0, -2, 1.4);
      this.ctx.vfx.ring(this.local(0, -2.6, .7), PINK, .4, 9, 1.1, .8);
      this.ctx.vfx.flashSprite(box, PINK, 4, .6, .9);
      for (let i = 0; i < 18; i++) {
        const a = i * 2.4, r = 1 + (i % 6) * .8;
        this.ctx.vfx.flashSprite(box.add(new Vector3(Math.cos(a) * r, (i % 4) * .5, Math.sin(a) * r * .6 - 1)), PINK, .5 + (i % 3) * .2, 1.4, .85, 'petal');
      }
          }
    if (t >= END_AT) { this.goTo('blessing'); this.speak('after', .8); }
  }
  /**
   * A shot list with hard cuts (SHOTS), all in shrine-local metres. Every framing stays off the centre
   * line so the bell rope (x≈0, z=-2.45) never crosses her, and the lines of sight clear the
   * facade posts (x=±1.15, z=-1.65) and the offering box lid.
   */
  private placeCamera(cam: UniversalCamera): void {
    const t = this.cut;
    let shot = 0; while (shot + 1 < SHOTS.length && t >= SHOTS[shot + 1]) shot++;
    const k = ease((t - SHOTS[shot]) / ((SHOTS[shot + 1] ?? END_AT) - SHOTS[shot]));
    const L = (x: number, y: number, z: number) => this.local(x, z, y);
    const her = this.sakura ? this.sakura.head(this.head) : L(0, 1.6, MARK_Z);
    let from: Vector3, to: Vector3, look: Vector3;
    switch (shot) {
      case 0: // Arrival: very wide and low from far down the court, the lone figure before the shrine.
        from = L(-3.6, .5, -11.4); to = L(-3.2, .55, -10.8); look = L(0, 1.7, -1.2); break;
      case 1: // Offering: macro over the box lid as the cup, then the flask, are set down.
        from = L(-.95, LID + .25, -2.95); to = L(-.6, LID + .2, -2.75); look = L(0, LID + .1, -2); break;
      case 2: // Doors: low on the steps, looking up as the screens slide apart and the gust bursts out.
        from = L(1.6, .9, -3.35); to = L(1.4, .92, -3.1); look = L(0, 1.8, -1.4); break;
      case 3: // Emergence: from just above the lid, she comes out of the dark toward the light.
        from = L(-1.05, 1.6, -3.05); to = L(-.9, 1.58, -2.9); look = her.subtract(new Vector3(0, .25, 0)); break;
      case 4: // Her line: a close three-quarter on her face, easing in.
        from = L(.85, 1.75, -2.75); to = L(.7, 1.72, -2.6); look = her; break;
      default: // Blessing: a slow crane up and back over the player as the petals bloom out of the court.
        from = L(.6, 1.4, -7.5); to = L(0, 4.5, -11); look = L(0, 1.2, -2); break;
    }
    // The first shot eases in from the gameplay view instead of cutting.
    const blend = shot === 0 ? ease(t / 1.6) : 1;
    cam.position.copyFrom(Vector3.Lerp(this.camFrom, Vector3.Lerp(from, to, k), blend));
    cam.setTarget(look);
  }
  /** Lay one piece of the offering on the box lid, inscription toward the court. */
  private offer(piece: 'cup' | 'jug', x: number): void {
    const node = createSakeSet(this.ctx.scene, piece);
    node.scaling.setAll(piece === 'cup' ? 3 : 2.4);
    node.position.copyFrom(this.local(x, -2, LID));
    for (const m of node.getChildMeshes()) this.ctx.shadows.addShadowCaster(m);
    this.offerings.push(node);
    this.ctx.vfx.flashSprite(node.position.clone().addInPlaceFromFloats(0, .25, 0), PINK, .9, .6, .6);
  }
  /** Cinema bars: slide in for the scene, out when control comes back. */
  private letterbox(on: boolean): void {
    if (on) {
      this.bars = (['top', 'bottom'] as const).map((edge) => {
        const bar = document.createElement('div');
        bar.className = 'egg-letterbox';
        Object.assign(bar.style, { position: 'fixed', left: '0', right: '0', [edge]: '0', height: '12vh', background: '#000', zIndex: '45', pointerEvents: 'none' });
        bar.dataset.edge = edge;
        document.body.append(bar);
        bar.animate([{ transform: `translateY(${edge === 'top' ? '-' : ''}100%)` }, { transform: 'none' }], { duration: 900, easing: 'ease-out', fill: 'forwards' });
        return bar;
      });
      return;
    }
    for (const bar of this.bars) {
      const sign = bar.dataset.edge === 'top' ? '-' : '';
      bar.animate([{ transform: 'none' }, { transform: `translateY(${sign}100%)` }], { duration: 700, easing: 'ease-in', fill: 'forwards' }).finished.then(() => bar.remove(), () => bar.remove());
    }
    this.bars = [];
  }
  /** Blossom drifting across the court on the wind for the whole scene. */
  private petals(): void {
    const vfx = this.ctx.vfx, s = this.shrine.scale;
    const flakes = Array.from({ length: 70 }, (_, i) => ({ q: vfx.quad('petal', PINK, 0), p: new Vector3(), v: new Vector3(), seed: i * 1.37 }));
    const respawn = (f: typeof flakes[number], scatter: boolean) => {
      // Upwind (west) of the court, at any height, drifting east and slowly down.
      f.p.copyFrom(this.local(scatter ? -5 + Math.random() * 10 : -5.5, -9 + Math.random() * 9, .3 + Math.random() * 3.4));
      f.v.set((1.2 + Math.random() * .9) * s, -.25 * s, (Math.random() - .5) * .4 * s);
    };
    for (const f of flakes) respawn(f, true);
    let out = 0;
    vfx.add({
      update: (dt, age) => {
        out = this.cutsceneRunning ? 0 : out + dt;
        const a = ease(age / 1.5) * (1 - ease(out / 1.5)), cam = this.ctx.camera.camera;
        if (out >= 1.5) return false;
        for (const f of flakes) {
          f.p.addInPlaceFromFloats((f.v.x + Math.sin(age * 2.3 + f.seed) * .4) * dt, (f.v.y + Math.cos(age * 1.7 + f.seed) * .3) * dt, f.v.z * dt);
          if (f.p.x > this.shrine.x + 6 * s || f.p.y < 0) respawn(f, false);
          vfx.sprite(f.q, f.p, .16 + (f.seed % 1) * .1, age * 1.5 + f.seed);
          // Petals drifting right past the lens would fill the frame: fade those out.
          const near = Vector3.Distance(f.p, cam.position);
          vfx.tint(f.q, PINK, a * .85 * Math.max(0, Math.min(1, (near - 1.2) / 1.5)));
        }
        return true;
      },
      dispose: () => { for (const f of flakes) vfx.release(f.q); },
    });
  }
  /** The doors part and a gust of blossom pours out of the dark toward the court. */
  private gust(): void {
    const door = this.local(0, -1.4, 1.6);
    for (let i = 0; i < 26; i++) {
      const a = i * 2.4;
      this.ctx.vfx.flashSprite(door.add(new Vector3(Math.cos(a) * (.3 + (i % 5) * .35), Math.sin(a * 1.3) * .7, -(i % 7) * .45)), PINK, .3 + (i % 3) * .12, 1.6, .9, 'petal');
    }
  }
  private endCutscene(): void {
    if (!this.cutsceneRunning) return;
    this.cutsceneRunning = false;
    this.ctx.lockLift(false);
    const { player, camera, hud } = this.ctx;
    player.transported = false;
    camera.override = null;
    this.backdrop?.dispose(); this.backdrop = null;
    hud.style.visibility = '';
    this.aim = null;
    this.letterbox(false);
  }

  // --- 5. the blessing -------------------------------------------------------------------
  private bless(): void {
    this.blessing = BLESSING; this.blessed = true;
    // She heads back in once the player has control again.
    this.walk('in');
  }
  private updateBlessing(dt: number): void {
    this.blessing = Math.max(0, this.blessing - dt);
    if (this.blessing <= 0) { this.goTo('done'); return; }
    // Raptures that arrive mid-blessing get drunk too, for whatever is left of it.
    for (const t of this.ctx.targets.targets) {
      if (!t.alive || t.removed) continue;
      t.drunk = Math.max(t.drunk, this.blessing);
      if (this.tipsy.has(t)) continue;
      this.tipsy.add(t);
      const generation = t.generation;
      drunkEffect(this.ctx.vfx, () => t.position, t.barHeight + .6, () => {
        const on = t.alive && !t.removed && t.generation === generation && t.drunk > 0;
        if (!on) this.tipsy.delete(t);
        return on;
      });
    }
  }

  // --- captions -------------------------------------------------------------------------
  /** Place her line over her head. main.ts calls this after the camera has moved this frame. */
  layout(): void {
    if (this.bark) {
      // Well clear of the overhead name and health bar, like the forest egg's lines.
      const p = this.ctx.player.position, q = this.ctx.toScreen(p.x, p.y + 4.1, p.z);
      this.bark.el.style.transform = `translate(${q.x.toFixed(1)}px,${q.y.toFixed(1)}px) translate(-50%,-100%)`;
    }
    if (!this.caption) return;
    const s = this.sakura;
    const head = s ? s.head(this.head) : this.local(0, MARK_Z, 1.6);
    const p = this.ctx.toScreen(head.x, head.y + .55, head.z);
    this.caption.style.transform = `translate(${p.x.toFixed(1)}px,${p.y.toFixed(1)}px) translate(-50%,-100%)`;
  }
  /** The player's NIKKE says her line over her head after `delay` seconds; it survives step changes. */
  private speak(moment: keyof typeof BARKS, delay = 0): void {
    const text = BARKS[moment][this.ctx.characterId]; if (!text) return;
    this.bark?.el.remove();
    this.bark = { el: this.captionElement(text), age: 0, delay };
  }
  private updateBark(dt: number): void {
    const b = this.bark; if (!b) return;
    const a = (b.age += dt) - b.delay;
    b.el.style.opacity = String(a < 0 ? 0 : a < 2.6 ? ease(a / .4) : 1 - ease((a - 2.6) / .5));
    if (a > 3.1) { b.el.remove(); this.bark = null; }
  }
  private updateCaption(dt: number): void {
    const c = this.caption; if (!c) return;
    const a = this.captionAge += dt;
    c.style.opacity = String(a < LINE_TIME ? ease(a / .5) : 1 - ease((a - LINE_TIME) / .5));
    if (a > LINE_TIME + .5) { c.remove(); this.caption = null; }
  }
  private captionElement(text: string): HTMLDivElement {
    const el = document.createElement('div');
    el.className = 'egg-caption';
    el.textContent = text;
    // The HUD is hidden for the cutscene; the caption opts back in.
    Object.assign(el.style, {
      position: 'absolute', left: '0', top: '0', pointerEvents: 'none', whiteSpace: 'nowrap', opacity: '0',
      font: 'italic 600 18px Rajdhani, sans-serif', letterSpacing: '.08em', color: '#fff0f5',
      textShadow: '0 0 8px #ff7fa8, 0 0 2px #000', visibility: 'visible',
    });
    this.ctx.hud.append(el);
    return el;
  }

  /** Remove whatever the current step put in the world and give back what the cutscene took. */
  private clear(next: SakuraStep | null = null): void {
    this.cup?.dispose(); this.cup = null;
    this.flask?.dispose(); this.flask = null;
    this.setIcon(null);
    this.cutsceneWaiting = false;
    this.endCutscene();
    if (!this.enabled || (next !== 'shrine' && next !== 'cutscene')) {
      this.backdrop?.dispose(); this.backdrop = null;
    }
    this.caption?.remove(); this.caption = null;
    // Leaving the blessing early (lab steps, map change) sobers everyone up.
    if (this.blessed && this.step === 'blessing') for (const t of this.ctx.targets.targets) t.drunk = 0;
    this.blessed = false; this.blessing = 0;
    // She stays out from the cutscene into the blessing, and her walk home outlives it; any other jump
    // (a replayed cutscene, lab steps, a map change) takes her away, so there is never a second Sakura.
    const keep = this.enabled && ((this.step === 'cutscene' && next === 'blessing') || (this.step === 'blessing' && next === 'done'));
    if (!keep) {
      for (const n of this.offerings) n.dispose();
      this.offerings = [];
      this.despawn();
      this.door = this.doorTo = 0; this.setDoors(0);
    }
  }

  dispose(): void { this.token++; this.enabled = false; this.clear(); this.bark?.el.remove(); this.bark = null; this.despawn(); }
}

/** Test Lab "Events" section: step through the shrine offering. */
export function mountSakuraEggLab(egg: SakuraShrineEgg, player: Player, toSakura: () => void): HTMLElement {
  const panel = document.createElement('div');
  panel.className = 'egg-lab';
  panel.innerHTML = `<h3>Shrine offering</h3>
    <p data-status></p>
    <div class="weather-presets">
      <button type="button" data-act="back">◀ Back a step</button>
      <button type="button" data-act="forward">Forward a step ▶</button>
      <button type="button" data-act="teleport">Go to objective</button>
      <button type="button" data-act="reset">Restart event</button>
      <button type="button" data-act="sakura">Load Sakura Grove</button>
    </div>
    <p data-steps></p>`;
  const status = panel.querySelector<HTMLElement>('[data-status]')!;
  const steps = panel.querySelector<HTMLElement>('[data-steps]')!;
  const sync = () => {
    const at = SAKURA_STEPS.indexOf(egg.step);
    status.textContent = egg.active ? `Step ${at + 1}/${SAKURA_STEPS.length}: ${egg.label}` : 'Only runs in the Sakura Grove. Load it below.';
    steps.innerHTML = SAKURA_STEPS.map((s, i) => i === at ? `<b>${i + 1}. ${s}</b>` : `${i + 1}. ${s}`).join(' · ');
  };
  panel.addEventListener('pointerdown', (e) => e.stopPropagation());
  panel.addEventListener('click', (e) => {
    const act = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-act]')?.dataset.act;
    if (!act) return;
    if (act === 'sakura') toSakura();
    else if (egg.active) {
      const at = SAKURA_STEPS.indexOf(egg.step);
      if (act === 'back') egg.goTo(SAKURA_STEPS[Math.max(0, at - 1)]);
      if (act === 'forward') egg.goTo(SAKURA_STEPS[Math.min(SAKURA_STEPS.length - 1, at + 1)]);
      if (act === 'reset') egg.goTo('cup');
      if (act === 'teleport') { const o = egg.objective; player.position.set(o.x, player.position.y, o.z); player.unstick(); }
    }
    sync();
  });
  const previous = egg.onStep;
  egg.onStep = (step) => { previous?.(step); sync(); };
  sync();
  setInterval(() => { if (panel.isConnected && panel.offsetParent) sync(); }, 500);
  return panel;
}
