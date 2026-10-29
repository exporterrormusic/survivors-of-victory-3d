import { returnToMainMenu } from '../frontend/return-to-menu';
import { EnvironmentSky } from './environment-sky';
import { equippedSkin } from '../frontend/profile/Skins';
import { TeammateIndicators } from './coop/teammate-indicators';
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
import { organizePauseMenu } from './pause-menu';
import { formatControlBinding, loadControlSettings, loadDisplaySettings } from '../frontend/settings/GameSettings';
import { audioEngine } from '../audio/audio-engine';
import { mountMusicControl, mountVolumeRows, playPlaylist } from '../audio/music-control';
import { positionalSound } from '../audio/positional';
import { BATTLE_TRACKS, SFX, UI, WEAPON_FIRE, WEAPON_RELOAD, WEAPON_SPECIAL } from '../audio/sound-bank';
import { Chibi, loadChibiIndex } from '../chibi';
import { CHARACTER_MODULES, HERO_VARIANTS, PLAYABLE_CHARACTER_IDS } from '../characters';
import { characterBurstArt, characterBurstButtonArt, characterPortrait } from '../characters/assets';
import { fitFrame } from '../frame-layout';
import { revealLevelTransition, cancelLevelTransition } from '../frontend/level-transition';
import { loadSetting, saveSetting } from '../settings-store';
import { createVisualSettings, VISUAL_PRESETS, type VisualPreset } from '../visuals';
import { createArena } from './arena';
import { Atmosphere, TIMES_OF_DAY, WEATHER, WEATHER_INTENSITIES, type TimeOfDay, type Weather, type WeatherIntensity } from './atmosphere';
import { WeatherLab } from './weather-lab';
import { CommunicationPanel } from '../ui/communication-panel';
import { createCommunicationLab } from './communication-lab';
import { SnowLayer } from './snow';
import { rangeSnowDepth, SNOW_PRESETS, type SnowPreset } from './snow-field';
import { createPassive } from './passives';
import { WaterLayer, WATER_PRESETS, normalizeWaterPreset, type WaterPreset } from './water';
import { enemyDeath } from './enemy-death';
import { EnemyAttackPacing, EnemyLaserAttack } from './enemy-attack';
import { CAMERA_LIMITS, SurvivorCamera } from './camera';
import { SurvivorHud, type ScreenPoint } from './hud';
import { SurvivorInput } from './input';
import type { KitContext } from './kit';
import { Player } from './player';
import { spawnAfterimage } from './afterimage';
import { Run } from './run';
import { createSnowWhite } from './snow-white';
import { createScarlet } from './scarlet';
import { createDorothy } from './dorothy';
import { createNayuta } from './nayuta';
import { createRapunzel } from './rapunzel';
import { ENEMY_MOVEMENT, TargetField, type EnemyMovement } from './targets';
import { Vfx } from './vfx';
import { TalentMenu } from './talent-menu';
import { TalentBoard, TalentPicker } from './talent-picker';
import type { TalentTiers } from './talent-tiers';
import { SortieMode, returnToArk, type SortieModeInit } from './mode/sortie-mode';
import { RelayMode } from './mode/relay-mode';
import { SurvivalMode } from './mode/survival-mode';
import { SupplyLift } from './mode/supply-lift';
import { TelegraphLayer, groundHeight } from './mode/telegraph';
import { outskirtsGroundHeight, inCraterFire, CRATER_FIRE_DPS } from './outskirts-landmarks';
import { FireVignette } from './fire-vignette';
import { OutskirtsNight } from './outskirts-night';
import { Volcano } from './volcano';
import { GoddessFallEgg } from './goddess-fall-egg';
import { mountSakuraEggLab, SakuraShrineEgg } from './sakura-shrine-egg';
import { mountStormRadioLab, StormRadioEgg } from './storm-radio-egg';
import { mountSirenEggLab, SIREN_CHANCE, SIREN_TEST_CHANCE, SirenEgg } from './siren-egg';
import { mountNihilisterEggLab, NihilisterEgg } from './nihilister-egg';
import { mountEggLab } from './goddess-fall-lab';
import { LabMode } from './mode/lab-mode';
import { mountShaderCompare } from './shader-compare';
import { type SceneryObstacle, rangeObstacles } from './range-collision';
import { RangeDressing } from './range-dressing';
import { StormMap, stormObstacles } from './storm-map';
import { FrozenLake } from './frozen-lake';
import { FrozenLakeHazard, FrozenLakeView } from './frozen-lake-view';
import { SceneryOcclusion } from './scenery-occlusion';
import { frozenSnowDepth } from './frozen-layout';
import { ELEVATOR_YAW, setElevatorOrigin, onElevatorFootprint } from './elevator-footprint';
import { STORM_ARRIVAL } from './storm-field';
import { ArrivalElevator } from './arrival-elevator';
import { RangeLiftRide } from './range-lift-ride';
import { CoopSquad } from './coop/coop-squad';
import { CoopNetHost } from './coop/net-host';
import { CoopNetGuest, disableLocalDamage } from './coop/net-guest';
import { takeCoopHandoff } from '../net/coop-handoff';
import { normalizeRoomCode } from '../net/room-code';
import type { HeroId } from './coop/teammate';
import { ARENA_EDGE_VOLCANO, RANGE_ENVIRONMENTS, RANGE_MOODS, rangeEnvironmentForZone, type RangeEnvironment } from './range-environments';

/** the cursor is read on a plane at about gun height, so the aim matches what's under it */
const AIM_HEIGHT = 1.1;
/** sounds are full volume within 14 m of the camera focus, silent past 50 m */
const FALLOFF = { near: 14, far: 50, panWidth: 24 };

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const params = new URLSearchParams(location.search);
const relayMode = params.get('mission') === 'relay_run' || params.get('mode') === 'relay';
const endlessMode = params.get('mission') === 'endless_round' || params.get('mode') === 'endless';
const survivalMode = endlessMode || params.get('mission') === 'survival_round' || params.get('mode') === 'survival';
/** ?mode=lab: Rapture Lab, a spawn panel for testing enemy behaviors */
const labMode = params.get('mode') === 'lab';

/** A ?query value when it names one of `choices`, else the saved setting, else `fallback`. */
function preferred<T extends string>(query: string | null, key: string, choices: Readonly<Record<T, string>>, fallback: NoInfer<T>): T {
  return query !== null && Object.hasOwn(choices, query) ? query as T : loadSetting(key, Object.keys(choices) as T[], fallback);
}

