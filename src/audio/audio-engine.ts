// One Web Audio graph for match sound. Music and SFX buses follow the shared audio settings
// (the music control and the Settings screen); cues decode once and are voice-limited, so
// hundreds of minions cannot stack hundreds of identical shots.
import { AUDIO_SETTINGS_EVENT, loadAudioSettings } from '../frontend/settings/GameSettings';
import type { Cue, Track } from './sound-bank';

interface Graph {
  context: AudioContext;
  music: GainNode;
  sfx: GainNode;
}

const MUSIC_FADE = 0.8;

interface MusicState {
  track: Track;
  gain: GainNode;
  buffer: AudioBuffer;
  loop: boolean;
  onEnd?: () => void;
  /** null while paused */
  source: AudioBufferSourceNode | null;
  /** context time the track's start corresponds to (while playing) */
  startedAt: number;
  /** seconds into the track (while paused) */
  offset: number;
}

class AudioEngine {
  private graph?: Graph;
  private readonly buffers = new Map<string, Promise<AudioBuffer | null>>();
  private readonly activity = new Map<Cue, { playing: number; lastStart: number }>();
  private track?: MusicState;
  private trackRequest = 0;

  /** Fetch and decode ahead of use; failures are logged once and the cue stays silent. */
  preload(urls: readonly string[]): void {
    for (const url of urls) void this.buffer(url);
  }

  play(cue: Cue, gain = 1, pan = 0): void {
    const graph = this.ensureGraph();
    const now = graph.context.currentTime;
    const state = this.activity.get(cue) ?? { playing: 0, lastStart: -Infinity };
    this.activity.set(cue, state);
    if (state.playing >= cue.voices || now - state.lastStart < cue.gap || gain <= 0) return;
    const buffer = this.buffers.get(cue.url);
    if (!buffer) { void this.buffer(cue.url); return; } // first request only loads it
    state.playing++;
    state.lastStart = now;
    void buffer.then((decoded) => {
      if (!decoded) { state.playing--; return; }
      const source = graph.context.createBufferSource();
      source.buffer = decoded;
      const volume = graph.context.createGain();
      volume.gain.value = cue.volume * gain;
      const panner = graph.context.createStereoPanner();
      panner.pan.value = Math.max(-1, Math.min(1, pan));
      source.connect(volume).connect(panner).connect(graph.sfx);
      source.onended = () => { state.playing--; source.disconnect(); };
      source.start();
    });
  }

  /**
   * A one-off processed cue, outside the voice limits: `rate` below 1 plays it deeper and longer;
   * `reverb` sends it through a generated hall whose tail is chopped into a stutter (`glitch`).
   */
  playProcessed(cue: Cue, { gain = 1, rate = 1, reverb = 0, glitch = false }: { gain?: number; rate?: number; reverb?: number; glitch?: boolean } = {}): void {
    const graph = this.ensureGraph(), ctx = graph.context;
    void this.buffer(cue.url).then((decoded) => {
      if (!decoded) return;
      const now = ctx.currentTime;
      const source = ctx.createBufferSource();
      source.buffer = decoded; source.playbackRate.value = rate;
      const dry = ctx.createGain(); dry.gain.value = cue.volume * gain;
      source.connect(dry).connect(graph.sfx);
      if (reverb > 0) {
        const convolver = ctx.createConvolver(); convolver.buffer = this.hall(ctx);
        const wet = ctx.createGain(); wet.gain.value = cue.volume * gain * reverb;
        source.connect(convolver).connect(wet).connect(graph.sfx);
        if (glitch) {
          // Gate the tail on and off in uneven steps, like a corrupted recording.
          let t = now + .35;
          while (t < now + 3.2) {
            const on = .04 + Math.random() * .12, off = .02 + Math.random() * .1;
            wet.gain.setValueAtTime(cue.volume * gain * reverb, t);
            wet.gain.setValueAtTime(0, t + on);
            t += on + off;
          }
          wet.gain.setValueAtTime(0, t);
        }
        setTimeout(() => { convolver.disconnect(); wet.disconnect(); }, 4500);
      }
      source.onended = () => { source.disconnect(); dry.disconnect(); };
      source.start();
    });
  }

  /** A sustained weapon sound. Cancellation also covers an in-flight decode. */
  loop(cue: Cue, fade = .06): () => void {
    const graph = this.ensureGraph();
    let stopped = false;
    let source: AudioBufferSourceNode | undefined;
    let volume: GainNode | undefined;
    void this.buffer(cue.url).then(decoded => {
      if (stopped || !decoded) return;
      source = graph.context.createBufferSource();
      source.buffer = decoded; source.loop = true;
      volume = graph.context.createGain();
      volume.gain.setValueAtTime(0, graph.context.currentTime);
      volume.gain.linearRampToValueAtTime(cue.volume, graph.context.currentTime + fade);
      source.connect(volume).connect(graph.sfx);
      const playing = source, gain = volume;
      source.onended = () => { playing.disconnect(); gain.disconnect(); };
      source.start();
    });
    return () => {
      if (stopped) return;
      stopped = true;
      if (!source || !volume) return;
      const now = graph.context.currentTime;
      volume.gain.cancelScheduledValues(now);
      volume.gain.setValueAtTime(volume.gain.value, now);
      volume.gain.linearRampToValueAtTime(0, now + fade);
      source.stop(now + fade);
    };
  }

