// Preserve the fully covered menu frame across the Phaser → Babylon handoff.
// This module has no renderer dependency, so the level can signal readiness too.
let cover: HTMLDivElement | undefined;
let stopTracking: (() => void) | undefined;

export function holdLevelTransition(source: HTMLCanvasElement): void {
  cancelLevelTransition();
  const overlay = document.createElement('div');
  overlay.id = 'level-transition';
  overlay.setAttribute('aria-label', 'Loading level');
  overlay.style.cssText = 'position:fixed;z-index:2147483647;overflow:hidden;background:#f4f6f8;pointer-events:auto';
  // Lock the wipe to the departing canvas's aspect ratio. Never follow the next
  // renderer's temporary, unlaid-out canvas/frame bounds during initialization.
  const aspect = source.width / source.height || 16 / 9;
  const syncBounds = () => {
    const width = Math.min(window.innerWidth, window.innerHeight * aspect);
    const height = width / aspect;
    Object.assign(overlay.style, {
      left: `${(window.innerWidth - width) / 2}px`, top: `${(window.innerHeight - height) / 2}px`,
      width: `${width}px`, height: `${height}px`,
    });
  };
  window.addEventListener('resize', syncBounds);
  stopTracking = () => window.removeEventListener('resize', syncBounds);
  syncBounds();
  const snapshot = document.createElement('canvas');
  snapshot.width = source.width;
  snapshot.height = source.height;
  snapshot.getContext('2d')!.drawImage(source, 0, 0);
  snapshot.style.cssText = 'position:absolute;width:100%;height:100%;object-fit:contain';
  overlay.append(snapshot);
  // Siege replaces the body while booting; keep the handoff outside it.
  document.documentElement.append(overlay);
  cover = overlay;
}

export async function revealLevelTransition(): Promise<void> {
  const overlay = cover;
  if (!overlay) return;
  const cleanup = stopTracking;
  stopTracking = undefined;
  cover = undefined;
  // Match the menu transition's eight staggered, alternating reveal strips.
  const slices = Array.from({ length: 8 }, (_, index) => {
    const slice = document.createElement('div');
    slice.style.cssText = `position:absolute;left:0;right:0;top:${index * 12.5}%;height:calc(12.5% + 1px);background:#f4f6f8;border-top:1px solid #d2d8de;box-sizing:border-box`;
    overlay.prepend(slice);
    return slice;
  });
  overlay.style.background = 'transparent';
  const snapshot = overlay.querySelector('canvas')!;
  const motif = snapshot.animate([{ opacity: 1 }, { opacity: 0 }], {
    delay: 470, duration: 170, fill: 'forwards', easing: 'ease-in',
  });
  try { await Promise.all([motif.finished, ...slices.map((slice, index) => slice.animate([
    { transform: 'translateX(0)' },
    { transform: `translateX(${index % 2 === 0 ? -117 : 117}%)` },
  ], { delay: 560 + index * 22, duration: 360, fill: 'forwards', easing: 'ease-in-out' }).finished)]); }
  finally { cleanup?.(); overlay.remove(); }
}

export function cancelLevelTransition(): void {
  stopTracking?.();
  stopTracking = undefined;
  cover?.remove();
  cover = undefined;
}

