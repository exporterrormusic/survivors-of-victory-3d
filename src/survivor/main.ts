// Survivor run entry (Stage Select → deploy, or ?run=test-range). For now this is the test range:
// an empty plaza with training Raptures, used to settle the camera, controls, HUD and kits.
//
// Frame order: gameplay runs before Babylon animates (input → player → kit → targets → camera →
// effects → HUD); after animation the rig twists the torso toward the aim.

import { Engine, Matrix, Plane, Ray, Scene, Vector3, Viewport } from '@babylonjs/core';
import '@fontsource/rajdhani/600.css';
import '@fontsource/rajdhani/700.css';
import '../style.css';
import './survivor.css';
import { audioEngine } from '../audio/audio-engine';
import { mountMusicControl, mountVolumeRows, playPlaylist } from '../audio/music-control';
import { positionalSound } from '../audio/positional';
import { BATTLE_TRACKS, SFX, UI, WEAPON_FIRE, WEAPON_RELOAD } from '../audio/sound-bank';
import { Chibi, loadChibiIndex } from '../chibi';
import { CHARACTER_MODULES, HERO_VARIANTS } from '../characters';
import { characterBurstArt, characterPortrait } from '../characters/assets';
import { fitFrame } from '../frame-layout';
import { loadSetting, saveSetting } from '../settings-store';
import { createVisualSettings, VISUAL_PRESETS, type VisualPreset } from '../visuals';
import { createArena } from './arena';
import { Atmosphere, TIMES_OF_DAY, WEATHER, WEATHER_INTENSITIES, type TimeOfDay, type Weather, type WeatherIntensity } from './atmosphere';
import { WeatherLab } from './weather-lab';
import { SnowLayer } from './snow';
import { rangeSnowDepth, SNOW_PRESETS, type SnowPreset } from './snow-field';
import { WaterLayer, WATER_PRESETS, normalizeWaterPreset, type WaterPreset } from './water';
import { enemyDeath } from './enemy-death';
import { EnemyAttackPacing, EnemyLaserAttack } from './enemy-attack';
import { CAMERA_ANGLES, SurvivorCamera, type CameraAngle } from './camera';
import { SurvivorHud, type ScreenPoint } from './hud';
import { SurvivorInput } from './input';
import type { KitContext } from './kit';
import { Player } from './player';
import { Run } from './run';
import { createSnowWhite } from './snow-white';
import { ENEMY_MOVEMENT, TargetField, type EnemyMovement } from './targets';
import { Vfx } from './vfx';
import { TalentMenu } from './talent-menu';
import { SortieMode, returnToArk } from './mode/sortie-mode';
import { mountShaderCompare } from './shader-compare';
import { type SceneryObstacle, rangeObstacles } from './range-collision';
import { RangeDressing } from './range-dressing';
import { ELEVATOR_YAW, onElevatorFootprint } from './elevator-footprint';
import { ArrivalElevator } from './arrival-elevator';
import { RangeLiftRide } from './range-lift-ride';
import { RANGE_ENVIRONMENTS, RANGE_MOODS, rangeEnvironmentForZone, type RangeEnvironment } from './range-environments';

/** the cursor is read on a plane at about gun height, so the aim matches what's under it */
const AIM_HEIGHT = 1.1;
/** sounds are full volume within 14 m of the camera focus, silent past 50 m */
const FALLOFF = { near: 14, far: 50, panWidth: 24 };

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const params = new URLSearchParams(location.search);

/** A ?query value when it names one of `choices`, else the saved setting, else `fallback`. */
function preferred<T extends string>(query: string | null, key: string, choices: Readonly<Record<T, string>>, fallback: NoInfer<T>): T {
  return query !== null && Object.hasOwn(choices, query) ? query as T : loadSetting(key, Object.keys(choices) as T[], fallback);
}

