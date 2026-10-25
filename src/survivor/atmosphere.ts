// World-space weather for Babylon. The Phaser environment is a mood reference only:
// precipitation, ground ripples and ambient motes share one batched procedural 3D shader.
import { type Camera, Color3, Constants, Effect, Mesh, type Scene, ShaderMaterial, Vector3, Vector4, VertexBuffer } from '@babylonjs/core';
import { audioEngine } from '../audio/audio-engine';
import type { Cue } from '../audio/sound-bank';
import type { createVisualSettings } from '../visuals';
import { StormLightning } from './lightning';
import { NightAura } from './night-aura';
import { SurfaceWetness } from './surface-wetness';
import { elevatorGroundMaskGLSL } from './elevator-footprint';
import { GroundPetals } from './petals';

export const TIMES_OF_DAY = { day: 'Day', dusk: 'Dusk', night: 'Night' } as const;
export const WEATHER = { clear: 'Clear', storm: 'Thunderstorm', snow: 'Snow', petals: 'Drifting petals' } as const;
export const WEATHER_INTENSITIES = { light: 'Light', moderate: 'Light +' } as const;
export type WeatherIntensity = keyof typeof WEATHER_INTENSITIES;
const STRENGTH = { light: .6, moderate: .75 };
const DENSITY = { light: .24, moderate: .32 };
export type TimeOfDay = keyof typeof TIMES_OF_DAY;
export type Weather = keyof typeof WEATHER;

const RAIN: Cue = { url: `${import.meta.env.BASE_URL}assets/audio/gameplay/environment/rain.mp3`, volume: .48, voices: 1, gap: 0 };
const THUNDER: Cue = { url: `${import.meta.env.BASE_URL}assets/audio/gameplay/environment/thunder.wav`, volume: .55, voices: 3, gap: .75 };
const DAY_FOG = new Color3(.2, .27, .29), NIGHT_FOG = new Color3(.035, .055, .105);
const DUSK_FOG = new Color3(.32, .27, .25), CLOUD_FOG = new Color3(.16, .21, .27);
const SAKURA_FOG = new Color3(.38, .25, .32);
const SPAN = 54;

Effect.ShadersStore.rangeWeatherVertexShader = `
precision highp float;
attribute vec3 position;
attribute vec2 uv;
attribute vec4 weatherSeed;
uniform mat4 viewProjection;
uniform vec3 focus;
uniform vec3 cameraPosition;
uniform vec3 cameraRight;
uniform vec3 cameraUp;
uniform float clock;
uniform vec4 amounts;
uniform float night;
uniform float density;
uniform float strength;
${elevatorGroundMaskGLSL}
varying vec2 vUV;
varying vec4 vWeather;
varying float vAlpha;
const float span = ${SPAN.toFixed(1)};
// The focus only selects a repeated world cell. Running never adds camera motion to flakes.
vec2 wrapWorld(vec2 p) { return p - floor((p - focus.xz + span * .5) / span) * span; }
void main() {
  vUV = uv;
  float kind = weatherSeed.w;
  float seed = fract(weatherSeed.x * 73.21 + weatherSeed.z * 29.67);
  vec3 p;
  float alpha = 1.0;
  vec2 corner = position.xy;
  if (kind < .5) {
    // Rain falls through a real volume; slanted ribbons face the camera along their axis.
    float speed = mix(21.0, 32.0, seed);
    float travel = clock * speed;
    p = vec3(wrapWorld(weatherSeed.xz * span + vec2(-clock * 7.0, clock * 1.4)).x,
      mod(weatherSeed.y * 14.0 - travel, 14.0),
      wrapWorld(weatherSeed.xz * span + vec2(-clock * 7.0, clock * 1.4)).y);
    vec3 axis = normalize(vec3(-7.0, -speed, 1.4));
    vec3 side = normalize(cross(axis, normalize(cameraPosition - p)));
    p += side * corner.x * mix(.025, .05, seed) + axis * corner.y * mix(.8, 1.45, seed);
    alpha = amounts.x * mix(.45, .7, seed) * smoothstep(0.0, .35, p.y);
  } else if (kind < 1.5) {
    // A slow, shared sideways drift reads as a camera-attached field of dots. Give
    // each flake a distinct fall speed and small flutter, with downward motion dominant.
    float phase = seed * 62.83;
    float flutter = clock * mix(1.1, 2.1, fract(seed * 7.13)) + phase;
    vec2 drift = vec2(clock * mix(-.15, .55, seed) + sin(flutter) * .28,
      -clock * mix(.18, .35, fract(seed * 11.71)) + cos(flutter * .73) * .24);
    vec2 xz = wrapWorld(weatherSeed.xz * span + drift);
    float height = mod(weatherSeed.y * 12.0 - clock * mix(1.5, 2.9, seed), 12.0);
    p = vec3(xz.x, height, xz.y);
    float angle = phase + clock * mix(-1.4, 1.4, fract(seed * 19.37));
    vec2 flake = corner * vec2(.65 + .35 * abs(sin(flutter)), 1.0);
    flake = mat2(cos(angle), -sin(angle), sin(angle), cos(angle)) * flake;
    p += (cameraRight * flake.x + cameraUp * flake.y) * mix(.065, .15, seed);
    alpha = amounts.y * .8 * smoothstep(0.0, .35, height) * (1.0 - smoothstep(11.3, 12.0, height));
  } else if (kind < 2.5) {
    // Petals have their own persistent world-space batch; this is fireflies only.
    vec2 xz = wrapWorld(weatherSeed.xz * span + vec2(clock * .5, sin(clock * .4 + seed * 60.0)));
    p = vec3(xz.x, .6 + weatherSeed.y * 2.5 + sin(clock + seed * 70.0) * .25, xz.y);
    p += (cameraRight * corner.x + cameraUp * corner.y) * .14;
    alpha = amounts.w * (.3 + .6 * pow(.5 + .5 * sin(clock * 1.8 + seed * 40.0), 2.0));
  } else {
    // Small, expanding ripples lie on the ground and retain normal scene depth testing.
    float phase = fract(clock * mix(1.4, 2.2, seed) + weatherSeed.y);
    vec2 xz = wrapWorld(weatherSeed.xz * span);
    p = vec3(xz.x, .025 + seed * .01, xz.y);
    p.xz += corner * mix(.06, .6, phase);
    alpha = amounts.x * .48 * (1.0 - phase) * smoothstep(0.0, .08, phase);
    if (onElevatorGround(xz)) alpha = 0.0;
  }
  float edge = 1.0 - smoothstep(span * .40, span * .49, max(abs(p.x-focus.x), abs(p.z-focus.z)));
  float nearFade = smoothstep(1.2, 3.0, distance(cameraPosition, p));
  float population = 1.0 - smoothstep(density - .04, density, fract(weatherSeed.y * 57.17));
  vAlpha = min(.95, alpha * strength) * edge * nearFade * population;
  vWeather = vec4(kind, seed, amounts.z, night);
  gl_Position = viewProjection * vec4(p, 1.0);
}`;

