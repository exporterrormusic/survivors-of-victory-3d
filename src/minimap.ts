// Tactical minimap: top-down arena with lane, pillars and team bases, unit dots, the hero's
// face icon, and the camera's view outline. main.ts wires the clicks: left-click/drag moves
// the camera, right-click orders a move.

import { Vector3 } from '@babylonjs/core';
import type { Dummy } from './combat';
import { ARENA, BLUE_BASE, RED_BASE, type World } from './world';
import { LANES, JUNGLE_PATHS, MAP_BOUNDARY, COMPOUNDS } from './battleground';
import type { Structure } from './structures';

const EXTENT = ARENA + 6; // world units from centre to minimap edge

export class Minimap {
  private readonly ctx: CanvasRenderingContext2D;
  private bg: HTMLCanvasElement | null = null;
  private icon: HTMLImageElement | null = null;
  private pixelRatio = 1;
  private terrain: HTMLImageElement | null = null;

  constructor(private readonly canvas: HTMLCanvasElement, private readonly world: World) {
    this.ctx = canvas.getContext('2d')!;
    const terrain = new Image();
    terrain.onload = () => { this.terrain = terrain; this.bg = null; };
    terrain.src = `${import.meta.env.BASE_URL}environment/paintover-v1/woodland.webp`;
  }

  setIcon(url: string | null): void {
    if (!url) {
      this.icon = null;
      return;
    }
    const img = new Image();
    img.onload = () => (this.icon = img);
    img.src = url;
  }

  /** Match the canvas resolution to its CSS size. */
  resize(): void {
    const r = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.max(1, Math.round(r.width * dpr));
    this.canvas.height = Math.max(1, Math.round(r.height * dpr));
    this.pixelRatio = this.canvas.width / Math.max(1, r.width);
    // Attach the music strip to the painted frame, inside the canvas's transparent margin.
    const margin = (EXTENT - ARENA - 2) / (EXTENT * 2);
    const x = this.canvas.width * margin;
    const y = this.canvas.height * margin;
    const rim = Math.min(x, y, Math.max(2.5 * this.pixelRatio, this.canvas.width / 95));
    this.canvas.parentElement?.style.setProperty('--map-rim-x', `${(x - rim) / this.pixelRatio}px`);
    this.canvas.parentElement?.style.setProperty('--map-rim-y', `${(y - rim) / this.pixelRatio}px`);
    this.bg = null;
  }

  /** Client (CSS pixel) coordinates to a ground point. */
  toWorld(clientX: number, clientY: number): Vector3 {
    const r = this.canvas.getBoundingClientRect();
    const u = (clientX - r.left) / r.width;
    const v = (clientY - r.top) / r.height;
    const clamp = (n: number) => Math.max(-ARENA, Math.min(ARENA, n));
    return new Vector3(clamp((u * 2 - 1) * EXTENT), 0, clamp((1 - v * 2) * EXTENT));
  }

