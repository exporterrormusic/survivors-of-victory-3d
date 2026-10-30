import { CHARACTER_MODULES, PLAYABLE_CHARACTER_IDS } from '../characters';
import { Atmosphere, TIMES_OF_DAY, type TimeOfDay } from './atmosphere';
import './weather-lab.css';
import { showAchievementToasts } from './achievement-toast';
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
  character?: string;
  switchCharacter?: (id: string) => void;
  skins?: readonly { id: string; name: string }[];
  skin?: string;
  switchSkin?: (id: string) => void;
  burstAlwaysMax?: boolean;
  setBurstAlwaysMax?: (enabled: boolean) => void;
  /** testing: gain one level immediately */
  grantLevel?: () => void;
  /** Test Range: a supply-squad NIKKE beside the player */
  spawnAlly?: () => void;
  /** Test Range: a health crate on the ground ahead of the player */
  dropCrate?: () => void;
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
    // Each .lab-page becomes its own tab, so no single page grows long.
    this.panel.innerHTML = `<summary>TEST LAB</summary>
      <div class="weather-lab-body">
        <div class="lab-page" data-label="World">
          <p id="lab-condition"></p>
          <label>Time of day<select id="lab-time"></select></label>
          <label id="lab-wet-row">Wet ground<input id="lab-wet" type="checkbox"></label>
        </div>
        <div class="lab-page" data-label="Player">
          <label id="lab-character-row">Character<select id="lab-character"></select></label>
          <label id="lab-skin-row">Skin (restarts run)<select id="lab-skin"></select></label>
          <button type="button" id="lab-grant-level">Grant level</button>
          <label id="lab-burst-row">Burst always max<input id="lab-burst" type="checkbox"></label>
        </div>
        <div class="lab-page" data-label="Spawns">
          <button type="button" id="lab-spawn-ally">Spawn ally</button>
          <button type="button" id="lab-drop-crate">Drop health box</button>
          <label>Enemies<select id="lab-enemy-movement"></select></label>
        </div>
        <div class="lab-page" data-label="UI">
          <button type="button" id="lab-achievement">Test achievement pop-up</button>
          <button type="button" id="lab-achievements">Test 3 pop-ups</button>
        </div>
      </div>`;
    parent.append(this.panel);
    const burst = this.panel.querySelector<HTMLInputElement>('#lab-burst')!;
    burst.checked = options.burstAlwaysMax ?? false;
    this.panel.querySelector<HTMLElement>('#lab-burst-row')!.hidden = !options.setBurstAlwaysMax;
    burst.addEventListener('change', () => options.setBurstAlwaysMax?.(burst.checked));
    const grant = this.panel.querySelector<HTMLButtonElement>('#lab-grant-level')!;
    grant.hidden = !options.grantLevel;
    grant.addEventListener('click', () => { options.grantLevel?.(); grant.blur(); });
    for (const [id, action] of [['#lab-spawn-ally', options.spawnAlly], ['#lab-drop-crate', options.dropCrate]] as const) {
      const button = this.panel.querySelector<HTMLButtonElement>(id)!;
      button.hidden = !action;
      button.addEventListener('click', () => { action?.(); button.blur(); });
    }
    const placeholder = (n: number) => showAchievementToasts(Array.from({ length: n }, (_, i) => ({
      category: 'combat' as const, id: `lab-test-${i}`, points: 100 * (i + 1), source: 'totalKills' as const, target: 1,
      title: i ? `TEST ACHIEVEMENT ${i + 1}` : 'TEST ACHIEVEMENT', description: 'Placeholder pop-up from the Test Lab. Nothing is saved.',
    })));
    for (const [id, count] of [['#lab-achievement', 1], ['#lab-achievements', 3]] as const) {
      const button = this.panel.querySelector<HTMLButtonElement>(id)!;
      button.addEventListener('click', () => { placeholder(count); button.blur(); });
    }
    const character = this.panel.querySelector<HTMLSelectElement>('#lab-character')!;
    for (const id of PLAYABLE_CHARACTER_IDS) character.add(new Option(CHARACTER_MODULES[id].name, id));
    character.value = options.character ?? 'snow-white';
    this.panel.querySelector<HTMLElement>('#lab-character-row')!.hidden = !options.switchCharacter;
    character.addEventListener('change', () => options.switchCharacter?.(character.value));
    const skin = this.panel.querySelector<HTMLSelectElement>('#lab-skin')!;
    for (const outfit of options.skins ?? []) skin.add(new Option(outfit.name, outfit.id));
    skin.value = options.skin ?? skin.options[0]?.value ?? '';
    skin.disabled = skin.options.length < 2;
    this.panel.querySelector<HTMLElement>('#lab-skin-row')!.hidden = !options.switchSkin;
    skin.addEventListener('change', () => options.switchSkin?.(skin.value));
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
    this.initTabs();
    this.sync();
  }
  sync(): void {
    const { time, weather } = this.options.atmosphere.settings;
    this.time.value = time;
    this.time.disabled = weather === 'storm' || weather === 'fog' || weather === 'overcast';
    this.panel.querySelector<HTMLElement>('#lab-wet-row')!.hidden = weather !== 'clear';
    this.condition.textContent = {
      overcast: 'Grey Ruins ? permanent soft overcast light.',
      fog: 'Permanent night. Cold blue fog drifts among the pines.',
      clear: 'Clear skies. Wet ground is optional.',
      storm: 'Night storm ? rain and wet ground.',
      snow: 'Snowfall ? snow-covered ground.',
      petals: 'Sakura ? drifting petals and pink lighting.',
    }[weather];
  }
  private initTabs(): void {
    const body = this.panel.querySelector<HTMLElement>('.weather-lab-body')!;
    this.panel.classList.add('tabbed');
    const bar = document.createElement('div');
    bar.className = 'lab-tabs';
    bar.setAttribute('role', 'tablist');
    body.before(bar);
    for (const page of [...body.querySelectorAll<HTMLElement>(':scope > .lab-page')]) this.tab(bar, body, page.dataset.label!, page);
    bar.addEventListener('click', event => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[role="tab"]');
      if (button) { this.selectTab(Number(button.dataset.tab)); button.blur(); }
    });
  }
  /** Adds a tab after the built-in ones (ENEMY, Events). */
  addTab(label: string, content: HTMLElement, select = false): void {
    const bar = this.panel.querySelector<HTMLElement>('.lab-tabs')!;
    this.tab(bar, this.panel.querySelector<HTMLElement>('.weather-lab-body')!, label, content);
    if (select) { this.selectTab(bar.children.length - 1); this.panel.open = true; }
  }
  private tab(bar: HTMLElement, body: HTMLElement, label: string, content: HTMLElement): void {
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('role', 'tab');
    button.dataset.tab = String(bar.children.length);
    button.textContent = label;
    bar.append(button);
    content.classList.add('lab-tab');
    body.append(content);
    this.selectTab(0);
  }
  private selectTab(index: number): void {
    const tabs = this.panel.querySelectorAll<HTMLButtonElement>('.lab-tabs [role="tab"]');
    const pages = this.panel.querySelectorAll<HTMLElement>('.weather-lab-body > .lab-tab');
    tabs.forEach((t, i) => t.setAttribute('aria-selected', String(i === index)));
    pages.forEach((p, i) => { p.hidden = i !== index; });
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