  /**
   * Crossfade to a track. It loops unless `onEnd` is given, which then runs when it finishes.
   * Tracks are decoded on demand and not kept: a decoded song is tens of megabytes.
   */
  async playMusic(track: Track, onEnd?: () => void): Promise<void> {
    const graph = this.ensureGraph();
    if (this.track?.track === track) return;
    const request = ++this.trackRequest;
    const decoded = await this.buffer(track.url, false);
    if (!decoded || request !== this.trackRequest) return;
    this.stopMusic();
    const gain = graph.context.createGain();
    const now = graph.context.currentTime;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(track.volume, now + MUSIC_FADE);
    gain.connect(graph.music);
    this.track = { track, gain, buffer: decoded, loop: !onEnd, onEnd, source: null, startedAt: now, offset: 0 };
    this.startSource(this.track);
  }

  get musicPaused(): boolean {
    return !!this.track && !this.track.source;
  }

  /** How far through the current track, 0..1 (0 when nothing plays). */
  get musicProgress(): number {
    const state = this.track;
    if (!state || !this.graph) return 0;
    const duration = state.buffer.duration;
    const at = state.source ? this.graph.context.currentTime - state.startedAt : state.offset;
    return duration > 0 ? (((at % duration) + duration) % duration) / duration : 0;
  }

  /** Hold the current track where it is; resumeMusic continues from there. */
  pauseMusic(): void {
    const state = this.track;
    if (!state?.source || !this.graph) return;
    state.offset = this.musicProgress * state.buffer.duration;
    state.source.onended = null;
    state.source.stop();
    state.source.disconnect();
    state.source = null;
  }

  resumeMusic(): void {
    if (this.track && !this.track.source) this.startSource(this.track);
  }

  private startSource(state: MusicState): void {
    const { context } = this.ensureGraph();
    const source = context.createBufferSource();
    source.buffer = state.buffer;
    source.loop = state.loop;
    if (state.onEnd) {
      const onEnd = state.onEnd;
      source.onended = () => {
        if (this.track?.source !== source) return;
        this.track = undefined;
        onEnd();
      };
    }
    source.connect(state.gain);
    source.start(0, state.offset);
    state.source = source;
    state.startedAt = context.currentTime - state.offset;
  }

  stopMusic(): void {
    const current = this.track;
    this.track = undefined;
    if (!current?.source || !this.graph) return;
    current.source.onended = null;
    const now = this.graph.context.currentTime;
    current.gain.gain.cancelScheduledValues(now);
    current.gain.gain.setValueAtTime(current.gain.gain.value, now);
    current.gain.gain.linearRampToValueAtTime(0, now + MUSIC_FADE);
    current.source.stop(now + MUSIC_FADE);
  }

  private buffer(url: string, keep = true): Promise<AudioBuffer | null> {
    let pending = this.buffers.get(url);
    if (!pending) {
      const { context } = this.ensureGraph();
      pending = fetch(url)
        .then((response) => {
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          return response.arrayBuffer();
        })
        .then((data) => context.decodeAudioData(data))
        .catch((error: unknown) => {
          console.warn(`audio: could not load ${url}`, error);
          return null;
        });
      if (keep) this.buffers.set(url, pending);
    }
    return pending;
  }

  /** Build the hall reverb ahead of the first processed cue. */
  warmReverb(): void { this.hall(this.ensureGraph().context); }
  private hallImpulse?: AudioBuffer;
  /** A 3 s decaying noise impulse standing in for a large stone space; built once. */
  private hall(ctx: AudioContext): AudioBuffer {
    if (this.hallImpulse) return this.hallImpulse;
    const length = Math.floor(ctx.sampleRate * 3), impulse = ctx.createBuffer(2, length, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const data = impulse.getChannelData(c);
      for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 2.6;
    }
    return this.hallImpulse = impulse;
  }

  private ensureGraph(): Graph {
    if (this.graph) return this.graph;
    const context = new AudioContext();
    const music = context.createGain();
    const sfx = context.createGain();
    music.connect(context.destination);
    sfx.connect(context.destination);
    this.graph = { context, music, sfx };
    this.applySettings();
    window.addEventListener(AUDIO_SETTINGS_EVENT, () => this.applySettings());
    // Browsers start audio suspended until the page receives a gesture.
    const resume = () => {
      if (context.state !== 'suspended') return;
      void context.resume();
    };
    for (const type of ['pointerdown', 'keydown'] as const) window.addEventListener(type, resume, { capture: true });
    resume();
    return this.graph;
  }

  private applySettings(): void {
    if (!this.graph) return;
    const settings = loadAudioSettings(), now = this.graph.context.currentTime;
    this.graph.music.gain.setTargetAtTime(settings.musicVolume, now, 0.05);
    this.graph.sfx.gain.setTargetAtTime(settings.sfxVolume, now, 0.05);
  }
}

export const audioEngine = new AudioEngine();
