import {
  Color3,
  Engine,
  Matrix,
  MeshBuilder,
  Scene,
  StandardMaterial,
  Vector3,
  Viewport,
} from '@babylonjs/core';
import { CAMERA_PRESETS, MobaCamera, type CameraPreset } from './camera';
import { BASE, Chibi, loadChibiIndex, type ChibiIndex, type FacingMode } from './chibi';
import { COLORS, Combat, type AttackTarget } from './combat';
import { Hero } from './hero';
import { HERO_VARIANTS, heroFromQuery, kitOf, type HeroVariant } from './characters';
import { startMatchAudio } from './audio/match-audio';
import { mountMusicControl, mountVolumeRows } from './audio/music-control';
import { Hud, type ScreenPoint } from './hud';
import { HEROIC_LEVEL, slotInfo } from './abilities/common';
import type { Slot } from './abilities/types';
import { Minimap } from './minimap';
import { Indicators } from './targeting';
import { ARENA, BLUE_SPAWN, createWorld, type World } from './world';
import { BATTLEGROUNDS, MAP_ID } from './battleground';
import { createVisualSettings, VISUAL_PRESETS, type VisualPreset } from './visuals';
import { fitFrame } from './frame-layout';
import { loadSetting, saveSetting } from './settings-store';
// Rajdhani, as in the Survivors of Victory menus; the front end loads it too, but ?hero= links skip it.
import '@fontsource/rajdhani/600.css';
import '@fontsource/rajdhani/700.css';
import './style.css';

// 'hots': Heroes of the Storm. Right-click moves or attacks, A + left-click attack-moves,
//         S stop, H hold, Q W E R abilities, Z mount, B hearth.
// 'wasd': twin-stick (Battlerite / Supervive). WASD moves, mouse aims, hold left-click to shoot;
//         W moves to Space and A/S/D are taken, so there's no attack-move or stop key.
type ControlScheme = 'hots' | 'wasd';
// HotS cast modes: quick (fire at the cursor on key press), release (aim while held, fire on
// release), normal (aim, left-click to fire, right-click or Esc to cancel).
type CastMode = 'quick' | 'release' | 'normal';

const KEYMAP: Record<ControlScheme, Record<string, Slot>> = {
  hots: { KeyQ: 'Q', KeyW: 'W', KeyE: 'E', KeyR: 'R', KeyZ: 'Z', KeyB: 'B', KeyT: 'T' },
  wasd: { KeyQ: 'Q', Space: 'W', KeyE: 'E', KeyR: 'R', KeyZ: 'Z', KeyB: 'B', KeyT: 'T' },
};

const MOVE_KEYS: Record<string, [number, number]> = {
  KeyW: [0, 1],
  KeyS: [0, -1],
  KeyA: [-1, 0],
  KeyD: [1, 0],
};

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

