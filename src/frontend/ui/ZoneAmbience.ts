// Moving weather over a zone's preview art (Multiplayer lobby backdrop): the zone's own mood in
// 2D particles. Embers, ash and heat on the Caldera; petals on day Sakura, fireflies at night;
// snow on the Frozen North; rain and lightning in the Stormbringer; fog in the Haunted Pine
// Forest. Textures are drawn once on canvases, so no assets are needed.

import Phaser from "phaser";
import { bleed } from "../rendering/DisplayQualityPlugin";

const WIDTH = 1920;
const HEIGHT = 1080;

type Look = "caldera" | "petals" | "fireflies" | "snow" | "storm" | "fog" | "dust";

function lookOf(zoneId: string): Look {
  if (zoneId.startsWith("volcano")) return "caldera";
  if (zoneId === "sakura_night") return "fireflies";
  if (zoneId.startsWith("sakura")) return "petals";
  if (zoneId.startsWith("snow")) return "snow";
  if (zoneId === "storm") return "storm";
  if (zoneId.includes("forest")) return "fog";
  return "dust";
}

export class ZoneAmbience {
  private readonly scene: Phaser.Scene;
  private readonly depth: number;
  private readonly parts: Phaser.GameObjects.GameObject[] = [];
  private readonly timers: Phaser.Time.TimerEvent[] = [];
  /** extra cleanups (update listeners) */
  private readonly stops: (() => void)[] = [];
  private zoneId = "";
  /** the preview art, for the Caldera's heat distortion */
  private readonly background: Phaser.GameObjects.Image | null;
  private heat: { filter: Phaser.Filters.Displacement; texture: Phaser.Textures.CanvasTexture; phase: number; last: number } | null = null;
  private readonly onUpdate = (): void => this.updateHeat();

  constructor(scene: Phaser.Scene, depth: number, background: Phaser.GameObjects.Image | null = null) {
    this.scene = scene;
    this.depth = depth;
    this.background = background;
    this.makeTextures();
  }

  /** Switch to a zone's weather (no-op if it's already showing). */
  set(zoneId: string): void {
    if (zoneId === this.zoneId) return;
    this.zoneId = zoneId;
    this.clear();
    const look = lookOf(zoneId);
    const night = zoneId.endsWith("night");
    if (look === "caldera") this.caldera();
    else if (look === "petals") this.petals(1);
    else if (look === "fireflies") { this.fireflies(0xfff2a8, 140, 1.5); this.petals(0.25); }
    else if (look === "snow") this.snow(night);
    else if (look === "storm") this.storm();
    else if (look === "fog") { this.fog(); this.fireflies(0xb8ffcf, 14, 1); }
    else this.dust();
  }

  destroy(): void { this.clear(); }

  private clear(): void {
    if (this.heat) {
      const filters = this.background?.filters?.internal;
      if (filters?.list.includes(this.heat.filter)) filters.remove(this.heat.filter, true);
      this.scene.events.off(Phaser.Scenes.Events.UPDATE, this.onUpdate);
      this.heat = null;
    }
    for (const part of this.parts) part.destroy();
    for (const timer of this.timers) timer.remove();
    for (const stop of this.stops) stop();
    this.parts.length = this.timers.length = this.stops.length = 0;
  }

  private emit(texture: string, config: Phaser.Types.GameObjects.Particles.ParticleEmitterConfig, prewarm = 0): Phaser.GameObjects.Particles.ParticleEmitter {
    const emitter = this.scene.add.particles(0, 0, texture, config).setDepth(this.depth);
    // Start mid-weather rather than with an empty sky.
    if (prewarm > 0) emitter.fastForward(prewarm);
    this.parts.push(emitter);
    return emitter;
  }