Effect.ShadersStore.rangeWeatherFragmentShader = `
precision highp float;
varying vec2 vUV;
varying vec4 vWeather;
varying float vAlpha;
void main() {
  vec2 p = vUV * 2.0 - 1.0;
  float shape;
  vec3 color;
  if (vWeather.x < .5) {
    shape = (1.0 - smoothstep(.1, 1.0, abs(p.x))) * (1.0 - smoothstep(.4, 1.0, abs(p.y)));
    color = mix(vec3(.68, .79, .90), vec3(.48, .66, .88), vWeather.w);
  } else if (vWeather.x < 1.5) {
    shape = 1.0 - smoothstep(.2, 1.0, length(p));
    color = vec3(.91, .96, 1.0);
  } else if (vWeather.x < 2.5) {
    float petal = (1.0 - smoothstep(.90, 1.0, length(vec2(p.x / (.77 + .22 * p.y), p.y))))
      * smoothstep(.0, .07, abs(p.x) + (.70 - p.y) * .46);
    shape = mix(1.0 - smoothstep(.15, 1.0, length(p)), petal, vWeather.z);
    color = mix(vec3(.9, 1.0, .35), mix(vec3(.96, .58, .72), vec3(1.0, .83, .89), vWeather.y), vWeather.z);
  } else {
    shape = (1.0 - smoothstep(.04, .12, abs(length(p) - .72)));
    color = vec3(.62, .77, .88);
  }
  gl_FragColor = vec4(color, vAlpha * shape);
}`;

export class Atmosphere {
  private timeOfDay: TimeOfDay = 'day';
  private weather: Weather = 'clear';
  private intensity: WeatherIntensity = 'moderate';
  private age = 0;
  private night = 0;
  private dusk = 0;
  private clouds = 0;
  private readonly amounts = [0, 0, 0, 0];
  private readonly amountUniform = new Vector4();
  private readonly focus = new Vector3();
  private readonly right = new Vector3(1, 0, 0);
  private readonly up = new Vector3(0, 1, 0);
  private readonly fog = new Color3();
  private readonly mesh: Mesh;
  private readonly material: ShaderMaterial;
  private readonly lightning: StormLightning;
  private readonly playerAura: NightAura;
  private readonly groundPetals: GroundPetals;
  private readonly fallingPetals: GroundPetals;
  readonly wetness: SurfaceWetness;
  private playerPosition: Vector3 | null = null;
  private stopRain: (() => void) | null = null;
  private paused = false;
  private disposed = false;
  private lightningIn = 4;
  private lightningAge = 99;
  private flash = 0;
  private thunderIn = -1;
  private readonly reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

