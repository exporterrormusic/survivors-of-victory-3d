// In-match music player, after Survivors of Victory's Godot MusicPlayerUI: the track name, a thin
// progress line, and previous / play-pause / next, plus mute. It sits in one strip above
// the minimap (matches only; the front end has its own Settings screen). The F10 menu's
// Music / SFX volume rows are built here too. Everything edits the shared audio settings.
import { AUDIO_SETTINGS_EVENT, loadAudioSettings, saveAudioSettings, type AudioSettings } from '../frontend/settings/GameSettings';
import { audioEngine } from './audio-engine';
import { UI, type Track } from './sound-bank';
import './music-control.css';

const RESTORE_KEY = 'nikke-moba.music-restore-volume';
/** Survivors' − / + volume step */
const STEP = 0.1;

type Channel = 'musicVolume' | 'sfxVolume';

export interface TrackControls {
  readonly next?: () => void;
  readonly previous?: () => void;
}

interface Row {
  channel: Channel;
  fill: HTMLElement;
  value: HTMLElement;
  bar: HTMLElement;
}

const ICONS = {
  previous: '<path d="M6 5h3v14H6zM19 5v14l-9-7z" fill="currentColor"/>',
  play: '<path d="M7 5v14l12-7z" fill="currentColor"/>',
  pause: '<path d="M6 5h4v14H6zM14 5h4v14h-4z" fill="currentColor"/>',
  next: '<path d="M5 5l9 7-9 7zM15 5h3v14h-3z" fill="currentColor"/>',
  sound: '<path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16 8.5a5 5 0 010 7M18.5 6a8.5 8.5 0 010 12" stroke="currentColor" stroke-width="2" fill="none"/>',
  muted: '<path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16 9l5 6M21 9l-5 6" stroke="currentColor" stroke-width="2" fill="none"/>',
};
const icon = (name: keyof typeof ICONS) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;

let player: {
  root: HTMLElement; title: HTMLElement; progress: HTMLElement;
  mute: HTMLButtonElement; previous: HTMLButtonElement; play: HTMLButtonElement; next: HTMLButtonElement;
} | undefined;
const rows: Row[] = [];
let nowPlaying: { title: string | null; controls: TrackControls } = { title: null, controls: {} };
let listening = false;
let shownPaused: boolean | null = null;

/** Report the current track (null when silent) and what previous / next do. */
export function setNowPlaying(title: string | null, controls: TrackControls = {}): void {
  nowPlaying = { title, controls };
  render();
}

/** Play `tracks` in order from the first, looping, with the strip's previous / next stepping through them. */
export function playPlaylist(tracks: readonly Track[]): void {
  let i = 0;
  const play = (n: number) => {
    i = (n + tracks.length) % tracks.length;
    void audioEngine.playMusic(tracks[i], () => play(i + 1));
    setNowPlaying(tracks[i].title, { next: () => play(i + 1), previous: () => play(i - 1) });
  };
  play(0);
}

/** The music strip, attached to the minimap panel (`parent`). */
export function mountMusicControl(parent: HTMLElement): void {
  if (player) return;
  const root = document.createElement('div');
  root.id = 'music-player';
  root.setAttribute('role', 'group');
  root.setAttribute('aria-label', 'Music player');
  root.innerHTML =
    '<span class="mp-title" aria-live="polite"></span>' +
    '<div class="mp-buttons">' +
    `<button class="mp-previous" type="button" aria-label="Previous track" title="Previous track">${icon('previous')}</button>` +
    '<button class="mp-play" type="button"></button>' +
    `<button class="mp-next" type="button" aria-label="Next track" title="Next track">${icon('next')}</button>` +
    '<button class="mp-mute" type="button"></button></div>' +
    '<div class="mp-progress" aria-hidden="true"><i></i></div>';
  parent.appendChild(root);
  player = {
    root,
    title: root.querySelector('.mp-title')!,
    progress: root.querySelector('.mp-progress i')!,
    mute: root.querySelector('.mp-mute')!,
    previous: root.querySelector('.mp-previous')!,
    play: root.querySelector('.mp-play')!,
    next: root.querySelector('.mp-next')!,
  };
  player.mute.addEventListener('click', toggleMute);
  player.previous.addEventListener('click', () => nowPlaying.controls.previous?.());
  player.next.addEventListener('click', () => nowPlaying.controls.next?.());
  player.play.addEventListener('click', () => {
    if (audioEngine.musicPaused) audioEngine.resumeMusic();
    else audioEngine.pauseMusic();
    tick();
  });
  // Clicks here never reach the match, and game hotkeys (Space, arrows) skip focused buttons.
  root.addEventListener('pointerdown', (e) => e.stopPropagation());
  root.addEventListener('keydown', (e) => e.stopPropagation());
  for (const button of root.querySelectorAll('button')) button.addEventListener('pointerup', () => button.blur());
  listen();
  render();
  setInterval(tick, 250);
}

