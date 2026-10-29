import './communication-panel.css';

export interface BroadcastMedia {
  src: string;
  kind: 'image' | 'video';
  label?: string;
  fit?: 'cover' | 'contain';
  /** Videos start muted unless explicitly requested by a user gesture. */
  muted?: boolean;
}

/** Reusable HUD broadcast. Call update with actual world velocity each frame. */
export class CommunicationPanel {
  readonly element = document.createElement('aside');
  private readonly screen = document.createElement('div');
  private readonly media = document.createElement('div');
  private readonly status = document.createElement('span');
  private video: HTMLVideoElement | null = null;
  private animation: Animation | null = null;
  private opened = false;
  private disposed = false;
  private time = 0;
  private movement = 0;
  private drift = 0;
  private readonly reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

  constructor(parent: HTMLElement) {
    this.element.className = 'communication-panel';
    this.element.setAttribute('aria-label', 'Incoming communication');
    this.element.hidden = true;
    this.screen.className = 'communication-screen';
    this.media.className = 'communication-media';
    this.status.className = 'communication-status';
    this.status.setAttribute('role', 'status');
    const edge = document.createElement('div');
    edge.className = 'communication-edge';
    edge.setAttribute('aria-hidden', 'true');
    this.screen.append(this.media, this.status, edge);
    this.element.append(this.screen);
    parent.append(this.element);
  }

  show(source: BroadcastMedia): void {
    if (this.disposed) return;
    this.releaseMedia();
    this.opened = true;
    this.element.hidden = false;
    this.status.textContent = 'CONNECTING';
    const item = document.createElement(source.kind === 'video' ? 'video' : 'img');
    item.style.objectFit = source.fit ?? 'cover';
    const ready = () => { this.status.textContent = source.label ?? 'LIVE / COMMUNICATION'; };
    item.addEventListener('error', () => { this.status.textContent = 'SIGNAL LOST / CHECK MEDIA'; });
    if (item instanceof HTMLVideoElement) {
      this.video = item;
      item.muted = source.muted ?? true;
      item.loop = true;
      item.playsInline = true;
      item.addEventListener('loadeddata', ready);
      item.src = source.src;
      void item.play().catch(() => {
        if (this.video === item) this.status.textContent = 'PLAYBACK UNAVAILABLE / TRY MUTED VIDEO';
      });
    } else {
      item.alt = source.label ?? 'Incoming broadcast';
      item.addEventListener('load', ready);
      item.src = source.src;
    }
    this.media.replaceChildren(item);
    this.animate(true);
  }

  hide(): void {
    if (!this.opened || this.disposed) return;
    this.opened = false;
    this.video?.pause();
    this.animate(false);
  }

  private animate(open: boolean): void {
    this.animation?.cancel();
    const frames = [
      { transform: 'scale(.04, .008)', opacity: 0, filter: 'brightness(3)' },
      { transform: 'scale(1, .012)', opacity: 1, filter: 'brightness(3)', offset: .25 },
      { transform: 'scale(1, 1)', opacity: .5, filter: 'brightness(1.8)', offset: .65 },
      { transform: 'scale(1, 1)', opacity: 1, filter: 'brightness(1)' },
    ];
    const animation = this.screen.animate(frames, {
      duration: this.reducedMotion.matches ? 100 : open ? 520 : 320,
      direction: open ? 'normal' : 'reverse', easing: 'ease-out', fill: 'both',
    });
    this.animation = animation;
    animation.onfinish = () => {
      if (!open) { this.element.hidden = true; this.releaseMedia(); }
      animation.cancel();
      if (this.animation === animation) this.animation = null;
    };
  }

  update(dt: number, velocityX = 0, velocityZ = 0): void {
    if (this.element.hidden || this.disposed) return;
    dt = Math.max(0, Math.min(dt, .05));
    this.time += dt;
    const blend = 1 - Math.exp(-dt * 5);
    this.movement += (Math.min(1, Math.hypot(velocityX, velocityZ) / 5) - this.movement) * blend;
    this.drift += (Math.max(-1, Math.min(1, velocityX / 5)) - this.drift) * blend;
    const amplitude = this.reducedMotion.matches ? 0 : .35 + this.movement * 2;
    const x = Math.sin(this.time * 1.7) * amplitude - this.drift * amplitude;
    const y = Math.cos(this.time * 2.1) * amplitude;
    this.element.style.transform = `translate(${x}px, ${y}px) perspective(850px) rotateY(13deg) rotateZ(-1deg)`;
  }

  private releaseMedia(): void {
    if (this.video) {
      this.video.pause();
      this.video.removeAttribute('src');
      this.video.load();
      this.video = null;
    }
    this.media.replaceChildren();
  }

  dispose(): void {
    this.disposed = true;
    this.animation?.cancel();
    this.releaseMedia();
    this.element.remove();
  }
}