  draw(hero: Vector3, heroAlive: boolean, dummies: readonly Dummy[], view: readonly Vector3[], structures: readonly Structure[] = []): void {
    const { ctx, canvas } = this;
    if (!this.bg) this.bg = this.paintBackground();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(this.bg, 0, 0);
    const s = canvas.width / 300; // drawing sizes are in 300 px minimap units

    for (const d of dummies) {
      if (!d.alive) continue;
      const [x, y] = this.toMap(d.position);
      ctx.fillStyle = d.team === 'blue' ? '#74cdf4' : '#ff8068';
      ctx.strokeStyle = '#24282a';
      ctx.lineWidth = 1.5 * s;
      ctx.beginPath();
      ctx.arc(x, y, 2.7 * s, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    for (const structure of structures) {
      const kind=structure.site.kind;
      const [x,y]=this.toMap(structure.position), r=(kind==='core'?6:kind==='tower'?2.4:kind==='gate'?2:4)*s;
      const color=!structure.alive?'#63717a':structure.team==='blue'?'#72d7ff':'#ff8272';
      ctx.fillStyle=structure.shielded?'#283543':color;ctx.strokeStyle=color;ctx.lineWidth=1.5*s;
      if(kind==='gate'){ctx.beginPath();ctx.moveTo(x-2*s,y);ctx.lineTo(x+2*s,y);ctx.stroke();continue;}
      if(kind==='core'||kind==='keep')keep(ctx,x,y,r);
      else if(kind==='fort'){ctx.beginPath();ctx.moveTo(x,y-r*1.3);ctx.lineTo(x+r,y);ctx.lineTo(x,y+r*1.3);ctx.lineTo(x-r,y);ctx.closePath();ctx.fill();ctx.stroke();}
      else {ctx.beginPath();ctx.rect(x-r,y-r,r*2,r*2);ctx.fill();ctx.stroke();}
      if(!structure.alive){ctx.beginPath();ctx.moveTo(x-r,y-r);ctx.lineTo(x+r,y+r);ctx.moveTo(x+r,y-r);ctx.lineTo(x-r,y+r);ctx.stroke();}
      else if(structure.hp<structure.maxHp){ctx.fillStyle='#050b13';ctx.fillRect(x-r-1,y+r+2,r*2+2,3*s);ctx.fillStyle=color;ctx.fillRect(x-r,y+r+2,r*2*structure.hp/structure.maxHp,2*s);}
    }

    if (view.length === 4) {
      ctx.save();
      battlegroundOutline(ctx, canvas.width, canvas.height);
      ctx.clip();
      ctx.strokeStyle = 'rgba(237,243,243,0.7)';
      ctx.lineWidth = 1 * s;
      ctx.beginPath();
      view.forEach((p, i) => {
        const [x, y] = this.toMap(p);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
    }

    if (heroAlive) {
      const [x, y] = this.toMap(hero);
      const r = 11 * s;
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.clip();
      if (this.icon) ctx.drawImage(this.icon, x - r, y - r, r * 2, r * 2);
      else {
        ctx.fillStyle = '#a3e8eb';
        ctx.fill();
      }
      ctx.restore();
      ctx.strokeStyle = '#b6f2f4';
      ctx.lineWidth = 2 * s;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Keep the complete metal rim above terrain and the camera outline.
    paintFrame(ctx, canvas.width, canvas.height, this.pixelRatio);
  }

  private toMap(p: Vector3): [number, number] {
    const { width, height } = this.canvas;
    return [((p.x / EXTENT + 1) / 2) * width, ((1 - p.z / EXTENT) / 2) * height];
  }

  private paintBackground(): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = this.canvas.width;
    c.height = this.canvas.height;
    const ctx = c.getContext('2d')!;
    const s = c.width / 300;

    // The sharp frame follows the square arena without cropping playable ground.
    battlegroundOutline(ctx, c.width, c.height);
    const ground = ctx.createLinearGradient(0, 0, c.width, c.height);
    ground.addColorStop(0, '#272335');
    ground.addColorStop(1, '#181724');
    ctx.fillStyle = ground;
    ctx.fill();
    ctx.save();
    ctx.beginPath();MAP_BOUNDARY.forEach((p,i)=>{const [x,y]=this.toMap(new Vector3(p.x,0,p.z));if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);});ctx.closePath();
    ctx.fillStyle='#374037';ctx.fill();ctx.strokeStyle='#67705c';ctx.lineWidth=2*s;ctx.stroke();
    ctx.clip();
    // Low-contrast ground mottling is surface texture, not additional obstacles.
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 45; i++) {
      const x = rnd() * c.width;
      const y = rnd() * c.height;
      const r = (8 + rnd() * 20) * s;
      ctx.fillStyle = i % 2 ? '#49405018' : '#0c0b1720';
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * .65, rnd() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }

    if (this.terrain) {
      ctx.globalAlpha=.45;ctx.drawImage(this.terrain,0,0,c.width,c.height);ctx.globalAlpha=1;
    }
    // Match the rendered terrain and lane AI, including jungle crossings.
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for(const route of [...JUNGLE_PATHS.map(points=>({points,width:4,jungle:true})),...LANES.map(l=>({...l,jungle:false}))]) {
      ctx.beginPath();
      route.points.forEach((p,i)=>{const [x,y]=this.toMap(new Vector3(p.x,0,p.z));if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);});
      ctx.strokeStyle=route.jungle?'#52604b':'#253340';ctx.lineWidth=(route.width+2)/EXTENT*c.width/2;ctx.stroke();
      ctx.strokeStyle=route.jungle?'#626850':'#8b9180';ctx.lineWidth=route.width/EXTENT*c.width/2;ctx.stroke();
    }
    for(const compound of COMPOUNDS) {
      ctx.beginPath();
      for(const [i,side] of [-1,1].entries()) {
        const [x,y]=this.toMap(new Vector3(compound.gate.x+Math.cos(compound.yaw)*6.6*side,0,compound.gate.z-Math.sin(compound.yaw)*6.6*side));
        if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);
      }
      ctx.strokeStyle=compound.team==='blue'?'#6ba5b8':'#ac7669';ctx.lineWidth=1.3*s;ctx.stroke();
    }

    // pillars
    ctx.fillStyle = '#151421';
    ctx.strokeStyle = '#544a61';
    ctx.lineWidth = 1.2 * s;
    for (const o of this.world.obstacles) {
      const [x, y] = this.toMap(new Vector3(o.x, 0, o.z));
      const rx = (o.r / EXTENT) * (c.width / 2);
      const ry = (o.r / EXTENT) * (c.height / 2);
      ctx.beginPath();
      for (let i = 0; i < 7; i++) {
        const a = i / 7 * Math.PI * 2 + o.x * .7;
        const px = x + Math.cos(a) * rx;
        const py = y + Math.sin(a) * ry;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();

    // bases
    for (const [p, color] of [[BLUE_BASE, '#a3e8eb'], [RED_BASE, '#ff8068']] as const) {
      const [x, y] = this.toMap(p);
      ctx.fillStyle = `${color}18`;
      ctx.strokeStyle = `${color}66`;
      ctx.lineWidth = 1 * s;
      ctx.beginPath();
      ctx.ellipse(x, y, (7 / EXTENT) * (c.width / 2), (7 / EXTENT) * (c.height / 2), 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    return c;
  }
}

/** The arena's real square footprint, with sharp corners. */
function battlegroundOutline(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  const margin = (EXTENT - ARENA - 2) / (EXTENT * 2);
  const x = width * margin;
  const y = height * margin;
  ctx.beginPath();
  ctx.rect(x, y, width - x * 2, height - y * 2);
}

/** Four joined bevel faces stay outside the map; minimum thickness is in CSS pixels. */
function paintFrame(ctx: CanvasRenderingContext2D, width: number, height: number, dpr: number): void {
  const margin = (EXTENT - ARENA - 2) / (EXTENT * 2);
  const x = width * margin;
  const y = height * margin;
  const r = width - x;
  const b = height - y;
  const rim = Math.min(x, y, Math.max(2.5 * dpr, width / 95));
  const faces: [string, number[][]][] = [
    ['#e8f3fc', [[x - rim, y - rim], [r + rim, y - rim], [r, y], [x, y]]],
    ['#8ca7bf', [[r, y], [r + rim, y - rim], [r + rim, b + rim], [r, b]]],
    ['#7b96ae', [[x, b], [r, b], [r + rim, b + rim], [x - rim, b + rim]]],
    ['#b8ccdc', [[x - rim, y - rim], [x, y], [x, b], [x - rim, b + rim]]],
  ];
  ctx.save();
  for (const [color, points] of faces) {
    ctx.beginPath();
    points.forEach(([px, py], i) => i ? ctx.lineTo(px, py) : ctx.moveTo(px, py));
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  }
  ctx.lineJoin = 'miter';
  ctx.lineWidth = .75 * dpr;
  ctx.strokeStyle = '#23354b';
  ctx.strokeRect(x, y, r - x, b - y);
  ctx.restore();
}

/** a little castle glyph, like HotS's core icon */
function keep(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  const h = r * 1.6;
  const t = r * 0.45;
  ctx.beginPath();
  ctx.moveTo(x - r, y + h / 2);
  ctx.lineTo(x - r, y - h / 2);
  ctx.lineTo(x - r + t, y - h / 2);
  ctx.lineTo(x - r + t, y - h / 2 + t * 0.8);
  ctx.lineTo(x - t / 2, y - h / 2 + t * 0.8);
  ctx.lineTo(x - t / 2, y - h / 2 - t * 0.4);
  ctx.lineTo(x + t / 2, y - h / 2 - t * 0.4);
  ctx.lineTo(x + t / 2, y - h / 2 + t * 0.8);
  ctx.lineTo(x + r - t, y - h / 2 + t * 0.8);
  ctx.lineTo(x + r - t, y - h / 2);
  ctx.lineTo(x + r, y - h / 2);
  ctx.lineTo(x + r, y + h / 2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}