  private caldera(): void {
    // A low glow that breathes, like the lava below the frame.
    const glow = this.scene.add.image(WIDTH / 2, HEIGHT, "amb-glow").setOrigin(0.5, 1).setDisplaySize(bleed.width * 1.4, 520)
      .setTint(0xff5a1e).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.18).setDepth(this.depth);
    this.scene.tweens.add({ targets: glow, alpha: 0.32, duration: 2600, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
    this.parts.push(glow);
    this.startHeat();
    // Embers: bright sparks that rise and sway.
    this.emit("amb-dot", {
      x: { min: bleed.left - 100, max: bleed.right + 100 }, y: { min: HEIGHT * 0.55, max: HEIGHT + 20 }, lifespan: { min: 7000, max: 12000 }, frequency: 14,
      speedY: { min: -105, max: -40 }, speedX: { min: -20, max: 32 }, accelerationX: { min: -10, max: 10 },
      scale: { start: 0.42, end: 0.08 }, tint: [0xffd27a, 0xff8a2a, 0xff5a1e], blendMode: Phaser.BlendModes.ADD,
      alpha: { values: [0, 0.95, 0.95, 0.8, 0], interpolation: "linear" },
    }, 6000);
    // Ash: grey flakes falling slowly.
    this.emit("amb-dot", {
      x: { min: bleed.left, max: bleed.right }, y: -20, lifespan: 12000, frequency: 120,
      speedY: { min: 30, max: 70 }, speedX: { min: 10, max: 40 }, scale: { min: 0.25, max: 0.5 }, tint: 0x8d8a88,
      alpha: { values: [0, 0.5, 0.5, 0], interpolation: "linear" },
    }, 10000);
  }

  /** Heat haze: the art itself ripples, strongest near the ground, the waves rising. */
  private startHeat(): void {
    const filters = this.background?.enableFilters().filters?.internal;
    if (!filters) return;
    const key = "amb-heat";
    if (this.scene.textures.exists(key)) this.scene.textures.remove(key);
    const texture = this.scene.textures.createCanvas(key, 96, 54);
    if (!texture) return;
    this.heat = { filter: filters.addDisplacement(key, 0.006, 0.004), texture, phase: 0, last: 0 };
    this.scene.events.on(Phaser.Scenes.Events.UPDATE, this.onUpdate);
    this.updateHeat(true);
  }

  private updateHeat(force = false): void {
    const heat = this.heat;
    if (!heat) return;
    const now = this.scene.time.now;
    if (!force && now - heat.last < 40) return;
    heat.phase += (now - (heat.last || now)) / 1000;
    heat.last = now;
    const { width, height } = heat.texture;
    const context = heat.texture.getContext();
    const image = context.createImageData(width, height);
    const t = heat.phase;
    for (let y = 0; y < height; y++) {
      // Calm sky, shimmering ground.
      const strength = Math.max(0, (y / height - 0.35) / 0.65);
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        const wave = Math.sin(y * 0.9 + t * 5.5 + Math.sin(x * 0.21 + t) * 1.6) * 70 + Math.sin(x * 0.35 - t * 2.3 + y * 0.4) * 35;
        image.data[i] = 128 + wave * strength;
        image.data[i + 1] = 128 + Math.sin(x * 0.3 + y * 0.7 + t * 4) * 60 * strength;
        image.data[i + 2] = 128;
        image.data[i + 3] = 255;
      }
    }
    context.putImageData(image, 0, 0);
    heat.texture.refresh();
  }

  private petals(amount: number): void {
    this.emit("amb-petal", {
      x: { min: bleed.left - 200, max: bleed.right }, y: -30, lifespan: { min: 9000, max: 14000 }, frequency: 140 / amount,
      speedY: { min: 50, max: 110 }, speedX: { min: 40, max: 110 }, accelerationX: { min: -14, max: 14 },
      rotate: { start: 0, end: 540 }, scale: { min: 0.55, max: 1 }, tint: [0xffd6e4, 0xffb8cf, 0xfff0f5],
      alpha: { values: [0, 0.9, 0.9, 0.9, 0], interpolation: "linear" },
    }, 12000);
  }

