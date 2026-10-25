import { Atmosphere, TIMES_OF_DAY, type TimeOfDay } from './atmosphere';
import './weather-lab.css';
import type { SnowPreset } from './snow-field';
import type { SnowLayer } from './snow';
import type { WaterPreset, WaterLayer } from './water';
import { ENEMY_MOVEMENT, type EnemyMovement } from './targets';

export interface WeatherLabOptions {
  /** the HUD element the panel is added to */
  parent: HTMLElement;
  atmosphere: Atmosphere;
  snow: SnowLayer;
  water: WaterLayer;
  /** after a time / weather / intensity change, so the run can apply its ground-effect rules */
  onEnvironmentChange: () => void;
  /** a press inside the panel must not also fire the weapon */
  clearInput: () => void;
  setSnow: (preset: SnowPreset) => void;
  setWater: (preset: WaterPreset) => void;
  setEnemyMovement: (mode: EnemyMovement) => void;
}

/** Map-owned weather with a small set of valid variations. */
export class WeatherLab {
  private readonly panel = document.createElement('details');
  private readonly time: HTMLSelectElement;
  private readonly wet: HTMLInputElement;
  private readonly enemies: HTMLSelectElement;
  private readonly condition: HTMLElement;
  constructor(private readonly options: WeatherLabOptions) {
    const { parent, atmosphere, clearInput, setWater, setEnemyMovement } = options;
    this.panel.id = 'weather-lab';
    this.panel.innerHTML = `<summary>WEATHER LAB</summary>
      <div class="weather-lab-body">
        <p id="lab-condition"></p>
        <label>Time of day<select id="lab-time"></select></label>
        <label id="lab-wet-row">Wet ground<input id="lab-wet" type="checkbox"></label>
        <details class="lab-enemies"><summary>Training controls</summary>
          <label>Enemies<select id="lab-enemy-movement"></select></label>
        </details>
      </div>`;
    parent.append(this.panel);
    this.time = this.panel.querySelector('#lab-time')!;
    this.wet = this.panel.querySelector('#lab-wet')!;
    this.enemies = this.panel.querySelector('#lab-enemy-movement')!;
    this.condition = this.panel.querySelector('#lab-condition')!;
    for (const [value, label] of Object.entries(TIMES_OF_DAY)) this.time.add(new Option(label, value));
    for (const [value, label] of Object.entries(ENEMY_MOVEMENT)) this.enemies.add(new Option(label, value));
    this.time.addEventListener('change', () => {
      atmosphere.set(this.time.value as TimeOfDay, atmosphere.settings.weather);
      options.onEnvironmentChange();
      this.sync();
    });
    this.wet.addEventListener('change', () => setWater(this.wet.checked ? 'wet' : 'off'));
    this.enemies.addEventListener('change', () => setEnemyMovement(this.enemies.value as EnemyMovement));
    this.panel.addEventListener('pointerdown', clearInput);
    this.panel.addEventListener('keydown', event => { if (event.code !== 'Escape') event.stopPropagation(); });
    this.sync();
  }
  sync(): void {
    const { time, weather } = this.options.atmosphere.settings;
    this.time.value = time;
    this.time.disabled = weather === 'storm';
    this.panel.querySelector<HTMLElement>('#lab-wet-row')!.hidden = weather !== 'clear';
    this.condition.textContent = {
      clear: 'Clear skies. Wet ground is optional.',
      storm: 'Night storm ? rain and wet ground.',
      snow: 'Snowfall ? snow-covered ground.',
      petals: 'Sakura ? drifting petals and pink lighting.',
    }[weather];
  }
  open(): void { this.panel.open = true; this.sync(); }
  syncSnow(_preset: SnowPreset): void {}
  syncWater(preset: WaterPreset): void { this.wet.checked = preset === 'wet'; }
  syncEnemies(mode: EnemyMovement): void { this.enemies.value = mode; }
  updateWater(): void {}
  updateSnow(_x: number, _z: number): void {}
  setPaused(paused: boolean): void { this.panel.hidden = paused; }
  dispose(): void { this.panel.remove(); }
}
