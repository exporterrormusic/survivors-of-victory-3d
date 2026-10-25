// The game frame is letterboxed between 16:9 and 21:9 (a portrait phone fills its screen), and
// sets --u to one 1080p pixel so the HUD scales with it. Shared by the survivor run and the MOBA.

const MIN_ASPECT = 16 / 9;
const MAX_ASPECT = 21 / 9;

/** Fit `frame` to the window now and on every resize; `onResize` runs after each fit. */
export function fitFrame(frame: HTMLElement, onResize: () => void): void {
  const layout = () => {
    const W = window.innerWidth, H = window.innerHeight;
    const portrait = W <= 900 && H > W;
    const aspect = portrait ? W / H : Math.min(MAX_ASPECT, Math.max(MIN_ASPECT, W / H));
    let w = W, h = Math.round(W / aspect);
    if (h > H) { h = H; w = Math.round(H * aspect); }
    Object.assign(frame.style, { width: `${w}px`, height: `${h}px`, left: `${(W - w) >> 1}px`, top: `${(H - h) >> 1}px` });
    frame.style.setProperty('--u', `${h / 1080}px`);
    onResize();
  };
  layout();
  window.addEventListener('resize', layout);
}
