// The approved mockup uses a continuous fine outline with two clipped corners, not square
// panels with oversized bracket caps. Draw at the actual button size so the cuts stay 45°.
const NS = 'http://www.w3.org/2000/svg';
let frameId = 0;

export function mountHudFrame(host: HTMLElement, kind: 'card' | 'burst' | 'key' = 'card'): void {
  const svg = document.createElementNS(NS, 'svg');
  svg.classList.add('run-card-frame');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const path = (name: string) => {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('class', name);
    svg.append(p);
    return p;
  };
  const surface = path('rf-surface');
  const wash = kind === 'card' ? path('rf-wash') : null;
  if (wash) {
    const defs = document.createElementNS(NS, 'defs');
    const gradient = document.createElementNS(NS, 'linearGradient');
    const id = `run-card-wash-${++frameId}`;
    gradient.id = id;
    gradient.setAttribute('x2', '0');
    gradient.setAttribute('y2', '1');
    for (const [offset, opacity] of [['0', '.08'], ['1', '0']]) {
      const stop = document.createElementNS(NS, 'stop');
      stop.setAttribute('offset', offset);
      stop.setAttribute('stop-color', '#a2b0ac');
      stop.setAttribute('stop-opacity', opacity);
      gradient.append(stop);
    }
    defs.append(gradient);
    svg.prepend(defs);
    wash.setAttribute('fill', `url(#${id})`);
  }
  const inset = path('rf-inset');
  const corners = path('rf-corners');
  const accents = kind === 'burst' ? path('rf-accents') : null;
  const divider = kind === 'burst' ? path('rf-divider') : null;
  host.prepend(svg);

  const draw = () => {
    const { width: w, height: h } = host.getBoundingClientRect();
    if (w <= 0 || h <= 0) return;
    const k = h / (kind === 'key' ? 35 : 126);
    const topCut = (kind === 'key' ? 5 : kind === 'burst' ? 24 : 15) * k;
    const bottomCut = (kind === 'key' ? 5 : kind === 'burst' ? 24 : 20) * k;
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    const outline = (n: number) => kind === 'key'
      ? `M${topCut + n} ${n}H${w - topCut - n}L${w - n} ${topCut + n}V${h - topCut - n}L${w - topCut - n} ${h - n}H${topCut + n}L${n} ${h - topCut - n}V${topCut + n}Z`
      : `M${topCut + n} ${n}H${w - n}V${h - bottomCut - n}L${w - bottomCut - n} ${h - n}H${n}V${topCut + n}Z`;
    surface.setAttribute('d', outline(.75));
    wash?.setAttribute('d', outline(1.5));
    inset.setAttribute('d', outline(3));
    const c = 12 * k, small = 9 * k, n = 2 * k;
    // Short, isolated L marks at the cut corners; they must not join the diagonal
    // outline into triangles. The uncut corners have longer reinforced edges.
    corners.setAttribute('d', kind === 'key' ? '' : kind === 'burst'
      ? `M${w - 13*k} ${n}H${w - n}V${13*k} M${w - 13*k} ${6*k}H${w - 6*k}V${13*k}`
      : `M${small} ${n}H${n}V${small} M${w - c} ${n}H${w - n}V${c} ` +
        `M${n} ${h - c}V${h - n}H${c} M${w - small} ${h - n}H${w - n}V${h - small}`);
    if (accents && divider) {
      // Reference-specific details: a tiny upper pennant, one diagonal slash,
      // the lower-left index tab and a broad lower-right slash with an inset heel.
      accents.setAttribute('d', [
        `M${2*k} ${2*k}L${9*k} ${5*k}L${2*k} ${10*k}Z`,
        `M${k} ${15*k}L${15*k} ${k}H${22*k}L${k} ${22*k}Z`,
        `M${5*k} ${h-12*k}L${9*k} ${h-11*k}L${13*k} ${h-13*k}L${11*k} ${h-5*k}L${5*k} ${h-4*k}Z`,
        `M${w-24*k} ${h-k}L${w-k} ${h-24*k}V${h-15*k}L${w-15*k} ${h-k}Z`,
        `M${w-11*k} ${h-k}H${w-k}V${h-11*k}L${w-5*k} ${h-8*k}V${h-5*k}H${w-8*k}Z`,
      ].join(' '));
      divider.setAttribute('d', `M1.5 ${h - 33 * k}H${w - 1.5}`);
    }
  };
  draw();
  // These framed controls persist for the lifetime of a run, just like the HUD canvases.
  new ResizeObserver(draw).observe(host);
}

/** Non-interactive panel trim, traced separately from the ability-card treatment. */
export function mountPanelTrim(host: HTMLElement, kind: 'objective' | 'portrait' | 'radar'): void {
  const svg = document.createElementNS(NS, 'svg');
  svg.classList.add('run-panel-trim', `trim-${kind}`);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const paths = ['rp-outline', 'rp-inset', 'rp-corners', 'rp-etch'].map(name => {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('class', name);
    svg.append(p);
    return p;
  });
  host.prepend(svg);
  const draw = () => {
    const { width: w, height: h } = host.getBoundingClientRect();
    if (w <= 0 || h <= 0) return;
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    const k = kind === 'objective'
      ? (host.querySelector('.ro-mark')?.getBoundingClientRect().width ?? w*17/336) / 17
      : w / (kind === 'portrait' ? 220 : 204);
    const [outline, inset, corners, etch] = paths;
    if (kind === 'objective') {
      const heading = host.querySelector('b')!.getBoundingClientRect();
      const bounds = host.getBoundingClientRect();
      const ledge = heading.bottom - bounds.top + 3*k, step = heading.left - bounds.left;
      outline.setAttribute('d', `M${w*.792} .75H.75V${h-.75}H${step-5*k}L${step} ${ledge}H${w-.75}`);
      inset.setAttribute('d', `M${step+k} ${ledge}H${w-.75}v${-k}`);
      corners.setAttribute('d', `M${10*k} .75H.75V${10*k} M.75 ${h-9*k}V${h-.75}H${10*k} M${4*k} ${h-6*k}V${h-4*k}H${6*k}`);
      const end = w*.792;
      etch.setAttribute('d', `M${end-14*k} ${3*k}h${6*k}m${2*k} 0h${3*k}m${4*k} 0h${2*k} M${end-11*k} ${6*k}l${2*k} ${-k}m${3*k} ${2*k}l${2*k} ${-2*k}m${4*k} 0l${2*k} ${-2*k}`);
    } else {
      if (kind === 'portrait') {
        host.style.setProperty('--portrait-edge', `${20*k}px`);
      }
      const rect = (n: number) => kind === 'portrait'
        ? `M${20*k+n} ${n}H${w-n}V${h-n}H${n}V${20*k+n}Z`
        : `M${n} ${n}H${w-n}V${h-n}H${n}Z`;
      outline.setAttribute('d', rect(.75));
      inset.setAttribute('d', rect(3*k));
      const n = 5*k, c = 14*k;
      corners.setAttribute('d', kind === 'portrait'
        ? `M${10*k} ${2*k}H${2*k}V${10*k} M${5*k} ${5*k}h${2*k}`
        : `M${w-c} ${n}H${w-n}V${c} M${n} ${h-c}V${h-n}H${c} M${w-c} ${h-n}H${w-n}V${h-c}`);
    }
  };
  draw();
  new ResizeObserver(draw).observe(host);
}
