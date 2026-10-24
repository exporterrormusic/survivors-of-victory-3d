// Closed, inset polygons keep the angled metal border intact at every HUD size.
// Artwork fills the sloped recess; labels and XP stay in the rectangular safe area.
type Point = readonly [number, number];
type FrameKind = 'blue' | 'red' | 'score';
const NS = 'http://www.w3.org/2000/svg';

/** Offset each edge inward, then intersect neighboring edges for a uniform rim. */
function insetPolygon(points: readonly Point[], distance: number): Point[] {
  const edges = points.map(([x, y], i) => {
    const [nx, ny] = points[(i + 1) % points.length];
    const dx = nx - x, dy = ny - y, length = Math.hypot(dx, dy);
    return { x: x - dy / length * distance, y: y + dx / length * distance, dx, dy };
  });
  return edges.map((edge, i) => {
    const previous = edges[(i + edges.length - 1) % edges.length];
    const determinant = previous.dx * edge.dy - previous.dy * edge.dx;
    const t = ((edge.x - previous.x) * edge.dy - (edge.y - previous.y) * edge.dx) / determinant;
    return [previous.x + previous.dx * t, previous.y + previous.dy * t];
  });
}

const path = (points: readonly Point[]): string =>
  points.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`).join(' ') + 'Z';

function mountFrame(host: HTMLElement, kind: FrameKind): void {
  const content = document.createElement('div');
  content.className = 'hud-top-content';
  content.append(...host.childNodes);
  host.append(content);
  const svg = document.createElementNS(NS, 'svg');
  svg.classList.add('hud-top-frame');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const id = `hud-frame-${kind}`;
  const accent = kind === 'red' ? '#ff7d96' : '#65dcff';
  svg.innerHTML = `<defs>
    <linearGradient id="${id}-metal" x2="0" y2="1">
      <stop stop-color="#f3faff"/><stop offset=".24" stop-color="#b6d0e7"/>
      <stop offset=".54" stop-color="#5f7b9e"/><stop offset=".82" stop-color="#9bb7d0"/>
      <stop offset="1" stop-color="#d7e9f7"/>
    </linearGradient>
    <linearGradient id="${id}-panel" x2="0" y2="1">
      <stop stop-color="#263f5c"/><stop offset=".42" stop-color="#182b42"/>
      <stop offset="1" stop-color="#0c192c"/>
    </linearGradient>
  </defs>
  <path class="frame-outer" fill="url(#${id}-metal)" stroke="#d9ebfa" stroke-width="1"/>
  <path class="frame-recess" fill="#081224"/>
  <path class="frame-inner" fill="url(#${id}-panel)" stroke="#6f95b8" stroke-width="1"/>
  <path class="frame-accent" fill="none" stroke="${accent}" stroke-width="1.5" opacity=".9"/>`;
  host.prepend(svg);
  const outer = svg.querySelector('.frame-outer')!;
  const recess = svg.querySelector('.frame-recess')!;
  const inner = svg.querySelector('.frame-inner')!;
  const line = svg.querySelector('.frame-accent')!;
  const draw = () => {
    const { width, height } = host.getBoundingClientRect();
    if (width < 12 || height < 12) return;
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    const cap = height * (kind === 'score' ? .2 : .12);
    const edge = 1;
    const points: Point[] = [
      [edge, edge], [width - edge, edge],
      [width - edge - (kind === 'blue' ? 0 : cap), height - edge],
      [edge + (kind === 'red' ? 0 : cap), height - edge],
    ];
    const rim = height < 48 ? 2.5 : 4;
    const inside = insetPolygon(points, rim + 1.5);
    outer.setAttribute('d', path(points));
    recess.setAttribute('d', path(insetPolygon(points, rim)));
    inner.setAttribute('d', path(inside));
    // Clip just the fills/art to the same inset geometry, leaving the rim intact.
    content.style.clipPath = `polygon(${insetPolygon(points, rim + 2).map(([x, y]) => `${x}px ${y}px`).join(',')})`;
    if (kind !== 'score') {
      const slots = [...content.querySelectorAll<HTMLElement>('.slot')];
      const visible = slots.filter(slot => getComputedStyle(slot).display !== 'none');
      const end = kind === 'blue' ? visible[0] : visible.at(-1);
      for (const slot of slots) slot.classList.toggle('outer-slot', slot === end);
    }
    const [right, left] = [inside[2], inside[3]];
    line.setAttribute('d', `M${left[0]},${left[1] + 2}L${right[0]},${right[1] + 2}`);
  };
  draw();
  // These three persistent HUD nodes live for the match page's lifetime.
  new ResizeObserver(draw).observe(host);
}

export function mountTopFrames(): void {
  for (const kind of ['blue', 'red', 'score'] as const) {
    const selector = kind === 'score' ? '#topbar .score' : `#topbar .team.${kind}`;
    mountFrame(document.querySelector<HTMLElement>(selector)!, kind);
  }
}