async function main(): Promise<void> {
  const frame = $('frame');
  const canvas = $<HTMLCanvasElement>('game');
  canvas.tabIndex = -1;
  const engine = new Engine(canvas, true, { stencil: true }, true);
  const scene = new Scene(engine);
  // Targeting uses gameplay shapes (Combat.enemyOnRay), never Babylon's per-move mesh picking.
  scene.skipPointerMovePicking = true;
  const cam = new MobaCamera(scene, canvas, ARENA);
  const world = createWorld(scene, cam.camera);
  const visuals = createVisualSettings(scene, cam.camera, world);
  const combat = new Combat(scene, world);
  const indicators = new Indicators(scene);
  scene.activeCamera = cam.camera;

  const [index] = await Promise.all([loadChibiIndex(), combat.ready]);
  // Heroes and outfits come from the character registry (src/characters); ?hero= / ?v= pick one.
  const heroVariants = HERO_VARIANTS.filter((h) => index.variants[h.variant]);
  const wanted = heroFromQuery(new URLSearchParams(location.search));
  let current = heroVariants.includes(wanted) ? wanted : heroVariants[0];
  if (!current) throw new Error('chibi/index.json has no hero models (run npm run chibi)');
  $('loading').textContent = `INITIALIZING / ${current.name.toUpperCase()}`;

  const kit = kitOf(current.character);
  await combat.prepareKit(kit, current.variant, current.aim, current.muzzle);
  const hero = new Hero(await loadChibi(scene, world, index, current), world, combat, BLUE_SPAWN.clone(), kit, current.variant);
  combat.setHero(hero);
  startMatchAudio(combat, () => current.character, cam.focus);
  cam.focus.copyFrom(hero.position);

  const ring = MeshBuilder.CreateTorus('select-ring', { diameter: 1.6, thickness: 0.07, tessellation: 48 }, scene);
  const ringMat = new StandardMaterial('select-ring-mat', scene);
  ringMat.emissiveColor = new Color3(0.3, 0.85, 1);
  ringMat.disableLighting = true;
  ring.material = ringMat;
  ring.isPickable = false;
  world.glow.addIncludedOnlyMesh(ring);

  // --- frame layout ---------------------------------------------------------
  const minimap = new Minimap($<HTMLCanvasElement>('minimap'), world);
  // Desktop and landscape keep HotS-style aspect limits; narrow portrait screens use the full viewport.
  fitFrame(frame, () => { engine.resize(); minimap.resize(); });

  // --- picking --------------------------------------------------------------
  const groundAt = (x: number, y: number): Vector3 | null => {
    const ray = scene.createPickingRay(x, y, Matrix.Identity(), cam.camera);
    if (Math.abs(ray.direction.y) < 1e-5) return null;
    const t = -ray.origin.y / ray.direction.y;
    return t > 0 ? ray.origin.add(ray.direction.scale(t)) : null;
  };
  /** Ground point under a screen point, or far along the ray if it misses (for the view outline). */
  const groundOrFar = (x: number, y: number): Vector3 => {
    const ray = scene.createPickingRay(x, y, Matrix.Identity(), cam.camera);
    const t = ray.direction.y < -0.02 ? Math.min(-ray.origin.y / ray.direction.y, 150) : 150;
    const p = ray.origin.add(ray.direction.scale(t));
    p.y = 0;
    return p;
  };
  /** The AttackTarget under the cursor: its body first, then a ground point near its feet. */
  const enemyUnder = (x: number, y: number): AttackTarget | null => {
    const d = combat.enemyOnRay(scene.createPickingRay(x, y, Matrix.Identity(), cam.camera));
    if (d) return d;
    const g = groundAt(x, y);
    return g ? combat.enemyAt(g) : null;
  };

  const transform = new Matrix();
  // Called for every visible unit each frame; reuse the projection scratch objects.
  const projectFrom = new Vector3();
  const projected = new Vector3();
  const viewport = new Viewport(0, 0, 1, 1);
  const toScreen = (x: number, y: number, z: number): ScreenPoint => {
    viewport.width = engine.getRenderWidth();
    viewport.height = engine.getRenderHeight();
    const p = Vector3.ProjectToRef(projectFrom.set(x, y, z), Matrix.IdentityReadOnly, transform, viewport, projected);
    const s = engine.getHardwareScalingLevel(); // render pixels -> CSS pixels
    return { x: p.x * s, y: p.y * s, visible: p.z > 0 && p.z < 1 };
  };

  // --- input ----------------------------------------------------------------
  let scheme: ControlScheme = loadSetting('controls', ['hots', 'wasd'], 'hots');
  let castMode: CastMode = loadSetting('cast', ['quick', 'release', 'normal'], 'quick');
  // 'practice': choose a heroic from the start; 'level': HotS rules, at team level HEROIC_LEVEL
  let heroicRule: 'practice' | 'level' = loadSetting('heroics', ['practice', 'level'], 'practice');
  const heroicsOpen = () => heroicRule === 'practice' || combat.blue.level >= HEROIC_LEVEL;
  const pointer = { x: 0, y: 0 };
  const held = new Set<string>();
  const blockedUntilRelease = new Set<string>();
  let rmbHeld = false;
  /** the enemy a held right-click started on; null when the drag is a move */
  let rmbTarget: AttackTarget | null = null;
  let lmbHeld = false;
  let minimapDrag = false;
  let aiming: Slot | 'amove' | null = null;

  const cursor = () => groundAt(pointer.x, pointer.y) ?? hero.position.add(new Vector3(0, 0, 1));

  /** Right-click: attack the enemy under the cursor (returned), else move there. */
  const smartClick = (marker: boolean): AttackTarget | null => {
    if (combat.winner) return null;
    const enemy = enemyUnder(pointer.x, pointer.y);
    if (enemy) {
      hero.attack(enemy);
      return enemy;
    }
    const p = groundAt(pointer.x, pointer.y);
    if (!p) return null;
    hero.moveTo(p);
    if (marker) combat.moveMarker(p);
    return null;
  };

  const beginAim = (a: Slot | 'amove') => {
    aiming = a;
    canvas.classList.add('aiming');
  };
  const cancelAim = () => {
    aiming = null;
    indicators.hide();
    canvas.classList.remove('aiming');
  };
  const confirmAim = (at = cursor()) => {
    const a = aiming;
    cancelAim();
    if (a === 'amove') {
      const enemy = enemyUnder(pointer.x, pointer.y);
      if (enemy) hero.attack(enemy);
      else hero.attackMove(at);
      combat.moveMarker(at, COLORS.attack);
    } else if (a) {
      hero.cast(a, at);
    }
  };
  /** A slot's key was pressed (or its button clicked: `fromButton` aims first, never quick-casts). */
  const pressSlot = (slot: Slot, fromButton = false) => {
    if (combat.winner) return;
    if (!$('menu').classList.contains('hidden')) return;
    const spec = slotInfo(hero.kit, slot, hero.heroic);
    if (spec.passive) return;
    if (spec.aim === 'none' || (castMode === 'quick' && !fromButton)) {
      cancelAim();
      hero.cast(slot, cursor());
      return;
    }
    if (hero.canCast(slot)) beginAim(slot);
  };

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  frame.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('pointermove', (e) => {
    pointer.x = e.offsetX;
    pointer.y = e.offsetY;
  });
  canvas.addEventListener('pointerdown', (e) => {
    pointer.x = e.offsetX;
    pointer.y = e.offsetY;
    if (!$('menu').classList.contains('hidden')) {
      closeMenu();
      canvas.focus({ preventScroll: true });
      return;
    }
    canvas.focus({ preventScroll: true });
    if (e.button === 0) {
      if (aiming) confirmAim();
      else if (scheme === 'wasd') lmbHeld = true;
    } else if (e.button === 2) {
      if (aiming) {
        cancelAim(); // right-click cancels targeting, as in HotS
        return;
      }
      rmbHeld = true;
      rmbTarget = smartClick(true);
    }
  });
  window.addEventListener('pointerup', (e) => {
    if (e.button === 2) rmbHeld = false;
    if (e.button === 0) {
      lmbHeld = false;
      minimapDrag = false;
    }
  });
  window.addEventListener('blur', () => {
    rmbHeld = lmbHeld = minimapDrag = false;
    held.clear();
    blockedUntilRelease.clear();
    cancelAim();
  });

  // minimap: left-click/drag looks there, right-click moves there (attack-moves while aiming A)
  const mm = $<HTMLCanvasElement>('minimap');
  mm.addEventListener('pointerdown', (e) => {
    if (!$('menu').classList.contains('hidden')) return;
    const p = minimap.toWorld(e.clientX, e.clientY);
    if (e.button === 0 && aiming) {
      confirmAim(p);
    } else if (e.button === 0) {
      minimapDrag = true;
      cam.locked = false;
      cam.focus.set(p.x, 0, p.z);
    } else if (e.button === 2) {
      cancelAim();
      hero.moveTo(p);
      combat.moveMarker(p);
    }
  });
  mm.addEventListener('pointermove', (e) => {
    if (!minimapDrag) return;
    const p = minimap.toWorld(e.clientX, e.clientY);
    cam.focus.set(p.x, 0, p.z);
  });

  window.addEventListener('keyup', (e) => {
    held.delete(e.code);
    blockedUntilRelease.delete(e.code);
    if (castMode === 'release' && aiming && KEYMAP[scheme][e.code] === aiming) confirmAim();
  });

  // Keep native button activation out of both the game and camera key listeners.
  // Other hotkeys still work when settings restore focus to the menu button.
  frame.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLElement && e.target.closest('button') &&
        (e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter')) {
      e.stopPropagation();
    }
  });

  window.addEventListener('keydown', (e) => {
    if (combat.winner) return;
    if (e.code === 'F10') {
      if (!e.repeat) toggleMenu();
      e.preventDefault();
      return;
    }
    if (e.code === 'Escape') {
      if (!$('menu').classList.contains('hidden')) closeMenu();
      else cancelAim();
      return;
    }
    if (!$('menu').classList.contains('hidden')) {
      if (MOVE_KEYS[e.code]) blockedUntilRelease.add(e.code);
      if (e.code === 'Tab') {
        const controls = Array.from($('menu').querySelectorAll<HTMLElement>('button:not(:disabled), select:not(:disabled), input:not(:disabled), summary, [tabindex="0"]'))
          .filter((control) => {
            const closedDetails = control.closest('details:not([open])');
            const exposed = !closedDetails || control === closedDetails.querySelector(':scope > summary');
            return exposed && control.getClientRects().length > 0 && getComputedStyle(control).visibility !== 'hidden';
          });
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (!$('menu').contains(document.activeElement)) {
          (e.shiftKey ? last : first)?.focus();
          e.preventDefault();
        } else if (e.shiftKey && document.activeElement === first) {
          last?.focus();
          e.preventDefault();
        } else if (!e.shiftKey && document.activeElement === last) {
          first?.focus();
          e.preventDefault();
        }
      }
      return;
    }
    if (e.target instanceof HTMLElement && e.target.closest('select, input, textarea, [contenteditable="true"]')) return;
    if (blockedUntilRelease.has(e.code)) return;
    if (scheme === 'wasd' && MOVE_KEYS[e.code]) {
      held.add(e.code);
      e.preventDefault();
      return;
    }
    const slot = KEYMAP[scheme][e.code];
    if (slot) {
      if (!e.repeat) pressSlot(slot);
      e.preventDefault();
      return;
    }
    // heroic choice cards: 1 / 2 while they are showing
    const pick = /^(?:Digit|Numpad)([1-9])$/.exec(e.code);
    if (pick && heroicsOpen() && hero.heroic === null) {
      if (!e.repeat) hero.chooseHeroic(Number(pick[1]) - 1);
      e.preventDefault();
      return;
    }
    switch (e.code) {
      case 'KeyA':
        if (scheme === 'hots' && !e.repeat) beginAim('amove');
        break;
      case 'KeyS':
      case 'KeyH': // hold: stop and stay put (no idle auto-acquire yet, so the same as stop)
        cancelAim();
        hero.stop();
        break;
      case 'KeyY':
        if (!e.repeat) cam.locked = !cam.locked;
        break;
      case 'KeyK':
        if (!e.repeat) hero.kill();
        break;
      default:
        return;
    }
    e.preventDefault();
  });

  // --- HUD and menu ----------------------------------------------------------
  // One music strip attached above the minimap; Music / SFX volume rows live in F10.
  mountMusicControl($('map-panel'));
  mountVolumeRows($('audio-settings'));
  const hud = new Hud((slot) => pressSlot(slot, true), (index) => {
    if (heroicsOpen()) hero.chooseHeroic(index);
  });
  const iconUrl = (id: string) => (index.variants[id].icon ? `${BASE}${index.variants[id].icon}` : null);
  hud.setHero(current.name, iconUrl(current.variant), current.character.profile.accent);
  minimap.setIcon(iconUrl(current.variant));

  let menuReturnFocus: HTMLElement | null = null;
  function toggleMenu(): void {
    if (!$('menu').classList.contains('hidden')) {
      closeMenu();
      return;
    }
    menuReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    $('menu').classList.remove('hidden');
    $('menu-btn').setAttribute('aria-expanded', 'true');
    rmbHeld = lmbHeld = minimapDrag = false;
    for (const code of held) blockedUntilRelease.add(code);
    held.clear();
    hero.setMoveInput(0, 0);
    cancelAim();
    $('menu-close').focus({ preventScroll: true });
  }
  function closeMenu(): void {
    const wasOpen = !$('menu').classList.contains('hidden');
    const focusWasInMenu = $('menu').contains(document.activeElement);
    $('menu').classList.add('hidden');
    $('menu-btn').setAttribute('aria-expanded', 'false');
    if (wasOpen && focusWasInMenu) {
      const target = menuReturnFocus?.isConnected && menuReturnFocus !== document.body ? menuReturnFocus : canvas;
      target.focus({ preventScroll: true });
    }
  }
  $('menu-btn').addEventListener('click', toggleMenu);
  $('menu-close').addEventListener('click', closeMenu);

  function labelKeys(): void {
    const labels: Partial<Record<Slot, string>> = { D: 'D' };
    for (const [code, slot] of Object.entries(KEYMAP[scheme])) {
      labels[slot] = code === 'Space' ? 'SPC' : code.replace('Key', '');
    }
    hud.setKeys(labels);
  }
  labelKeys();

  const variantSel = $<HTMLSelectElement>('variant');
  const mapLabel = document.createElement('label'); mapLabel.textContent = 'Battleground (starts a new match)';
  const mapSelect = document.createElement('select'); mapSelect.id = 'battleground';
  for (const [id, map] of Object.entries(BATTLEGROUNDS)) mapSelect.add(new Option(`${map.name} — ${map.description}`, id, false, id === MAP_ID));
  mapLabel.append(mapSelect); $('heroics').closest('label')!.after(mapLabel);
  mapSelect.addEventListener('change', () => {
    const query = new URLSearchParams(location.search); query.set('map', mapSelect.value); query.set('v', current.variant); query.delete('hero');
    location.assign(`${location.pathname}?${query}`);
  });
  for (const h of heroVariants) {
    variantSel.add(new Option(`${h.name} (${h.variant})`, h.variant, false, h === current));
  }
  let switching = false;
  variantSel.addEventListener('change', async () => {
    variantSel.blur();
    if (switching) return;
    switching = true;
    try {
      const next = heroVariants.find((h) => h.variant === variantSel.value)!;
      const nextKit = kitOf(next.character);
      await combat.prepareKit(nextKit, next.variant, next.aim, next.muzzle);
      hero.setChibi(await loadChibi(scene, world, index, next), nextKit, next.variant);
      visuals.refreshUnits();
      current = next;
      hud.setHero(next.name, iconUrl(next.variant), next.character.profile.accent);
      minimap.setIcon(iconUrl(next.variant));
      buildClipButtons();
      history.replaceState(null, '', `?hero=${next.character.id}&v=${next.variant}`);
    } finally {
      switching = false;
      variantSel.value = current.variant;
    }
  });

  const facingSel = $<HTMLSelectElement>('facing');
  facingSel.addEventListener('change', () => {
    facingSel.blur();
    hero.chibi.setFacingMode(facingSel.value as FacingMode);
  });

  const controlsSel = $<HTMLSelectElement>('controls');
  controlsSel.value = scheme;
  controlsSel.addEventListener('change', () => {
    controlsSel.blur();
    scheme = controlsSel.value as ControlScheme;
    saveSetting('controls', scheme);
    held.clear();
    cancelAim();
    hero.setMoveInput(0, 0);
    labelKeys();
    renderHelp();
  });

  const castSel = $<HTMLSelectElement>('cast');
  castSel.value = castMode;
  castSel.addEventListener('change', () => {
    castSel.blur();
    castMode = castSel.value as CastMode;
    saveSetting('cast', castMode);
    cancelAim();
    renderHelp();
  });

  const heroicsSel = $<HTMLSelectElement>('heroics');
  heroicsSel.value = heroicRule;
  heroicsSel.addEventListener('change', () => {
    heroicsSel.blur();
    heroicRule = heroicsSel.value as typeof heroicRule;
    saveSetting('heroics', heroicRule);
  });

  const camPreset: CameraPreset = loadSetting('camera', Object.keys(CAMERA_PRESETS) as CameraPreset[], 'classic');
  const cameraSel = $<HTMLSelectElement>('camera');
  for (const [id, p] of Object.entries(CAMERA_PRESETS)) cameraSel.add(new Option(p.label, id, false, id === camPreset));
  cam.setPreset(camPreset);
  cameraSel.addEventListener('change', () => {
    cameraSel.blur();
    cam.setPreset(cameraSel.value as CameraPreset);
    saveSetting('camera', cameraSel.value);
  });

  const visualSel = $<HTMLSelectElement>('visuals');
  const ambientSel = $<HTMLSelectElement>('ambient-shadows');
  ambientSel.value = loadSetting('ambient-shadows', ['on', 'off'], 'on');
  if (!visuals.ambientShadowsSupported) {
    ambientSel.value = 'off';ambientSel.disabled = true;
  }
  visuals.setAmbientShadows(ambientSel.value === 'on');
  const visualPreset = loadSetting('visuals', Object.keys(VISUAL_PRESETS) as VisualPreset[], 'daylight');
  for (const [id, label] of Object.entries(VISUAL_PRESETS)) visualSel.add(new Option(label, id, false, id === visualPreset));
  visuals.apply(visualPreset);
  function syncAmbientControl(): void {
    const previous = visuals.current === 'original';
    ambientSel.disabled = previous || !visuals.ambientShadowsSupported;
    ambientSel.value = ambientSel.disabled ? 'off' : loadSetting('ambient-shadows', ['on', 'off'], 'on');
    ambientSel.title = previous ? 'Previous lighting keeps contact shading off for comparison.' : 'Subtle contact shading under units and between surfaces.';
  }
  syncAmbientControl();
  visualSel.addEventListener('change', () => {
    visualSel.blur();
    visuals.apply(visualSel.value as VisualPreset);
    saveSetting('visuals', visualSel.value);
    syncAmbientControl();
  });
  ambientSel.addEventListener('change', () => {
    ambientSel.blur();
    visuals.setAmbientShadows(ambientSel.value === 'on');
    saveSetting('ambient-shadows', ambientSel.value);
  });

  function renderHelp(): void {
    const aim = {
      quick: 'abilities fire at the cursor',
      release: 'hold the key to aim, release to fire',
      normal: 'aim, <b>left-click</b> fires, <b>right-click</b> cancels',
    }[castMode];
    $('help').innerHTML =
      (scheme === 'hots'
        ? '<b>Right-click</b> move, or attack an enemy<br /><b>A</b> + <b>left-click</b> attack-move · <b>S</b> stop · <b>H</b> hold<br />' +
          `<b>Q W E</b> abilities · <b>R</b> heroic (<b>1</b> / <b>2</b> to choose) · <b>D</b> trait (passive)<br />Cast mode: ${aim}<br />`
        : '<b>WASD</b> move · hold <b>left-click</b> to shoot at the cursor<br /><b>Right-click</b> move / attack<br />' +
          `<b>Q</b>, <b>Space</b> (W), <b>E</b> abilities · <b>R</b> heroic (<b>1</b> / <b>2</b> to choose)<br />Cast mode: ${aim}<br />`) +
      '<b>Z</b> mount · <b>B</b> hearthstone · <b>T</b> emote · <b>K</b> die/respawn<br />' +
      '<b>Wheel</b> zoom · <b>Y</b> lock/free camera · <b>Space</b> center<br />' +
      '<b>Minimap</b>: left-click/drag to look, right-click to move · <b>F10</b> menu';
  }
  renderHelp();

  function buildClipButtons(): void {
    const box = $('clips');
    box.replaceChildren();
    for (const name of hero.chibi.clipNames()) {
      const b = document.createElement('button');
      const c = hero.chibi.meta.clips[name];
      b.textContent = name;
      b.title = `${c.duration.toFixed(2)}s ${c.loop ? 'loop' : 'once'}`;
      b.addEventListener('click', () => {
        closeMenu();
        hero.emote(name);
      });
      box.appendChild(b);
    }
  }
  buildClipButtons();

  $('inspector').addEventListener('click', async () => {
    closeMenu();
    const { ShowInspector } = await import('@babylonjs/inspector');
    ShowInspector(scene);
  });

  // --- loop -------------------------------------------------------------------
  const stats = $('stats');
  let statsTimer = 0;
  // Set movement, animation clips and blend weights before Babylon evaluates
  // skeletons. Updating them afterwards exposed a one-frame stale/rest pose.
  scene.onBeforeAnimationsObservable.add(() => {
    const dt = Math.min(engine.getDeltaTime() / 1000, 0.05);
    // Held right button steers like HotS / Diablo: a drag that began on the ground re-aims the move
    // at the cursor every frame; one that began on an enemy keeps attacking it, then moves on.
    if (!combat.winner && rmbHeld && !rmbTarget?.alive) {
      rmbTarget = null;
      const p = groundAt(pointer.x, pointer.y);
      if (p) hero.moveTo(p);
    }
    if (!combat.winner && scheme === 'wasd') {
      let x = 0;
      let z = 0;
      for (const code of held) {
        x += MOVE_KEYS[code][0];
        z += MOVE_KEYS[code][1];
      }
      hero.setMoveInput(x, z); // the camera never rotates, so screen up is world +Z
      if (lmbHeld) hero.attackToward(cursor());
      else hero.releaseAttackInput();
    }
    else hero.releaseAttackInput();
    // Reserve a player search before Combat starts its separate minion budget.
    // A crowded map must not leave click movement waiting on last frame's budget.
    world.navigation.beginFrame(1);
    if (!combat.winner) hero.update(dt);
    combat.update(dt);
    if ($('menu').classList.contains('hidden')) cam.update(dt, hero.position);
    world.followSun(cam.focus);
    ring.position.set(hero.position.x, 0.06, hero.position.z);
    ring.setEnabled(hero.state !== 'dead');

    const hovered = enemyUnder(pointer.x, pointer.y);
    const target = hero.target;
    combat.highlight(target, hovered);
    canvas.classList.toggle('over-enemy', !!hovered);
    if (aiming) {
      indicators.show(aiming === 'amove' ? { attackRange: hero.kit.basic.range } : slotInfo(hero.kit, aiming, hero.heroic), hero.position, cursor());
    }

    cam.camera.getViewMatrix().multiplyToRef(cam.camera.getProjectionMatrix(), transform);
    combat.updatePresentation(transform);
    hud.update(hero, combat, aiming, toScreen, heroicsOpen());
    const cw = canvas.clientWidth;
    const ch = canvas.clientHeight;
    minimap.draw(hero.position, hero.state !== 'dead', combat.units, [
      groundOrFar(0, 0), groundOrFar(cw, 0), groundOrFar(cw, ch), groundOrFar(0, ch),
    ], combat.structures);

    if ((statsTimer -= dt) <= 0) {
      statsTimer = 0.25;
      stats.textContent =
        `${engine.getFps().toFixed(0)} fps · ${hero.state}${hero.mounted ? ' (mounted)' : ''} · ` +
        `clip ${hero.chibi.current} · cam ${cam.locked ? 'locked' : 'free'}`;
    }
  });

  engine.runRenderLoop(() => scene.render());
  $('loading').remove();

  Object.assign(window, { game: { scene, hero, cam, combat, engine, toScreen } });
}

async function loadChibi(scene: Scene, world: World, index: ChibiIndex, hero: HeroVariant): Promise<Chibi> {
  const chibi = await Chibi.load(scene, index.variants[hero.variant], hero.aim, hero.muzzle);
  for (const m of chibi.meshes) world.shadows.addShadowCaster(m);
  return chibi;
}

main().catch((e) => {
  console.error(e);
  $('loading').textContent = `Failed to load: ${e instanceof Error ? e.message : e}`;
});