  constructor(private readonly scene: Scene, private readonly camera: Camera, private readonly visuals: ReturnType<typeof createVisualSettings>, excludeElevatorGround = false) {
    this.lightning = new StormLightning(scene,camera);
    this.playerAura = new NightAura(scene);
    this.groundPetals = new GroundPetals(scene, false, excludeElevatorGround);
    this.fallingPetals = new GroundPetals(scene, true, excludeElevatorGround);
    this.wetness = new SurfaceWetness(scene);
    audioEngine.preload([RAIN.url,THUNDER.url]);
    this.mesh = new Mesh('range-weather', scene);
    this.mesh.isPickable = false;
    this.mesh.alwaysSelectAsActiveMesh = true;
    const positions: number[] = [], uvs: number[] = [], seeds: number[] = [], indices: number[] = [];
    for (const [kind, count] of [6400, 1800, 480, 1100].entries()) {
      for (let i = 0; i < count; i++) {
        const seed = [Math.random(), Math.random(), Math.random(), kind];
        const first = positions.length / 3;
        for (const [x, y] of [[-.5, -.5], [.5, -.5], [.5, .5], [-.5, .5]]) {
          positions.push(x, y, 0);uvs.push(x + .5, y + .5);seeds.push(...seed);
        }
        indices.push(first, first+1, first+2, first, first+2, first+3);
      }
    }
    this.mesh.setVerticesData(VertexBuffer.PositionKind, positions);
    this.mesh.setVerticesData(VertexBuffer.UVKind, uvs);
    this.mesh.setVerticesData('weatherSeed', seeds, false, 4);
    this.mesh.setIndices(indices);
    this.material = new ShaderMaterial('range-weather-mat', scene, 'rangeWeather', {
      attributes: ['position', 'uv', 'weatherSeed'],
      uniforms: ['viewProjection', 'focus', 'cameraPosition', 'cameraRight', 'cameraUp', 'clock', 'amounts', 'night', 'density', 'strength', 'excludeElevatorGround'],
      needAlphaBlending: true,
    });
    this.material.alphaMode = Constants.ALPHA_COMBINE;
    this.material.disableDepthWrite = true;
    this.material.setFloat('excludeElevatorGround', excludeElevatorGround ? 1 : 0);
    this.material.backFaceCulling = false;
    this.mesh.material = this.material;
    scene.onDisposeObservable.addOnce(() => this.dispose());
    this.update(0, Vector3.Zero());
  }

  get settings(): { time: TimeOfDay; weather: Weather; intensity: WeatherIntensity } { return { time: this.timeOfDay, weather: this.weather, intensity: this.intensity }; }
  get rainStrength(): number { return this.amounts[0] * STRENGTH[this.intensity]; }
  get lightningStrength(): number { return this.flash; }

  setPlayerPosition(position: Vector3): void { this.playerPosition = position; }

  /** Actual eased snowfall, including intensity; used to refill ground footprints. */
  get snowfall(): number { return this.amounts[1] * STRENGTH[this.intensity]; }

  setIntensity(intensity: WeatherIntensity): void {
    if (this.disposed || intensity === this.intensity) return;
    this.intensity = intensity;
    this.stopRain?.();this.stopRain = null;this.syncAudio();
    this.update(0,this.focus);
  }

  /** Test-range control and the automatic storm share the same bolt/light/audio path. */
  strike(): boolean {
    if (this.disposed || this.paused || this.lightningAge < .9) return false;
    this.lightningAge = 0;
    this.lightningIn = 4 + Math.random() * 3;
    this.thunderIn = .18 + Math.random() * .22;
    this.lightning.strike(this.focus,STRENGTH[this.intensity]);
    this.lightning.update(0,this.reducedMotion.matches);
    return true;
  }

  set(time: TimeOfDay, weather: Weather | 'rain', immediate = false): void {
    if (this.disposed) return;
    // Old test links and stored preferences used a separate rain mode.
    weather = weather === 'rain' ? 'storm' : weather;
    if (weather !== this.weather) {
      this.lightningAge = 99;this.thunderIn = -1;this.lightningIn = 1 + Math.random() * 1.5;
    }
    this.timeOfDay = weather === 'storm' ? 'night' : time;this.weather = weather;
    this.syncAudio();
    if (weather === 'storm') audioEngine.preload([THUNDER.url]);
    if (immediate) this.update(0, this.focus, true);
  }

  setPaused(paused: boolean): void {
    if (paused === this.paused) return;
    this.paused = paused;
    this.syncAudio();
  }