  /** `count`: about how many are alive at once; `size` scales them. */
  private fireflies(tint: number, count: number, size: number): void {
    this.emit("amb-glow", {
      x: { min: bleed.left, max: bleed.right }, y: { min: HEIGHT * 0.3, max: HEIGHT }, lifespan: { min: 5000, max: 9000 },
      frequency: 7000 / count, speedX: { min: -14, max: 14 }, speedY: { min: -16, max: 8 },
      accelerationX: { min: -6, max: 6 }, accelerationY: { min: -6, max: 6 }, scale: { min: 0.12 * size, max: 0.22 * size }, tint,
      blendMode: Phaser.BlendModes.ADD, alpha: { values: [0, 0.35, 0.9, 0.5, 0.85, 0], interpolation: "catmull" },
    }, 8000);
  }

  private snow(night: boolean): void {
    this.emit("amb-dot", {
      x: { min: bleed.left - 200, max: bleed.right }, y: -20, lifespan: { min: 9000, max: 15000 }, frequency: night ? 40 : 28,
      speedY: { min: 50, max: 120 }, speedX: { min: 15, max: 55 }, accelerationX: { min: -8, max: 8 },
      scale: { min: 0.2, max: 0.75 }, tint: night ? 0xcfe2ff : 0xffffff,
      alpha: night ? { values: [0, 0.7, 0.7, 0.7, 0], interpolation: "linear" } : { values: [0, 0.9, 0.9, 0.9, 0], interpolation: "linear" },
    }, 13000);
  }

  private storm(): void {
    this.emit("amb-streak", {
      x: { min: bleed.left - 300, max: bleed.right + 100 }, y: -60, lifespan: 1100, frequency: 6, quantity: 2,
      speedY: { min: 1250, max: 1500 }, speedX: { min: 260, max: 320 }, rotate: -12, scaleY: { min: 0.6, max: 1.2 },
      tint: 0xb8cce0, alpha: { min: 0.25, max: 0.5 },
    }, 1200);
    const flash = this.scene.add.rectangle(bleed.left, 0, bleed.width, HEIGHT, 0xdde8ff, 0).setOrigin(0).setDepth(this.depth)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.parts.push(flash);
    const strike = (): void => {
      // A double flicker, then quiet for a few seconds.
      this.scene.tweens.chain({ targets: flash, tweens: [
        { alpha: 0.32, duration: 60 }, { alpha: 0.05, duration: 90 }, { alpha: 0.22, duration: 50 }, { alpha: 0, duration: 420 },
      ] });
      this.timers.push(this.scene.time.delayedCall(Phaser.Math.Between(3500, 8500), strike));
    };
    this.timers.push(this.scene.time.delayedCall(1800, strike));
  }