async function main(): Promise<void> {
  const frame = $('frame');
  const canvas = $<HTMLCanvasElement>('game');
  canvas.tabIndex = -1;
  canvas.classList.add('survivor');
  const engine = new Engine(canvas, true, { stencil: true }, true);
  const scene = new Scene(engine);
  scene.skipPointerMovePicking = true;
  const camera = new SurvivorCamera(scene, canvas);
  scene.activeCamera = camera.camera;
  const previewElevator = params.get('mission') !== 'salvage_run' && params.get('mode') !== 'sortie';
  const arena = createArena(scene, camera.camera, previewElevator);
  // The lift starts at the normal gameplay zoom; the pulled-back 18 m start made the range read darker.
  const elevator = previewElevator ? new ArrivalElevator(scene, arena.shadows, arena.glow) : null;
  const visuals = createVisualSettings(scene, camera.camera, arena);
  const atmosphere = new Atmosphere(scene, camera.camera, visuals, previewElevator);
  const snow = new SnowLayer(scene, {
    bounds: { minX: -38, minZ: -38, width: 76, depth: 76 },
    depthAt: () => 0,
    excludeAt: previewElevator ? onElevatorFootprint : undefined,
    gridRotation: previewElevator ? ELEVATOR_YAW : 0,
  });
  snow.enabled = false;
  const water = new WaterLayer(scene,camera.camera);
  const vfx = new Vfx(scene, camera.camera, arena.glow);
  const targets = new TargetField(scene, arena.shadows, snow.field);
  const run = new Run();
  run.onHit = (target) => {
    const at = target.position.add(new Vector3(0, target.barHeight * target.scale * .55, 0));
    // Bias the contact point toward the camera so the body doesn't hide the small sparks.
    const facing = camera.camera.globalPosition.subtract(at).normalize();
    at.addInPlace(facing.scale(target.radius * target.scale + .2));
    vfx.hitSparks(at);
  };
  const input = new SurvivorInput(canvas);

  // Only Snow White has a survivor kit so far; every deploy uses her until the others are ported.
  const character = CHARACTER_MODULES['snow-white'];
  const variant = HERO_VARIANTS.find((h) => h.character === character)!;
  $('loading').textContent = `INITIALIZING / ${variant.name.toUpperCase()}`;
  // The Salvage Run mission (or ?mode=sortie) runs the game-mode loop (src/survivor/mode/) on this
  // plaza instead of training targets.
  const sortieMode = params.get('mission') === 'salvage_run' || params.get('mode') === 'sortie';
  // The plain test range is a sandbox (nothing saves): start with enough SP to unlock every ability rank.
  if (!sortieMode) run.skillPoints = run.talents.pointsToMax;
  const [index] = await Promise.all([loadChibiIndex(), targets.load({ training: !sortieMode })]);
  const chibi = await Chibi.load(scene, index.variants[variant.variant], variant.aim, variant.muzzle);
  for (const m of chibi.meshes) arena.shadows.addShadowCaster(m);
  visuals.setPlayerMeshes(chibi.meshes);
  visuals.refreshUnits();

  const sound = positionalSound(camera.focus, FALLOFF);
  const playerPosition = new Vector3();
  // eslint-disable-next-line prefer-const -- the kit needs the context before the player exists
  let player: Player;
  const ctx: KitContext = { scene, shadows: arena.shadows, vfx, targets, run, camera, snow: snow.field, sound, playerPosition, muzzle: (out) => player.rig.muzzle(out), heal: (amount) => { player.hp = Math.min(player.maxHp, player.hp + amount); } };
  const kit = createSnowWhite(ctx);
  player = new Player(chibi, kit, ctx, snow.field);
  atmosphere.setPlayerPosition(player.position);
  camera.snap(player.position);
  run.onKill = (target) => {
    enemyDeath(vfx, target.position, target.radius * target.scale, target.barHeight * target.scale);
  };

  // --- HUD, menu, audio ------------------------------------------------------------
  const burstArt = character.id === 'snow-white' ? 'ui/survivor/snow-white-burst-eye.png' : characterBurstArt(character.id);
  const hud = new SurvivorHud(kit, {
    name: variant.name,
    affiliation: kit.affiliation,
    portrait: characterPortrait(character.id),
    burstArt,
  }, () => (paused ? closeMenu() : openMenu()), (action) => input.trigger(action));
  mountMusicControl(hud.musicParent);
  mountVolumeRows($('audio-settings'));
  audioEngine.preload([WEAPON_FIRE.sniper, WEAPON_RELOAD.sniper!, ...Object.values(SFX), ...Object.values(UI)].map((c) => c.url));
  // Snow White's theme first, then the other battle tracks in a random order.
  const otherTracks = Object.values(BATTLE_TRACKS).filter((t) => t !== BATTLE_TRACKS.snow).sort(() => Math.random() - .5);
  playPlaylist([BATTLE_TRACKS.snow, ...otherTracks]);

  let paused = false;
  let previousWeather: Weather | null = null;
  let activeRangeWeather: Weather | null = null;
  const weatherLab = new WeatherLab({
    parent: $('hud'), atmosphere, snow, water, onEnvironmentChange: syncEnvironment, clearInput: () => input.clear(),
    setSnow: setSnowPreset, setWater: setWaterPreset, setEnemyMovement,
  });
  scene.onDisposeObservable.addOnce(() => weatherLab.dispose());
  const talentMenu = new TalentMenu(run, characterPortrait(character.id), closeMenu, () => audioEngine.play(UI.select));
  setupMenu();
  setEnemyMovement(preferred(params.get('enemies'), 'survivor-enemy-movement', ENEMY_MOVEMENT, 'hold'));
  function setEnemyMovement(mode: EnemyMovement): void {
    targets.setMovement(mode); weatherLab.syncEnemies(mode); saveSetting('survivor-enemy-movement', mode);
  }
  setSnowPreset(preferred(params.get('snow'), 'survivor-ground-snow', SNOW_PRESETS, atmosphere.settings.weather === 'snow' ? 'drifts' : 'off'));
  const requestedWater = params.get('water');
  const savedWater = loadSetting('survivor-ground-water',[...Object.keys(WATER_PRESETS),'puddles','lakes'],'auto');
  setWaterPreset(normalizeWaterPreset(requestedWater??savedWater));
  const dressing = new RangeDressing(scene, arena.shadows);
  let environmentSolids:SceneryObstacle[]=[];
  let liftCollisionKey="";
  const syncLiftCollision=()=>{
    const state=elevator?.state;
    const key=state?`${state.gateOpen.toFixed(2)}:${state.height.toFixed(1)}`:"none";
    if(key===liftCollisionKey)return;
    liftCollisionKey=key;targets.navigation.setScenery([...environmentSolids,...(elevator?.collisionObstacles()??[])]);
  };
  const setRangeEnvironment = (theme: RangeEnvironment, initial = false): void => {
    dressing.set(theme);arena.setEnvironment(theme);
    environmentSolids=rangeObstacles(theme);liftCollisionKey="";syncLiftCollision();
    const mood=RANGE_MOODS[theme];
    const requestedTime=initial?params.get('time'):null;
    const time=requestedTime&&Object.hasOwn(TIMES_OF_DAY,requestedTime)?requestedTime as TimeOfDay:mood.time;
    const weather=mood.weather;
    activeRangeWeather=weather;
    atmosphere.setIntensity('moderate');
    atmosphere.set(time,weather,true);
    setSnowPreset(mood.snow);
    setWaterPreset(weather==='clear'&&initial&&params.get('water')==='wet'?'wet':mood.water);
    syncEnvironment();visuals.refreshUnits();
    if(!initial){const url=new URL(location.href);url.searchParams.set('environment',theme);history.replaceState(null,'',url);}
  };
  if(!sortieMode){
    const requested=params.get('environment');
    const inferred=params.get('zone')??(params.get('weather')==='snow'||(params.has('snow')&&params.get('snow')!=='off')?'snow_day':params.get('weather')==='storm'?'storm':null);
    const theme=requested&&Object.hasOwn(RANGE_ENVIRONMENTS,requested)?requested as RangeEnvironment:rangeEnvironmentForZone(inferred);
    setRangeEnvironment(theme,true);dressing.mount(setRangeEnvironment);
  }
  scene.onDisposeObservable.addOnce(()=>dressing.dispose());
  elevator?.mount();
  const liftRide = elevator ? new RangeLiftRide(elevator, player, input, returnToArk) : null;
  scene.onDisposeObservable.addOnce(()=>liftRide?.dispose());
  scene.onDisposeObservable.addOnce(()=>elevator?.dispose());
  function setWaterPreset(preset:WaterPreset):void {
    if(atmosphere.settings.weather==='snow'||atmosphere.settings.weather==='petals')preset='off';
    if(preset!=='off'&&snow.enabled)setSnowPreset('off');
    water.setPreset(preset);weatherLab.syncWater(preset);saveSetting('survivor-ground-water',preset);
  }
  function setSnowPreset(preset: SnowPreset): void {
    if(atmosphere.settings.weather!=='snow')preset='off';
    if(preset!=='off'&&water.enabled)setWaterPreset('off');
    snow.field.fill((x, z) => rangeSnowDepth(preset, x, z));
    snow.enabled = preset !== 'off';
    player.unstick();
    weatherLab.syncSnow(preset);
    saveSetting('survivor-ground-snow', preset);
  }
  function syncEnvironment(): void {
    const settings = atmosphere.settings;
    const entering = previousWeather !== settings.weather;
    previousWeather = settings.weather;
    if(!sortieMode && activeRangeWeather && settings.weather !== activeRangeWeather) {
      atmosphere.set(settings.time, activeRangeWeather);
      syncEnvironment();return;
    }
    if(settings.weather!=='snow'&&snow.enabled)setSnowPreset('off');
    if(settings.weather==='storm') {
      if(snow.enabled)setSnowPreset('off');
      if(entering&&!water.enabled)setWaterPreset('auto');
    } else if(settings.weather==='petals') {
      if(snow.enabled)setSnowPreset('off');
      if(water.enabled)setWaterPreset('off');
    } else if(settings.weather==='snow'&&water.enabled) {
      setWaterPreset('off');
    }
    const time = $<HTMLSelectElement>('time-of-day');
    if (time) { time.value = settings.time;time.disabled = settings.weather === 'storm'; }
    if ($('weather')) $<HTMLSelectElement>('weather').value = settings.weather;
    if ($('weather-intensity')) $<HTMLSelectElement>('weather-intensity').value = settings.intensity;
    saveSetting('survivor-time',settings.time);saveSetting('survivor-weather',settings.weather);saveSetting('survivor-intensity',settings.intensity);
    weatherLab.sync();
  }
  function setupMenu(): void {
    // The match settings dialog doubles as the pause menu; hide the MOBA-only rows.
    for (const id of ['controls', 'cast', 'heroics', 'variant', 'facing']) $(id)?.closest('label')?.classList.add('hidden');
    // the MOBA camera select becomes the survivor camera angle
    const angleSel = $<HTMLSelectElement>('camera');
    angleSel.replaceChildren();
    const angle = loadSetting('survivor-camera', Object.keys(CAMERA_ANGLES) as CameraAngle[], 'standard');
    for (const [id, a] of Object.entries(CAMERA_ANGLES)) angleSel.add(new Option(a.label, id, false, id === angle));
    angleSel.closest('label')!.firstChild!.textContent = 'Camera angle ';
    camera.setAngle(angle);
    angleSel.addEventListener('change', () => { camera.setAngle(angleSel.value as CameraAngle); saveSetting('survivor-camera', angleSel.value); });
    $('help').innerHTML =
      '<b>WASD</b> move · <b>mouse</b> aim · <b>left-click</b> fire<br />' +
      '<b>Right-click</b> Special · <b>E</b> Burst (full gauge) · <b>R</b> reload<br />' +
      '<b>Shift</b> dash · <b>Wheel</b> zoom · <b>Tab</b> upgrades · <b>Esc</b> pause';
    // The user's rule: lighting & color is always Anime. The selector is hidden and saved choices are
    // ignored; the other presets stay in visuals.ts for dev comparisons (artifacts scripts call apply()).
    const visualSel = $<HTMLSelectElement>('visuals');
    const preset: VisualPreset = 'anime';
    for (const [id, label] of Object.entries(VISUAL_PRESETS)) visualSel.add(new Option(label, id, false, id === preset));
    visualSel.closest('label')?.classList.add('hidden');
    visuals.apply(preset);
    saveSetting('visuals', preset);
    const ambient = $<HTMLSelectElement>('ambient-shadows');
    ambient.value = visuals.ambientShadowsSupported ? loadSetting('ambient-shadows', ['on', 'off'], 'on') : 'off';
    ambient.disabled = !visuals.ambientShadowsSupported;
    visuals.setAmbientShadows(ambient.value === 'on');
    function syncAmbientControl(): void {
      const previous = visuals.current === 'original';
      ambient.disabled = previous || !visuals.ambientShadowsSupported;
      ambient.value = ambient.disabled ? 'off' : loadSetting('ambient-shadows', ['on', 'off'], 'on');
      ambient.title = previous ? 'Previous lighting keeps contact shading off for comparison.' : 'Subtle contact shading under units and between surfaces.';
    }
    syncAmbientControl();
    ambient.addEventListener('change', () => { visuals.setAmbientShadows(ambient.value === 'on'); saveSetting('ambient-shadows', ambient.value); });
    const environment = document.createElement('div');
    environment.id = 'environment-controls';
    environment.innerHTML = '<h3>Environment</h3><label>Time of day <select id="time-of-day"></select></label>' +
      '<label>Weather <select id="weather"></select></label>' +
      '<label>Intensity <select id="weather-intensity"></select></label>' +
      '<p class="sub">Thunderstorms use night lighting. Preview live weather and trigger lightning in the range.</p>' +
      '<button type="button" id="preview-weather">Preview in test range</button>';
    $('clips').closest('section')!.prepend(environment);
    const timeSel = $<HTMLSelectElement>('time-of-day'), weatherSel = $<HTMLSelectElement>('weather');
    const zone = params.get('zone') ?? '';
    const zoneTime: TimeOfDay = zone.endsWith('night') || zone === 'storm' ? 'night' : 'day';
    const zoneWeather: Weather = zone === 'storm' ? 'storm' : zone.startsWith('snow') ? 'snow' : 'clear';
    // A zone picked in Stage Select (e.g. Ark Outskirts · DAY) sets the time and weather. The saved
    // Environment preference only applies to runs opened without one; ?time= / ?weather= still win.
    const time = zone && !params.has('time') ? zoneTime : preferred(params.get('time'), 'survivor-time', TIMES_OF_DAY, zoneTime);
    // Old links and saved preferences used a separate rain mode; it is the thunderstorm now.
    const chosenWeather = zone && !params.has('weather') ? zoneWeather
      : preferred(params.get('weather'), 'survivor-weather', { ...WEATHER, rain: WEATHER.storm }, zoneWeather);
    const weather: Weather = chosenWeather === 'rain' ? 'storm' : chosenWeather;
    const intensitySel = $<HTMLSelectElement>('weather-intensity');
    const intensity = sortieMode ? preferred(params.get('intensity'), 'survivor-intensity', WEATHER_INTENSITIES, 'moderate') : 'moderate';
    if(!sortieMode){
      weatherSel.closest('label')!.hidden=true;intensitySel.closest('label')!.hidden=true;
      environment.querySelector('.sub')!.textContent='Choose a map and its variations in Weather Lab.';
    }
    for (const [id, label] of Object.entries(TIMES_OF_DAY)) timeSel.add(new Option(label, id, false, id === time));
    for (const [id, label] of Object.entries(WEATHER)) weatherSel.add(new Option(label, id, false, id === weather));
    for (const [id, label] of Object.entries(WEATHER_INTENSITIES)) intensitySel.add(new Option(label,id,false,id === intensity));
    atmosphere.setIntensity(intensity);
    atmosphere.set(time, weather, true);
    syncEnvironment();
    const changeEnvironment = () => {
      atmosphere.setIntensity(intensitySel.value as WeatherIntensity);
      atmosphere.set(timeSel.value as TimeOfDay, weatherSel.value as Weather, paused);
      syncEnvironment();
    };
    timeSel.addEventListener('change', changeEnvironment);weatherSel.addEventListener('change', changeEnvironment);
    intensitySel.addEventListener('change',changeEnvironment);
    $('preview-weather').addEventListener('click',() => { closeMenu();weatherLab.open(); });
    const clips = $('clips');
    for (const name of chibi.clipNames()) {
      const b = document.createElement('button');
      b.textContent = name;
      b.addEventListener('click', () => { closeMenu(); player.rig.playFull(name); });
      clips.append(b);
    }
    $('inspector').addEventListener('click', async () => {
      closeMenu();
      const { ShowInspector } = await import('@babylonjs/inspector');
      ShowInspector(scene);
    });
    $('menu-close').addEventListener('click', closeMenu);
  }
  /** Stop the run for a menu; false if one is already open. closeMenu resumes it. */
  function pause(): boolean {
    if (paused) return false;
    paused = true;
    atmosphere.setPaused(true);
    weatherLab.setPaused(true);
    input.enabled = false;
    input.clear();
    player.cancelCharges();
    hud.setPaused(true);
    audioEngine.play(UI.select);
    return true;
  }
  function openMenu(): void {
    if (!pause()) return;
    $('menu').classList.remove('hidden');
    $('menu-close').focus({ preventScroll: true });
  }
  function openTalents(): void {
    if (!pause()) return;
    talentMenu.open();
  }
  function closeMenu(): void {
    if (!paused) return;
    paused = false;
    atmosphere.setPaused(false);
    weatherLab.setPaused(false);
    input.enabled = true;
    input.clear(); // the click that closed the menu must not fire
    $('menu').classList.add('hidden');
    talentMenu.close();
    hud.setPaused(false);
    audioEngine.play(UI.back);
    canvas.focus({ preventScroll: true });
  }

  // --- frame layout ---------------------------------------------------------------
  fitFrame(frame, () => { engine.resize(); hud.resize(); });

  // --- picking and projection ---------------------------------------------------------
  const aimPlane = Plane.FromPositionAndNormal(new Vector3(0, AIM_HEIGHT, 0), Vector3.Up());
  const ray = new Ray(Vector3.Zero(), Vector3.Forward());
  const aimPoint = new Vector3(0, AIM_HEIGHT, 6);
  const identity = Matrix.Identity();
  const readAim = () => {
    if (!input.pointer.inside) return; // keep the last aim while the cursor is over the HUD or outside
    scene.createPickingRayToRef(input.pointer.x, input.pointer.y, identity, ray, camera.camera);
    const t = ray.intersectsPlane(aimPlane);
    if (t !== null && t > 0) aimPoint.copyFrom(ray.origin).addInPlace(ray.direction.scale(t));
  };
  const transform = new Matrix();
  const projectFrom = new Vector3(), projected = new Vector3();
  const viewport = new Viewport(0, 0, 1, 1);
  const toScreen = (x: number, y: number, z: number): ScreenPoint => {
    viewport.width = engine.getRenderWidth();
    viewport.height = engine.getRenderHeight();
    const p = Vector3.ProjectToRef(projectFrom.set(x, y, z), Matrix.IdentityReadOnly, transform, viewport, projected);
    const s = engine.getHardwareScalingLevel();
    return { x: p.x * s, y: p.y * s, visible: p.z > 0 && p.z < 1 };
  };

  // Development-only matched comparison: same pose, camera, weather and lighting.
  const shaderCompare = import.meta.env.DEV && params.has('shader-compare');
  if (shaderCompare) mountShaderCompare({ hud: $('hud'), visuals, atmosphere, snow, water, targets, focus: camera.focus });

  const mode = sortieMode ? await SortieMode.create({
    scene, shadows: arena.shadows, vfx, field: targets, run, player, kit, camera, snow: snow.field, toScreen, arenaRadius: arena.radius, params,
    // progress is saved under the NIKKE whose kit runs (only Snow White has one so far)
    characterId: character.id,
    nikke: { name: variant.name, art: burstArt ? `${import.meta.env.BASE_URL}${burstArt}` : null },
  }) : null;
  if (mode) {
    // The sortie loads more Rapture models; give them the unit material plugins before anything compiles.
    visuals.refreshUnits();
    scene.onDisposeObservable.addOnce(() => mode.dispose());
  }
  // Leaving: the test range goes straight back to the Ark; mid-sortie it counts as dying.
  const leave = $<HTMLButtonElement>('leave-match');
  leave.textContent = mode ? 'Abandon sortie' : 'Return to Ark';
  if (mode) leave.insertAdjacentHTML('afterend', '<p class="sub">Counts as dying: you keep XP and levels, and lose what you\'re carrying.</p>');
  leave.addEventListener('click', () => {
    if (!mode || mode.ended) { returnToArk(); return; }
    closeMenu();
    mode.abandon();
  });

  const enemyPacing = new EnemyAttackPacing();
  const enemyAttacks = targets.targets.map((target, index) =>
    new EnemyLaserAttack(ctx, target, player, 3 + index * .37, enemyPacing));
  scene.onDisposeObservable.addOnce(() => { for (const attack of enemyAttacks) attack.dispose(); });

  // --- loop -------------------------------------------------------------------------
  let effectDt = 0;
  scene.onBeforeAnimationsObservable.add(() => {
    if (input.wasPressed('pause')) { if (paused) closeMenu(); else openMenu(); }
    if (input.wasPressed('talents')) { if (talentMenu.isOpen) closeMenu(); else if (!paused) openTalents(); }
    // A finished sortie (extracted or defeated) holds the world still behind its results screen.
    const compareFrozen = (shaderCompare && run.time >= 1) || (mode?.ended ?? false) || (liftRide?.ended ?? false);
    const dt = paused || compareFrozen ? 0 : Math.min(engine.getDeltaTime() / 1000, .05);
    effectDt = dt;
    scene.animationsEnabled = !paused && !compareFrozen;
    scene.particlesEnabled = !paused && !compareFrozen;
    if (!paused) {
      if (!compareFrozen) readAim();
      elevator?.update(dt);
      syncLiftCollision();
      liftRide?.update();
      player.update(dt, input, aimPoint);
      playerPosition.copyFrom(player.position);
      kit.update(dt);
      targets.update(dt, player.position);
      mode?.update(dt);
      enemyPacing.update(dt);
      for (const attack of enemyAttacks) attack.update(dt, targets.movementMode !== 'inactive');
      run.update(dt);
      camera.update(dt, player.position);
      atmosphere.update(dt, camera.focus);
      dressing.update(dt);
      snow.field.refill(dt, atmosphere.snowfall);
      snow.update(dt);
      water.update(dt,atmosphere.rainStrength,atmosphere.lightningStrength);
      arena.followSun(camera.focus);
    }
    targets.draw();
    camera.camera.getViewMatrix().multiplyToRef(camera.camera.getProjectionMatrix(), transform);
    hud.update(player, run, targets, toScreen, input.pointer);
    weatherLab.updateSnow(player.position.x, player.position.z);
    weatherLab.updateWater();
    input.endFrame();
  });
  scene.onAfterAnimationsObservable.add(() => {
    if (paused) return;
    player.afterAnimation();
    // Attached effects need this frame's aimed muzzle, not the previous animation's position.
    vfx.update(effectDt);
  });

  engine.runRenderLoop(() => scene.render());
  $('loading').remove();
  Object.assign(window, { game: { scene, engine, player, kit, run, targets, camera, vfx, input, talentMenu, toScreen, aimPoint, atmosphere, visuals, snow, water, sortie: mode, dressing, setRangeEnvironment, elevator } });
}

main().catch((e) => {
  console.error(e);
  const loading = document.getElementById('loading');
  if (loading) loading.textContent = `Failed to load: ${e instanceof Error ? e.message : e}`;
});