/** Music and SFX volume rows (− bar + %, like Survivors' pause settings), for the match settings menu. */
export function mountVolumeRows(parent: HTMLElement): void {
  parent.append(volumeRow('musicVolume', 'Music volume'), volumeRow('sfxVolume', 'SFX volume'));
  listen();
  render();
}

function volumeRow(channel: Channel, label: string): HTMLElement {
  const row = document.createElement('div');
  row.className = 'volume-row';
  row.setAttribute('role', 'group');
  row.setAttribute('aria-label', label);
  row.innerHTML =
    `<span class="vr-label">${label}</span>` +
    `<button class="vr-step" type="button" aria-label="Lower ${label.toLowerCase()}">−</button>` +
    `<span class="vr-bar" role="slider" tabindex="0" aria-label="${label}" aria-valuemin="0" aria-valuemax="100"><i></i></span>` +
    `<button class="vr-step" type="button" aria-label="Raise ${label.toLowerCase()}">+</button>` +
    '<span class="vr-value"></span>';
  const [down, up] = row.querySelectorAll<HTMLButtonElement>('.vr-step');
  const bar = row.querySelector<HTMLElement>('.vr-bar')!;
  down.addEventListener('click', () => adjust(channel, -STEP));
  up.addEventListener('click', () => adjust(channel, STEP));
  bar.addEventListener('pointerdown', (e) => {
    const rect = bar.getBoundingClientRect();
    set(channel, Math.round(((e.clientX - rect.left) / rect.width) * 20) / 20);
  });
  bar.addEventListener('keydown', (e) => {
    if (e.code === 'ArrowLeft' || e.code === 'ArrowDown') adjust(channel, -STEP);
    else if (e.code === 'ArrowRight' || e.code === 'ArrowUp') adjust(channel, STEP);
    else return;
    e.preventDefault();
  });
  rows.push({ channel, fill: bar.querySelector('i')!, value: row.querySelector('.vr-value')!, bar });
  return row;
}

function adjust(channel: Channel, amount: number): void {
  set(channel, Math.round((loadAudioSettings()[channel] + amount) * 10) / 10);
}

function set(channel: Channel, volume: number): void {
  const settings: AudioSettings = { ...loadAudioSettings(), [channel]: Math.max(0, Math.min(1, volume)) };
  saveAudioSettings(settings);
  audioEngine.play(UI.select, 1.2);
}

function toggleMute(): void {
  const volume = loadAudioSettings().musicVolume;
  if (volume > 0) {
    try { localStorage.setItem(RESTORE_KEY, String(volume)); } catch { /* storage may be blocked */ }
    saveAudioSettings({ ...loadAudioSettings(), musicVolume: 0 });
  } else {
    let restore = 0.8;
    try { restore = Number(localStorage.getItem(RESTORE_KEY)) || restore; } catch { /* use the default */ }
    saveAudioSettings({ ...loadAudioSettings(), musicVolume: restore });
  }
}

function listen(): void {
  if (listening) return;
  listening = true;
  window.addEventListener(AUDIO_SETTINGS_EVENT, render);
}

/** Progress line and the play / pause button, which change without events. */
function tick(): void {
  if (!player) return;
  player.progress.style.width = `${audioEngine.musicProgress * 100}%`;
  const paused = audioEngine.musicPaused;
  if (paused === shownPaused) return;
  shownPaused = paused;
  player.play.innerHTML = icon(paused ? 'play' : 'pause');
  player.play.setAttribute('aria-label', paused ? 'Play music' : 'Pause music');
  player.play.title = paused ? 'Play' : 'Pause';
  player.root.classList.toggle('paused', paused);
}

function render(): void {
  const settings = loadAudioSettings();
  for (const row of rows) {
    const percent = Math.round(settings[row.channel] * 100);
    row.fill.style.width = `${percent}%`;
    row.value.textContent = `${percent}%`;
    row.bar.setAttribute('aria-valuenow', String(percent));
  }
  if (!player) return;
  const muted = settings.musicVolume <= 0;
  player.mute.innerHTML = icon(muted ? 'muted' : 'sound');
  player.mute.setAttribute('aria-label', muted ? 'Unmute music' : 'Mute music');
  player.mute.title = muted ? 'Unmute' : 'Mute';
  player.root.classList.toggle('muted', muted);
  player.title.textContent = `♪ ${nowPlaying.title ?? '—'}`;
  player.title.title = nowPlaying.title ?? '';
  player.previous.disabled = !nowPlaying.controls.previous;
  player.next.disabled = !nowPlaying.controls.next;
  tick();
}