  /** Fog: lumpy banks of mixed size, height and thickness drifting across, each thickening and
   *  thinning on its own, so the shapes keep changing. Low ones are heavier and faster (nearer). */
  private fog(): void {
    const banks: { image: Phaser.GameObjects.Image; speed: number }[] = [];
    for (let i = 0; i < 26; i++) {
      const depth = Math.random(); // 0 far / high, 1 near / low
      const y = HEIGHT * (0.3 + depth * 0.75) + Phaser.Math.Between(-40, 40);
      const width = Phaser.Math.Between(1400, 2200) * (0.8 + depth * 0.6);
      const image = this.scene.add.image(Phaser.Math.Between(bleed.left - 1200, bleed.right + 600), y, `amb-cloud-${i % 3}`)
        .setDisplaySize(width, Phaser.Math.Between(320, 480) * (0.8 + depth * 0.5)).setFlipX(Math.random() < 0.5)
        .setTint(0xcfd9de).setDepth(this.depth);
      this.parts.push(image);
      banks.push({ image, speed: (45 + depth * 95) * Phaser.Math.FloatBetween(0.8, 1.2) });
      const peak = (0.1 + depth * 0.12) * Phaser.Math.FloatBetween(0.9, 1.1);
      // Already mid-cycle on arrival (no fade-in from nothing): a random point between thin and thick.
      const thin = peak * 0.85, thick = Math.min(1, peak), start = Phaser.Math.FloatBetween(thin, thick);
      image.setAlpha(start);
      const thicken = Math.random() < 0.5;
      this.scene.tweens.add({ targets: image, alpha: thicken ? thick : thin, duration: Phaser.Math.Between(5000, 12000),
        yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
    }
    const drift = (_time: number, delta: number): void => {
      for (const { image, speed } of banks) {
        image.x += speed * delta / 1000;
        if (image.x - image.displayWidth / 2 > bleed.right) image.x = bleed.left - image.displayWidth / 2;
      }
    };
    this.scene.events.on(Phaser.Scenes.Events.UPDATE, drift);
    this.stops.push(() => this.scene.events.off(Phaser.Scenes.Events.UPDATE, drift));
  }

  private dust(): void {
    this.emit("amb-dot", {
      x: { min: bleed.left, max: bleed.right }, y: { min: 0, max: HEIGHT }, lifespan: 9000, frequency: 160,
      speedX: { min: -10, max: 14 }, speedY: { min: -12, max: 6 }, scale: { min: 0.15, max: 0.35 }, tint: 0xf2e6c8,
      alpha: { values: [0, 0.4, 0], interpolation: "catmull" },
    }, 9000);
  }

  private makeTextures(): void {
    const textures = this.scene.textures;
    const canvas = (key: string, w: number, h: number, draw: (c: CanvasRenderingContext2D) => void): void => {
      if (textures.exists(key)) return;
      const texture = textures.createCanvas(key, w, h);
      if (!texture) return;
      draw(texture.getContext());
      texture.refresh();
    };
    const radial = (c: CanvasRenderingContext2D, r: number, stops: [number, string][]): void => {
      const g = c.createRadialGradient(r, r, 0, r, r, r);
      for (const [at, color] of stops) g.addColorStop(at, color);
      c.fillStyle = g; c.fillRect(0, 0, r * 2, r * 2);
    };
    canvas("amb-dot", 16, 16, (c) => radial(c, 8, [[0, "#fff"], [0.5, "rgba(255,255,255,.85)"], [1, "rgba(255,255,255,0)"]]));
    canvas("amb-glow", 128, 128, (c) => radial(c, 64, [[0, "rgba(255,255,255,1)"], [0.4, "rgba(255,255,255,.45)"], [1, "rgba(255,255,255,0)"]]));
    // Fog layers: smooth sheets. Soft top and bottom, faded ends, and only a slow, wide swell in
    // density along the length (no blobs, so no clumps).
    for (let v = 0; v < 3; v++) {
      canvas(`amb-cloud-${v}`, 512, 64, (c) => {
        const image = c.createImageData(512, 64), phase = v * 2.1;
        for (let x = 0; x < 512; x++) {
          const ends = Math.min(1, Math.min(x, 511 - x) / 150);
          const swell = 0.92 + 0.08 * Math.sin(x / 512 * Math.PI * 2 + phase) * Math.sin(x / 512 * Math.PI * 3.3 + phase * 1.7);
          for (let y = 0; y < 64; y++) {
            const across = (y - 32) / 32, i = (y * 512 + x) * 4;
            image.data[i] = image.data[i + 1] = image.data[i + 2] = 255;
            image.data[i + 3] = 255 * Math.exp(-across * across * 1.6) * ends * ends * (3 - 2 * ends) * swell;
          }
        }
        c.putImageData(image, 0, 0);
      });
    }
    canvas("amb-petal", 20, 14, (c) => {
      c.fillStyle = "#fff";
      c.beginPath(); c.ellipse(10, 7, 9, 5, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = "rgba(255,170,200,.55)";
      c.beginPath(); c.ellipse(13, 7, 4, 3, 0, 0, Math.PI * 2); c.fill();
    });
    canvas("amb-streak", 3, 48, (c) => {
      const g = c.createLinearGradient(0, 0, 0, 48);
      g.addColorStop(0, "rgba(255,255,255,0)"); g.addColorStop(1, "rgba(255,255,255,1)");
      c.fillStyle = g; c.fillRect(0, 0, 3, 48);
    });
  }
}