/** camera distance while standing on the lift deck */
const LIFT_ZOOM = 14;

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
  const previewElevator = !relayMode && params.get('mission') !== 'salvage_run' && params.get('mode') !== 'sortie';
  const arena = createArena(scene, camera.camera, previewElevator);
  // The lift starts at the same wide zoom as gameplay.
  const elevator = previewElevator ? new ArrivalElevator(scene, arena.shadows, arena.glow) : null;
  const visuals = createVisualSettings(scene, camera.camera, arena);
  const atmosphere = new Atmosphere(scene, camera.camera, visuals, previewElevator, () => camera.distance);
  const environmentSky = new EnvironmentSky(scene, () => atmosphere.settings.time);
  const snow = new SnowLayer(scene, {
    bounds: { minX: -76, minZ: -76, width: 152, depth: 152 },
    resolution:2048,
    subdivisions:768,
    outerExtent:150,
    depthAt: () => 0,
    excludeAt: previewElevator ? onElevatorFootprint : undefined,
    gridRotation: previewElevator ? ELEVATOR_YAW : 0,
  });
  snow.enabled = false;
  let frozenSnow=false;
  const water = new WaterLayer(scene,camera.camera);
  const vfx = new Vfx(scene, camera.camera, arena.glow);
  const targets = new TargetField(scene, arena.shadows, snow.field);
  const characterId = PLAYABLE_CHARACTER_IDS.find(id => id === params.get('character')) ?? 'snow-white';
  const character = CHARACTER_MODULES[characterId];
  // Characters without a Survivor kit use the existing Snow White test kit.
  const run = new Run(character.id === 'dorothy' ? 'dorothy' : character.id === 'nayuta' ? 'nayuta' : character.id === 'rapunzel' ? 'rapunzel' : character.id === 'scarlet' ? 'scarlet' : 'snow-white');
  run.onHit = (target) => {
    const at = target.position.add(new Vector3(0, target.barHeight * target.scale * .55, 0));
    // Bias the contact point toward the camera so the body doesn't hide the small sparks.
    const facing = camera.camera.globalPosition.subtract(at).normalize();
    at.addInPlace(facing.scale(target.radius * target.scale + .2));
    vfx.hitSparks(at);
  };
  const input = new SurvivorInput(canvas);

  const skin = equippedSkin(character.id);
  const variant = HERO_VARIANTS.find((h) => h.character === character && h.variant === skin?.id)
    ?? HERO_VARIANTS.find((h) => h.character === character)!;
  const portrait = skin && skin.cost > 0 ? skin.icon : characterPortrait(character.id);
  $('loading').textContent = `INITIALIZING / ${variant.name.toUpperCase()}`;
  // The Salvage Run mission (or ?mode=sortie) runs the game-mode loop (src/survivor/mode/) on this
  // plaza instead of training targets.
  const sortieMode = params.get('mission') === 'salvage_run' || params.get('mode') === 'sortie';
  const testRange = !sortieMode && !relayMode && !survivalMode && !labMode;
  run.burstAlwaysMax = testRange;
  if (testRange) run.burst = 100;
  // The plain test range is a sandbox (nothing saves): start with enough SP to unlock every ability rank.
  // Talent-tier heroes (Snow White) level up and pick instead; the Weather Lab can grant levels.
  if (!sortieMode && !relayMode && !survivalMode && !run.tiers) run.skillPoints = run.talents.pointsToMax;
  const [index] = await Promise.all([loadChibiIndex(), targets.load({ training: !sortieMode && !relayMode && !survivalMode && !labMode })]);
  const chibi = await Chibi.load(scene, index.variants[variant.variant], variant.aim, variant.muzzle);
  for (const m of chibi.meshes) arena.shadows.addShadowCaster(m);
  visuals.setPlayerMeshes(chibi.meshes);
  visuals.refreshUnits();

  const sound = positionalSound(camera.focus, FALLOFF);
  const playerPosition = new Vector3();
  // eslint-disable-next-line prefer-const -- the kit needs the context before the player exists
  let player: Player;
  const ctx: KitContext = { scene, shadows: arena.shadows, vfx, targets, run, camera, snow: snow.field, sound, playerPosition, muzzle: (out) => player.rig.muzzle(out), heal: (amount) => { player.hp = Math.min(player.maxHp, player.hp + amount); } };
  Object.defineProperties(ctx, { hp: { get: () => player.hp }, maxHp: { get: () => player.maxHp }, aimYaw: { get: () => player.aimYaw }, aimPoint: { get: () => player.aim } });
  ctx.setHp = hp => { player.hp = Math.max(1, Math.min(player.maxHp, hp)); };
  ctx.afterimage = color => spawnAfterimage(vfx, chibi, color);
  ctx.invulnerable = (seconds, translucent) => player.grantInvulnerability(seconds, translucent);
  ctx.resist = (share, seconds) => player.grantResist(share, seconds);
  ctx.refundRound = () => player.refundRound();
  ctx.teleport = at => {
    const safe = targets.navigation.project(at, .45);
    player.position.set(safe.x, 0, safe.z); playerPosition.copyFrom(player.position); player.unstick();
  };
  const kit = character.id === 'dorothy' ? createDorothy(ctx) : character.id === 'nayuta' ? createNayuta(ctx, variant.variant) : character.id === 'rapunzel' ? createRapunzel(ctx) : character.id === 'scarlet' ? createScarlet(ctx) : createSnowWhite(ctx);
  player = new Player(chibi, kit, ctx, snow.field);
  const passive = createPassive(character.id, player, ctx, water);
  atmosphere.setPlayerPosition(player.position);
  camera.snap(player.position);
  // Experimental co-op (docs/COOP_PLAN.md): ?coop=bot adds one AI teammate, ?coop=bot2 two,
  // ?coopHero=scarlet,rapunzel picks their heroes; ?coop=host opens a room guests join by code.
  const coopMatch = /^bot(\d?)$/.exec(params.get('coop') ?? '');
  const coopBots = coopMatch ? Number(coopMatch[1] || 1) : 0;
  const coopHost = params.get('coop') === 'host';
  const coop = coopBots > 0 || coopHost ? new CoopSquad({ scene, shadows: arena.shadows, vfx, targets, camera, snow: snow.field, sound, run }, player) : null;
  if (coop) {
    coop.onChange = () => { visuals.setPlayerMeshes([...chibi.meshes, ...coop.meshes]); visuals.refreshUnits(); };
    const heroes = (params.get('coopHero') ?? '').split(',');
    const fallback: HeroId[] = (['snow-white', 'scarlet', 'rapunzel', 'nayuta'] as const).filter(h => h !== character.id);
    for (let i = 0; i < Math.min(coopBots, 9); i++) {
      const pick = heroes[i] as HeroId;
      await coop.addBot(pick === 'snow-white' || pick === 'scarlet' || pick === 'rapunzel' || pick === 'nayuta' ? pick : fallback[i % fallback.length]);
    }
    scene.onDisposeObservable.addOnce(() => coop.dispose());
  }
  // ?coop=join&room=CODE (+ the host's map params): a guest in someone else's match. Our hero moves
  // here; the host runs the Raptures, damage and round, and everything else is drawn from its snapshots.
  const joinCode = params.get('coop') === 'join' ? normalizeRoomCode(params.get('room') ?? '') : null;
  const coopGuest = joinCode ? new CoopNetGuest({ scene, shadows: arena.shadows, vfx, targets, camera, snow: snow.field, sound, run },
    player, input, () => aimPoint, joinCode, character.id as HeroId, variant.name, takeCoopHandoff('guest', joinCode)?.lobby ?? null) : null;
  if (coopGuest) {
    disableLocalDamage(run);
    coopGuest.onHeroesChanged = () => { visuals.setPlayerMeshes([...chibi.meshes, ...coopGuest.heroMeshes]); visuals.refreshUnits(); };
    scene.onDisposeObservable.addOnce(() => void coopGuest.close());
  }
  run.onKill = (target) => {
    enemyDeath(vfx, target.position, target.radius * target.scale, target.barHeight * target.scale);
  };

  // --- HUD, menu, audio ------------------------------------------------------------
  const burstArt = character.id === 'snow-white' ? 'ui/survivor/snow-white-burst-eye.png'
    : character.id === 'dorothy' ? 'ui/survivor/dorothy-burst-banner-v2.png'
    : character.id === 'nayuta' ? 'ui/survivor/nayuta-burst-asceticism.png'
    : character.id === 'rapunzel' ? 'ui/survivor/rapunzel-burst-prayer.png'
    : character.id === 'scarlet' ? 'ui/survivor/scarlet-burst-blade.png' : characterBurstArt(character.id);
  const hud = new SurvivorHud(kit, {
    name: variant.name,
    affiliation: kit.affiliation,
    portrait,
    burstArt: characterBurstButtonArt(character.id) ?? burstArt,
    burstArtPosition: character.id === 'dorothy' ? '50% 50%' : character.id === 'scarlet' || character.id === 'rapunzel' || character.id === 'nayuta' ? '50% 50%' : undefined,
  }, () => (paused ? closeMenu() : openMenu()), (action) => input.trigger(action));
  mountMusicControl(hud.musicParent);
  mountVolumeRows($('audio-settings'));
  const weaponCues = character.id === 'dorothy' ? [WEAPON_FIRE['pulse-rifle'], WEAPON_RELOAD['pulse-rifle']!] : character.id === 'nayuta' ? [WEAPON_FIRE.smg, WEAPON_RELOAD.smg!] : character.id === 'rapunzel' ? [WEAPON_FIRE.rocket, WEAPON_RELOAD.rocket!] : character.id === 'scarlet'
    ? [WEAPON_FIRE.sword, WEAPON_SPECIAL.sword!]
    : [WEAPON_FIRE.sniper, WEAPON_RELOAD.sniper!];
  audioEngine.preload([...weaponCues, ...Object.values(SFX), ...Object.values(UI)].map((c) => c.url));
  const openingTrack = character.id === 'nayuta' ? BATTLE_TRACKS.nayuta : character.id === 'rapunzel' ? BATTLE_TRACKS.rapunzel : BATTLE_TRACKS.snow;
  const otherTracks = Object.values(BATTLE_TRACKS).filter((t) => t !== openingTrack).sort(() => Math.random() - .5);
  playPlaylist([openingTrack, ...otherTracks]);

  let paused = false;
  // Pause freezes the run with no menu, only a small label; Menu (or Pause again) leaves it.
  let barePause = false;
  const pauseLabel = document.createElement('div');
  pauseLabel.id = 'run-paused';
  pauseLabel.className = 'hidden';
  frame.append(pauseLabel);
  // A networked match never stops: the menu opens over the live world (only this player's controls stop).
  const online = coopHost || !!joinCode;
  let startingLevel = true;
  const worldPaused = () => startingLevel || (paused && !online);
  let previousWeather: Weather | null = null;
  let activeRangeWeather: Weather | null = null;
  function switchCharacter(id: string): void {
    if (!PLAYABLE_CHARACTER_IDS.some(characterId => characterId === id)) return;
    const url = new URL(location.href);
    url.searchParams.set('character', id);
    location.assign(url.href);
  }
  const weatherLab = new WeatherLab({
    parent: $('hud'), atmosphere, snow, water, onEnvironmentChange: syncEnvironment, clearInput: () => input.clear(),
    setSnow: setSnowPreset, setWater: setWaterPreset, setEnemyMovement,
    character: character.id, switchCharacter: !sortieMode && !relayMode && !survivalMode ? switchCharacter : undefined,
    burstAlwaysMax: run.burstAlwaysMax,
    setBurstAlwaysMax: testRange ? enabled => {
      run.burstAlwaysMax = enabled;
      if (enabled) run.burst = 100;
    } : undefined,
    grantLevel: () => run.grantLevel(),
    // Bound once the supply squad exists (below).
    spawnAlly: testRange ? () => { void rangeSupply?.spawnAlly(); } : undefined,
    dropCrate: testRange ? () => rangeSupply?.dropCrate() : undefined,
  });
  let rangeSupply: SupplyLift | null = null;
  scene.onDisposeObservable.addOnce(() => weatherLab.dispose());
  const communication = new CommunicationPanel($('hud'));
  const communicationLab = createCommunicationLab(communication);
  weatherLab.addTab('Comms', communicationLab.element);
  scene.onDisposeObservable.addOnce(() => communicationLab.dispose());
  const tiered = run.tiers ? run as Run & { tiers: TalentTiers } : null;
  const talentPicked = () => audioEngine.play(UI.select);
  const talentMenu = tiered ? new TalentBoard(tiered, portrait, closeMenu, talentPicked)
    : new TalentMenu(run, portrait, closeMenu, talentPicked);
  const talentPicker = tiered ? new TalentPicker(tiered, $('hud'), kit.icons, talentPicked) : null;
  scene.onDisposeObservable.addOnce(() => talentPicker?.dispose());
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
  const storm=new StormMap(scene,arena.shadows);
  targets.navigation.storm=storm.field;
  storm.strike=(x,z)=>atmosphere.strike({x,z});
  scene.onDisposeObservable.addOnce(()=>storm.dispose());
  const frozenLake=new FrozenLake(),lake=new FrozenLakeHazard(frozenLake,new FrozenLakeView(scene,frozenLake));
  targets.navigation.lake=frozenLake;
  lake.onBreak=(x,z)=>{
    sirenEgg.onBreak(x,z);
    const at=new Vector3(x,.1,z);
    vfx.ring(at,[.78,.94,1],.6,6,.8,.55);
    for(let i=0;i<10;i++){const a=i*2.4,r=1+i*.55;vfx.flashSprite(at.add(new Vector3(Math.cos(a)*r,.4+(i%3)*.3,Math.sin(a)*r)),[.85,.96,1],.9+(i%3)*.4,.7,.85,i%2?'bubble':'spark');}
    const near=Math.hypot(player.position.x-x,player.position.z-z);
    if(near<22)camera.shake(.16*(1-near/22)+.04,.35);
  };
  lake.onHurt=()=>{
    // The normal hit cue (red star, health-bar flash) on the damage rhythm, without camera shake.
    const at=player.position.add(new Vector3(0,.5,0));
    player.damageFlash=.25;
    vfx.flashSprite(at.add(new Vector3(0,.5,0)),[1,.15,.12],1.2,.16,.8,'star');
    for(let i=0;i<3;i++)vfx.flashSprite(at.add(new Vector3(Math.cos(i*2.1)*.5,.1,Math.sin(i*2.1)*.5)),[.8,.94,1],.45,.6,.8,'bubble');
  };
  scene.onDisposeObservable.addOnce(()=>lake.dispose());
  const heat=new FireVignette();
  scene.onDisposeObservable.addOnce(()=>heat.dispose());
  const outskirtsNight=new OutskirtsNight(scene,camera.camera);
  const volcano=new Volcano(scene,arena.shadows,vfx,ARENA_EDGE_VOLCANO);
  scene.onDisposeObservable.addOnce(()=>volcano.dispose());
  volcano.onThunder=(x,z)=>atmosphere.strike({x,z},.9,true);
  scene.onDisposeObservable.addOnce(()=>outskirtsNight.dispose());
  // Forest easter egg (goddess-fall-egg.ts); toScreen is defined further down.
  const cutsceneVfx = new Vfx(scene, camera.camera, arena.glow);
  const egg=new GoddessFallEgg({scene,shadows:arena.shadows,vfx:cutsceneVfx,targets,player,camera,atmosphere,input,
    toScreen:(x,y,z)=>toScreen(x,y,z),refreshUnits:()=>visuals.refreshUnits(),hud:$('hud'),radarLabel:document.querySelector('#run-radar .rr-label'),
    // The lift and the altar cutscene both take over the player; never let them overlap.
    characterId:character.id,
    liftBusy:()=>player.transported||(!!elevator&&(elevator.state.action!=='idle'||elevator.state.height<-.001)),
    lockLift:locked=>{if(elevator)elevator.locked=locked;}});
  scene.onDisposeObservable.addOnce(()=>egg.dispose());
  // Sakura Grove easter egg (sakura-shrine-egg.ts): same hooks as the forest one.
  const shrineEgg=new SakuraShrineEgg({scene,shadows:arena.shadows,vfx:cutsceneVfx,targets,player,camera,characterId:character.id,hud:$('hud'),radarLabel:document.querySelector('#run-radar .rr-label'),
    toScreen:(x,y,z)=>toScreen(x,y,z),refreshUnits:()=>visuals.refreshUnits(),
    liftBusy:()=>player.transported||(!!elevator&&(elevator.state.action!=='idle'||elevator.state.height<-.001)),
    lockLift:locked=>{if(elevator)elevator.locked=locked;}});
  scene.onDisposeObservable.addOnce(()=>shrineEgg.dispose());
  const radioEgg = new StormRadioEgg({ scene, shadows: arena.shadows, vfx, targets, player, field: storm.field,
    characterId: character.id, refreshUnits: () => visuals.refreshUnits(),
    toScreen: (x, y, z) => toScreen(x, y, z),
    hud: $('hud'), radarLabel: document.querySelector('#run-radar .rr-label'), softenRain: soft => atmosphere.softenRain(soft) });
  scene.onDisposeObservable.addOnce(() => radioEgg.dispose());
  // Frozen North easter egg (siren-egg.ts): she may surface in a freshly broken lake.
  const sirenEgg=new SirenEgg({scene,vfx,targets,player,hud:$('hud'),toScreen:(x,y,z)=>toScreen(x,y,z),refreshUnits:()=>visuals.refreshUnits(),
    chance:testRange?SIREN_TEST_CHANCE:SIREN_CHANCE});
  scene.onDisposeObservable.addOnce(()=>sirenEgg.dispose());
  // Ashen Caldera easter egg (nihilister-egg.ts): she climbs out of a giant meteor's crater.
  const nihilisterEgg=new NihilisterEgg({scene,shadows:arena.shadows,vfx,player,volcano,hud:$('hud'),toScreen:(x,y,z)=>toScreen(x,y,z),refreshUnits:()=>visuals.refreshUnits(),
    shake:s=>camera.shake(s,.4)});
  scene.onDisposeObservable.addOnce(()=>nihilisterEgg.dispose());
  const eggFreezesWorld=()=>egg.freezesWorld||shrineEgg.freezesWorld;
  const sceneryOcclusion=new SceneryOcclusion(scene,arena.shadows);
  scene.onDisposeObservable.addOnce(()=>sceneryOcclusion.dispose());
  let environmentSolids:SceneryObstacle[]=[];
  let liftCollisionKey="";
  const syncLiftCollision=()=>{
    if(relayMode)return; // RelayMode owns its authored street collision.
    const state=elevator?.state;
    // Each scenery change rebuilds the navigation grids (~60 ms per unit size), so a moving lift is
    // one sealed block and only the resting states differ: two rebuilds per supply cycle.
    // Survival Round never rebuilds: it keeps the open lift's collision all round, and its supply
    // lift shoves anyone off the footprint while the cage moves (supply-lift.ts clearDeck).
    const moving=!survivalMode&&!!state&&(state.action!=='idle'||state.gateOpen<.999&&state.gateOpen>.001||state.height<-.001);
    const key=!state?"none":survivalMode?"open":moving?"sealed":state.gateOpen>.5?"open":"closed";
    if(key===liftCollisionKey)return;
    liftCollisionKey=key;
    targets.navigation.setScenery([...environmentSolids,...(!elevator?[]:moving?elevator.sealedObstacles():survivalMode?elevator.restingObstacles():elevator.collisionObstacles())]);
  };
  const setRangeEnvironment = (theme: RangeEnvironment, initial = false): void => {
    // A new map always starts the player on its lift pad.
    const moveArrival=true;
    const arrival=theme==='storm'?STORM_ARRIVAL:{x:0,z:0};
    elevator?.setVault(false);
    setElevatorOrigin(arrival.x,arrival.z);
    if(elevator)elevator.root.position.set(arrival.x,0,arrival.z);
    dressing.set(theme);arena.setEnvironment(theme);
    player.groundHeight=theme==='outskirts'?outskirtsGroundHeight:()=>0;
    camera.groundHeight=player.groundHeight;
    frozenSnow=theme==='frozen';
    storm.set(theme==='storm');radioEgg.setEnabled(theme==='storm');lake.set(theme==='frozen');sirenEgg.setEnabled(theme==='frozen');nihilisterEgg.setEnabled(theme==='volcano');egg.setEnabled(theme==='forest');shrineEgg.setEnabled(theme==='sakura');volcano.setEnabled(theme==='volcano');atmosphere.volcanic=theme==='volcano';
    targets.navigation.setExtent(arena.radius);
    elevator?.setTowerScale(.5);
    environmentSolids=[...rangeObstacles(theme),...(theme==='storm'?stormObstacles():[])];liftCollisionKey="";syncLiftCollision();
    if(moveArrival){player.position.set(arrival.x,0,arrival.z);player.unstick();playerPosition.copyFrom(player.position);camera.snap(player.position);}
    const mood=RANGE_MOODS[theme];
    const requestedTime=initial?params.get('time'):null;
    let time=requestedTime&&Object.hasOwn(TIMES_OF_DAY,requestedTime)?requestedTime as TimeOfDay:mood.time;
    if(theme==='frozen'&&time==='dusk')time='day';
    const weather=mood.weather;
    activeRangeWeather=weather;
    atmosphere.setIntensity('moderate');
    atmosphere.set(time,weather,true);
    environmentSky.set(theme);
    setSnowPreset(mood.snow);
    setWaterPreset(weather==='clear'&&initial&&params.get('water')==='wet'?'wet':mood.water);
    syncEnvironment();visuals.refreshUnits();
    if(!initial){const url=new URL(location.href);url.searchParams.set('environment',theme);history.replaceState(null,'',url);}
  };
  if(!sortieMode && !relayMode){
    const rawEnvironment=params.get('environment');
    const requested=rawEnvironment==='hollow'?'city':rawEnvironment;
    const inferred=params.get('zone')??(params.get('weather')==='snow'||(params.has('snow')&&params.get('snow')!=='off')?'snow_day':params.get('weather')==='storm'?'storm':null);
    const theme=requested&&Object.hasOwn(RANGE_ENVIRONMENTS,requested)?requested as RangeEnvironment:rangeEnvironmentForZone(inferred);
    setRangeEnvironment(theme,true);
    if(!survivalMode)dressing.mount(setRangeEnvironment);
  }
  scene.onDisposeObservable.addOnce(()=>dressing.dispose());
  if (relayMode) {
    arena.setEnvironment('city');
    atmosphere.set('day','clear',true);setSnowPreset('off');setWaterPreset('off');
    $('environment-controls').hidden=true;
  }
  if(survivalMode)$('environment-controls').hidden=true;
  if(!survivalMode)elevator?.mount();
  const liftRide = elevator && !survivalMode ? new RangeLiftRide(elevator, player, input, returnToArk) : null;
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
    snow.field.fill((x, z) => frozenSnow&&preset!=='off'?frozenSnowDepth(rangeSnowDepth(preset, x, z),x,z):rangeSnowDepth(preset, x, z));
    snow.enabled = preset !== 'off';
    player.unstick();
    weatherLab.syncSnow(preset);
    saveSetting('survivor-ground-snow', preset);
  }
  function syncEnvironment(): void {
    const settings = atmosphere.settings;
    if(frozenSnow&&settings.time==='dusk'){atmosphere.set('day',settings.weather);syncEnvironment();return;}
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
    if (time) { for(const option of time.options)if(option.value==='dusk')option.disabled=frozenSnow; time.value = settings.time;time.disabled = settings.weather === 'storm' || settings.weather === 'fog' || settings.weather === 'overcast'; }
    if ($('weather')) $<HTMLSelectElement>('weather').value = settings.weather;
    if ($('weather-intensity')) $<HTMLSelectElement>('weather-intensity').value = settings.intensity;
    saveSetting('survivor-time',settings.time);saveSetting('survivor-weather',settings.weather);saveSetting('survivor-intensity',settings.intensity);
    weatherLab.sync();
  }
  function setupMenu(): void {
    // The match settings dialog doubles as the pause menu; hide the MOBA-only rows.
    for (const id of ['controls', 'cast', 'heroics', 'facing']) $(id)?.closest('label')?.classList.add('hidden');
    // the MOBA camera select becomes the survivor camera angle
    const characterSelect = $<HTMLSelectElement>('variant');
    characterSelect.replaceChildren(...PLAYABLE_CHARACTER_IDS.map(id => new Option(CHARACTER_MODULES[id].name, id)));
    characterSelect.value = character.id;
    characterSelect.closest('label')!.firstChild!.textContent = 'Character (restarts run) ';
    characterSelect.addEventListener('change', () => switchCharacter(characterSelect.value));
    camera.setAngle('standard');
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
    const zoneTime: TimeOfDay = zone.endsWith('dusk') ? 'dusk' : zone.endsWith('night') || zone === 'storm' || zone === 'haunted-forest' ? 'night' : 'day';
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
    organizePauseMenu(online, applyRunResolution);
  }
  /** Stop the run for a menu; false if one is already open. closeMenu resumes it. */
  function pause(): boolean {
    if (paused) return false;
    paused = true;
    if (!online) {
      atmosphere.setPaused(true);
      weatherLab.setPaused(true);
      talentPicker?.setPaused(true);
    }
    input.enabled = false;
    input.clear();
    player.cancelCharges();
    hud.setPaused(true);
    audioEngine.play(UI.select);
    return true;
  }
  function openMenu(): void {
    if (!barePause && !pause()) return;
    barePause = false;
    pauseLabel.classList.add('hidden');
    $('menu').classList.remove('hidden');
    $('menu-close').focus({ preventScroll: true });
  }
  function openTalents(): void {
    if (relayMode) return;
    if(mode?.ended || (mode instanceof SurvivalMode && mode.arriving))return;
    if (!pause()) return;
    talentMenu.open();
  }
  function openBarePause(): void {
    if (!pause()) return;
    barePause = true;
    pauseLabel.innerHTML = `<b>PAUSED</b><span>${formatControlBinding(loadControlSettings().bindings.pause)} TO RESUME</span>`;
    pauseLabel.classList.remove('hidden');
  }
  function closeMenu(): void {
    if (!paused) return;
    paused = false;
    barePause = false;
    pauseLabel.classList.add('hidden');
    atmosphere.setPaused(false);
    weatherLab.setPaused(false);
    talentPicker?.setPaused(false);
    input.enabled = true;
    input.clear(); // the click that closed the menu must not fire
    $('menu').classList.add('hidden');
    talentMenu.close();
    hud.setPaused(false);
    audioEngine.play(UI.back);
    canvas.focus({ preventScroll: true });
  }

  // --- frame layout ---------------------------------------------------------------
  function applyRunResolution(): void {
    const { resolution } = loadDisplaySettings();
    engine.setHardwareScalingLevel(Math.max(frame.clientWidth / resolution.width, frame.clientHeight / resolution.height));
    engine.resize();
  }
  fitFrame(frame, () => { applyRunResolution(); hud.resize(); });

  // --- picking and projection ---------------------------------------------------------
  const aimPlane = Plane.FromPositionAndNormal(new Vector3(0, kit.groundTargeted ? 0 : AIM_HEIGHT, 0), Vector3.Up());
  const ray = new Ray(Vector3.Zero(), Vector3.Forward());
  const aimPoint = new Vector3(0, AIM_HEIGHT, 6);
  const identity = Matrix.Identity();
  const readAim = () => {
    if (!input.pointer.inside) return; // keep the last aim while the cursor is over the HUD or outside
    scene.createPickingRayToRef(input.pointer.x, input.pointer.y, identity, ray, camera.camera);
    aimPlane.d=-(player.position.y+(kit.groundTargeted?0:AIM_HEIGHT));
    const t = ray.intersectsPlane(aimPlane);
    if (t !== null && t > 0) aimPoint.copyFrom(ray.origin).addInPlace(ray.direction.scale(t));
  };
  const transform = new Matrix();
  const teammateIndicators = new TeammateIndicators($('hud'));
  scene.onDisposeObservable.addOnce(() => teammateIndicators.dispose());
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

  const modeInit:SortieModeInit = {
    scene, shadows: arena.shadows, vfx, field: targets, run, player, kit, camera, snow: snow.field, toScreen, get arenaRadius(){return arena.radius;}, params,
    // progress is saved under the NIKKE whose kit runs (only Snow White has one so far)
    characterId: character.id,
    nikke: { name: variant.name, art: burstArt ? `${import.meta.env.BASE_URL}${burstArt}` : null },
    refreshUnits: () => visuals.refreshUnits(),
    coop: coop ?? undefined,
  };
  const mode = coopGuest ? null : survivalMode ? await SurvivalMode.create(modeInit,elevator!,endlessMode)
    : labMode ? await LabMode.create(modeInit)
    : sortieMode || relayMode ? await (relayMode ? RelayMode : SortieMode).create(modeInit) : null;
  // A guest's Survival Round opens with the squad riding the arrival lift up, as on the host.
  if (coopGuest && survivalMode && elevator) { coopGuest.arriveBy(elevator); camera.snap(player.position); }
  if (mode) {
    // The sortie loads more Rapture models; give them the unit material plugins before anything compiles.
    visuals.refreshUnits();
    scene.onDisposeObservable.addOnce(() => mode.dispose());
  }
  const enemyLab = mode instanceof LabMode ? mode : testRange && !coopGuest ? await LabMode.create(modeInit, false) : null;
  if (enemyLab) {
    weatherLab.addTab('ENEMY', enemyLab.panel, labMode);
    if (enemyLab !== mode) {
      visuals.refreshUnits();
      scene.onDisposeObservable.addOnce(() => enemyLab.dispose());
    }
  }
  if (!sortieMode && !relayMode) {
    // Ashen Caldera: fire a volley on demand, or hold the schedule while looking around.
    const lab = document.createElement('div');
    lab.innerHTML = '<h3>Volcano</h3><p data-v></p><div class="weather-presets"><button type="button" data-v="1">Launch 1 rock</button><button type="button" data-v="5">Launch barrage (5)</button><button type="button" data-v="toggle">Pause eruptions</button><button type="button" data-v="go">Load Ashen Caldera</button></div><label style="display:flex;flex-direction:column;gap:4px;margin-top:10px">Lava advance <span data-lava-value></span><input type="range" min="0" max="100" step="1" data-lava></label>';
    const note = lab.querySelector<HTMLElement>('p[data-v]')!;
    const sync = () => { note.textContent = dressing.theme === 'volcano' ? (volcano.erupting ? 'Eruptions on schedule.' : 'Eruptions paused.') : 'Only on the Ashen Caldera.'; lab.querySelector<HTMLElement>('[data-v="toggle"]')!.textContent = volcano.erupting ? 'Pause eruptions' : 'Resume eruptions'; };
    // Scrub the lava sea between its starting shore (0%) and its final 10-minute line (100%).
    const lava = lab.querySelector<HTMLInputElement>('[data-lava]')!, lavaValue = lab.querySelector<HTMLElement>('[data-lava-value]')!;
    const syncLava = () => { const p = Math.round(volcano.lavaProgress * 100); lava.value = String(p); lavaValue.textContent = `${p}%`; };
    lava.addEventListener('input', () => { volcano.lavaProgress = Number(lava.value) / 100; lavaValue.textContent = `${lava.value}%`; });
    setInterval(() => { if (document.activeElement !== lava) syncLava(); }, 500);
    lab.addEventListener('pointerdown', (e) => e.stopPropagation());
    lab.addEventListener('click', (e) => {
      const v = (e.target as HTMLElement).closest<HTMLElement>('[data-v]')?.dataset.v;
      if (v === 'go') setRangeEnvironment('volcano');
      else if (v === 'toggle') volcano.erupting = !volcano.erupting;
      else if (v && dressing.theme === 'volcano') volcano.volley(Number(v), player, targets);
      sync();
    });
    sync();
    // Each event panel belongs to one map; only the open map's events are shown.
    const events = document.createElement('div');
    const eventPanels: [RangeEnvironment, HTMLElement][] = [
      ['volcano', lab],
      ['storm', mountStormRadioLab(radioEgg, player)],
      ['forest', mountEggLab(egg, player, () => { if (dressing.theme !== 'forest') setRangeEnvironment('forest'); })],
      ['sakura', mountSakuraEggLab(shrineEgg, player, () => { if (dressing.theme !== 'sakura') setRangeEnvironment('sakura'); })],
      ['frozen', mountSirenEggLab(sirenEgg, player, () => { if (dressing.theme !== 'frozen') setRangeEnvironment('frozen'); })],
      ['volcano', mountNihilisterEggLab(nihilisterEgg, () => volcano.giant(player, targets), () => { if (dressing.theme !== 'volcano') setRangeEnvironment('volcano'); })],
    ];
    const noEvents = document.createElement('p');
    events.append(...eventPanels.map(([, panel]) => panel), noEvents);
    let eventsTheme: RangeEnvironment | null = null;
    const syncEvents = () => {
      if (dressing.theme === eventsTheme) return;
      eventsTheme = dressing.theme;
      for (const [theme, panel] of eventPanels) panel.hidden = theme !== eventsTheme;
      sync();
      syncLava();
      noEvents.hidden = eventPanels.some(([theme]) => theme === eventsTheme);
      noEvents.textContent = `No events on ${RANGE_ENVIRONMENTS[eventsTheme]}.`;
    };
    syncEvents();
    // Map changes come from several places (lab select, event buttons, URL); follow whichever is open.
    setInterval(syncEvents, 300);
    weatherLab.addTab('Events', events);
  }
  // Test Range: squad NIKKEs and health boxes on demand (Weather Lab buttons), no deliveries.
  if (testRange) {
    rangeSupply = new SupplyLift(modeInit, null, new TelegraphLayer(scene, groundHeight(snow.field)), () => {}, Math.random);
    await rangeSupply.preload(3);
    scene.onDisposeObservable.addOnce(() => rangeSupply?.dispose());
  }
  // Leaving: the test range goes straight back to the Ark; mid-sortie it counts as dying.
  const leave = $<HTMLButtonElement>('leave-match');
  leave.textContent = 'QUIT TO MAIN MENU';
  if (sortieMode) leave.insertAdjacentHTML('afterend', '<p class="sub">Counts as dying: you keep XP and levels, and lose what you\'re carrying.</p>');
  if(survivalMode)leave.insertAdjacentHTML('afterend','<p class="sub">Ending early awards no core. Round talents reset; existing unlocks stay saved.</p>');
  leave.addEventListener('click', () => {
    if (mode && !mode.ended) mode.abandon();
    returnToMainMenu();
  });

  const enemyPacing = new EnemyAttackPacing();
  const enemyAttacks = (mode ? [] : targets.targets).map((target, index) =>
    new EnemyLaserAttack(ctx, target, player, 3 + index * .37, enemyPacing));
  scene.onDisposeObservable.addOnce(() => { for (const attack of enemyAttacks) attack.dispose(); });

  const coopNet = coop && coopHost ? new CoopNetHost(coop, player, input, variant.name, character.id as HeroId, targets, () => ({
    elapsed: mode instanceof SurvivalMode ? mode.round.elapsed : run.time, phase: mode instanceof SurvivalMode ? mode.round.phase : 'range',
    level: run.level, kills: run.kills, objective: mode instanceof SurvivalMode ? mode.objectiveText() : undefined,
    boss: mode instanceof SurvivalMode ? mode.bossHealth : null }), () => mode instanceof SurvivalMode ? mode.tells : null,
    variant.variant, takeCoopHandoff('host', normalizeRoomCode(params.get('room') ?? '') ?? '')) : null;
  if (coopNet && mode instanceof SurvivalMode) { mode.onBanner = (text, seconds) => coopNet.banner(text, seconds); mode.coopRoom = coopNet.code; }
  if (coopNet) {
    const lobbyButton = document.createElement('button');
    lobbyButton.id = 'quit-to-lobby';
    lobbyButton.type = 'button';
    lobbyButton.textContent = 'QUIT TO LOBBY';
    lobbyButton.title = 'Return everyone to the multiplayer lobby';
    leave.before(lobbyButton);
    lobbyButton.addEventListener('click', async () => {
      if (lobbyButton.disabled) return;
      lobbyButton.disabled = true;
      leave.disabled = true;
      lobbyButton.textContent = 'RETURNING TO LOBBY…';
      input.enabled = false;
      input.clear();
      if (mode && !mode.ended) mode.abandon();
      try { await coopNet.returnToLobby(); }
      finally { location.assign(`${location.pathname}?preview=multiplayer&lobby=host&room=${encodeURIComponent(coopNet.code)}`); }
    });
  }
  if (coopNet || coopGuest) {
    // Dev readout until the lobby exists (Phase 3): the code to give friends.
    const label = document.createElement('div');
    label.className = 'coop-room-code';
    $('hud').append(label);
    if (coopNet) { label.textContent = `CO-OP ROOM ${coopNet.code}`; scene.onDisposeObservable.addOnce(() => void coopNet.close()); }
    else setInterval(() => { label.textContent = `CO-OP ${coopGuest!.code} · ${coopGuest!.status}`; }, 500);
  }

  await kit.prepare?.();

  // --- loop -------------------------------------------------------------------------
  let effectDt = 0;
  // Stepping onto the lift deck pulls the camera in; stepping off pulls it out to its widest view.
  let wasOnDeck: boolean | null = null;
  scene.onBeforeAnimationsObservable.add(() => {
    if (input.wasPressed('menu')) { if (paused && !barePause) closeMenu(); else openMenu(); }
    // No bare pause online: a networked match never stops.
    if (input.wasPressed('pause') && !online) { if (barePause) closeMenu(); else if (!paused) openBarePause(); }
    if (input.wasPressed('talents')) { if (talentMenu.isOpen) closeMenu(); else if (!paused) openTalents(); }
    // A finished sortie (extracted or defeated) holds the world still behind its results screen.
    const compareFrozen = (shaderCompare && run.time >= 1) || (mode?.ended ?? false) || (liftRide?.ended ?? false);
    const dt = worldPaused() || compareFrozen ? 0 : Math.min(engine.getDeltaTime() / 1000, .05);
    effectDt = dt;
    scene.animationsEnabled = !worldPaused() && !compareFrozen;
    scene.particlesEnabled = !worldPaused() && !compareFrozen;
    if (!worldPaused()) {
      const eggAim = egg.aim ?? shrineEgg.aim;
      if (eggAim) aimPoint.copyFrom(eggAim);
      else if (!compareFrozen && !paused) readAim();
      const beforeWorldDt = kit.freezesEnemies ? 0 : dt;
      elevator?.update(beforeWorldDt);
      syncLiftCollision();
      liftRide?.update();
      storm.update(beforeWorldDt,player,targets,run);lake.update(beforeWorldDt,player,targets,run);
      player.update(dt, input, aimPoint);
      communication.update(dt, player.motion.x, player.motion.z);
      egg.update(dt);
      shrineEgg.update(dt);
      radioEgg.update(eggFreezesWorld() ? 0 : dt);
      sirenEgg.update(dt);
      nihilisterEgg.update(eggFreezesWorld()?0:dt);
      const inFire=dressing.theme==='outskirts'&&player.hp>0&&!player.transported&&inCraterFire(player.position.x,player.position.z);
      if(inFire&&dt>0){
        if(player.takeDamage(CRATER_FIRE_DPS*dt,true,true))player.damageFlash=Math.max(player.damageFlash,.1);
      }
      volcano.update(eggFreezesWorld()?0:dt,player,targets,run,camera.focus,s=>{if(s>0)camera.shake(s,.35);});
      heat.update(inFire?1:volcano.playerHeat,dt);
      playerPosition.copyFrom(player.position);
      // Egg cutscenes hold the world: no kit effects or idle passives, Raptures stand still.
      if (!eggFreezesWorld()) { kit.update(dt); passive?.update(dt); }
      const worldDt = kit.freezesEnemies || eggFreezesWorld() ? 0 : dt;
      scene.particlesEnabled = !worldPaused() && !compareFrozen && !kit.freezesEnemies;
      // The round's end freezes the world, but guests still need the host's final round update.
      coopNet?.update(Math.min(engine.getDeltaTime() / 1000, .05));
      coopGuest?.update(dt, worldDt);
      coop?.update(eggFreezesWorld() ? 0 : dt, worldDt);
      targets.update(worldDt, player.position);
      mode?.update(worldDt);
      if (enemyLab && enemyLab !== mode) enemyLab.update(worldDt);
      rangeSupply?.update(worldDt, 0, false);
      enemyPacing.update(worldDt);
      for (const attack of enemyAttacks) attack.update(worldDt, targets.movementMode !== 'inactive');
      run.update(mode instanceof SurvivalMode && mode.arriving ? 0 : worldDt);
      if(mode instanceof SurvivalMode)run.time=mode.round.elapsed;
      const onDeck = !!elevator && elevator.onDeck(player.position);
      if (wasOnDeck !== null && onDeck !== wasOnDeck) camera.zoomTo(onDeck ? LIFT_ZOOM : CAMERA_LIMITS.max);
      wasOnDeck = onDeck;
      camera.update(dt, player.position);
      atmosphere.setFogLights(eggFreezesWorld() ? [] : targets.targets,eggFreezesWorld() ? cutsceneVfx.fogEmitters : vfx.fogEmitters);
      // The cutscene's altar strike still has to fade while the world holds still.
      atmosphere.update(eggFreezesWorld() ? dt : worldDt, camera.focus);
      dressing.update(worldDt,player.position);
      // Share Ark's blue moonlight and glowing fireflies with Sakura's night variant.
      outskirtsNight.update(dt,(dressing.theme==='outskirts'||dressing.theme==='sakura')&&atmosphere.settings.time==='night',camera.focus,dressing.theme==='sakura');
      snow.field.refill(worldDt, atmosphere.snowfall);
      snow.update(worldDt);
      water.update(worldDt,atmosphere.rainStrength,atmosphere.lightningStrength);
      arena.followSun(camera.focus);
    }
    sceneryOcclusion.update(engine.getDeltaTime()/1000,player.position,[...dressing.meshes,...(elevator?.root.getChildMeshes().filter(m=>m.parent?.name==='elevator-fixed-mast')??[]),...scene.meshes.filter(m=>m.metadata?.cameraOccluder)]);
    const cutsceneActive = eggFreezesWorld();
    vfx.hidden = cutsceneActive;
    kit.setCutscenePresentation?.(cutsceneActive);
    targets.draw(cutsceneActive);
    camera.camera.getViewMatrix().multiplyToRef(camera.camera.getProjectionMatrix(), transform);
    hud.update(player, run, targets, toScreen, input.pointer);
    teammateIndicators.update(coopGuest?.teammates ?? coop?.teammates ?? [], player, camera.camera, toScreen);
    egg.layout();
    shrineEgg.layout();
    radioEgg.layout();
    sirenEgg.layout();
    nihilisterEgg.layout();
    // The Rapture Lab has no talent picks: its panel sits where the picker opens.
    if (!labMode) talentPicker?.update(worldPaused() ? 0 : engine.getDeltaTime() / 1000);
    weatherLab.updateSnow(player.position.x, player.position.z);
    weatherLab.updateWater();
    input.endFrame();
  });
  scene.onAfterAnimationsObservable.add(() => {
    if (worldPaused()) return;
    player.afterAnimation();
    coop?.afterAnimation();
    coopGuest?.afterAnimation();
    // Attached effects need this frame's aimed muzzle, not the previous animation's position.
    vfx.update(effectDt);
    cutsceneVfx.update(effectDt);
  });

  snow.flush();
  await scene.whenReadyAsync();
  scene.onAfterRenderObservable.addOnce(() => {
    // Let the rendered frame reach the screen before uncovering it.
    requestAnimationFrame(() => {
      $('loading')?.remove();
      void revealLevelTransition().finally(() => { startingLevel = false; });
    });
  });
  engine.runRenderLoop(() => scene.render());
  Object.assign(window, { game: { scene, engine, player, kit, passive, hud, run, targets, camera, vfx, input, talentMenu, talentPicker, toScreen, aimPoint, atmosphere, visuals, snow, water, sortie: mode, coop, coopNet, coopGuest, dressing, setRangeEnvironment, elevator, liftRide, sceneryOcclusion, storm, lake, egg, shrineEgg, radioEgg, sirenEgg, nihilisterEgg, volcano } });
}

main().catch((e) => {
  cancelLevelTransition();
  console.error(e);
  const loading = document.getElementById('loading');
  if (loading) loading.textContent = `Failed to load: ${e instanceof Error ? e.message : e}`;
});