  private syncAudio(): void {
    const wet = !this.paused && this.weather === 'storm';
    if (wet && !this.stopRain) this.stopRain = audioEngine.loop({ ...RAIN, volume: RAIN.volume * STRENGTH[this.intensity] }, .6);
    if (!wet && this.stopRain) { this.stopRain();this.stopRain = null; }
  }

  update(dt: number, focus: Vector3, immediate = false): void {
    if (this.disposed) return;
    if (this.paused) dt = 0;
    this.age += dt;
    this.focus.copyFrom(focus);
    const blend = immediate ? 1 : 1 - Math.exp(-dt * 3.5);
    const ease = (value: number, target: number) => Math.abs(value - target) < .001 ? target : value + (target - value) * blend;
    this.night = ease(this.night, this.timeOfDay === 'night' ? 1 : 0);
    this.dusk = ease(this.dusk, this.timeOfDay === 'dusk' ? 1 : 0);
    this.clouds = ease(this.clouds, this.weather === 'storm' ? 1 : this.weather === 'snow' ? .3 : 0);
    this.amounts[0] = ease(this.amounts[0], this.weather === 'storm' ? 1 : 0);
    this.amounts[1] = ease(this.amounts[1], this.weather === 'snow' ? 1 : 0);
    this.amounts[2] = ease(this.amounts[2], this.weather === 'petals' ? 1 : 0);
    this.amounts[3] = ease(this.amounts[3], this.weather === 'clear' ? this.night : 0);
    if (dt > 0) {
      this.lightningAge += dt;
      if (this.weather === 'storm') {
        this.lightningIn -= dt;
        if (this.lightningIn <= 0) this.strike();
      }
      if (this.thunderIn >= 0) {
        this.thunderIn -= dt;
        if (this.thunderIn < 0) audioEngine.play(THUNDER,STRENGTH[this.intensity]);
      }
    }
    // Rain density stays gentle; a strike still needs enough light and a visible
    // afterglow to illuminate painted surfaces through the Anime lighting pass.
    const flash = this.reducedMotion.matches ? 0 : (1.8 + .4 * STRENGTH[this.intensity])
      * Math.exp(-this.lightningAge * 5) * Math.min(1, this.lightningAge / .018)
      * Math.max(0, 1 - (this.lightningAge / .85) ** 2);
    this.lightning.update(this.lightningAge,this.reducedMotion.matches);
    this.flash = flash;
    this.visuals.setAtmosphere(this.night, this.dusk, this.clouds, flash, this.amounts[2]);
    this.groundPetals.update(dt,this.age,this.playerPosition,this.amounts[2],this.night,this.reducedMotion.matches);
    this.fallingPetals.update(dt,this.age,this.playerPosition,this.amounts[2] * STRENGTH[this.intensity],this.night,this.reducedMotion.matches);
    this.wetness.update(dt,this.rainStrength,immediate);
    this.playerAura.update(this.age,this.night,this.playerPosition,this.reducedMotion.matches);
    Color3.LerpToRef(DAY_FOG, NIGHT_FOG, this.night, this.fog);
    Color3.LerpToRef(this.fog, DUSK_FOG, this.dusk, this.fog);
    Color3.LerpToRef(this.fog, CLOUD_FOG, this.clouds * (1 - this.night * .7), this.fog);
    Color3.LerpToRef(this.fog, SAKURA_FOG, this.amounts[2] * .32 * (1 - this.night * .7), this.fog);
    this.scene.fogColor.copyFrom(this.fog);
    this.scene.clearColor.set(this.fog.r * .8, this.fog.g * .85, this.fog.b * .9, 1);
    this.scene.fogDensity = .012 + this.clouds * (.022 - this.night * .01) + this.night * .003 + this.dusk * .006;
    this.camera.getViewMatrix();
    const world = this.camera.getWorldMatrix();
    Vector3.TransformNormalToRef(Vector3.RightReadOnly, world, this.right);
    Vector3.TransformNormalToRef(Vector3.UpReadOnly, world, this.up);
    this.material.setVector3('focus', this.focus);
    this.material.setVector3('cameraPosition', this.camera.globalPosition);
    this.material.setVector3('cameraRight', this.right);
    this.material.setVector3('cameraUp', this.up);
    this.material.setFloat('clock', this.age);
    this.amountUniform.set(this.amounts[0], this.amounts[1], this.amounts[2], this.amounts[3]);
    this.material.setVector4('amounts', this.amountUniform);
    this.material.setFloat('night', this.night);
    this.material.setFloat('density',DENSITY[this.intensity]);
    this.material.setFloat('strength',STRENGTH[this.intensity]);
    this.mesh.setEnabled(this.amounts.some(amount => amount > 0));
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.stopRain?.();this.stopRain = null;
    this.fallingPetals.dispose();this.groundPetals.dispose();this.mesh.dispose();this.material.dispose();this.lightning.dispose();this.playerAura.dispose();this.wetness.dispose();
  }
}
