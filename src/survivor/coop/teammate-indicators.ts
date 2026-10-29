import { Vector3, type Camera } from '@babylonjs/core';
import type { ScreenPoint } from '../hud';
import type { Player } from '../player';
import type { Teammate } from './teammate';
import './teammate-indicators.css';

/** Local-camera HUD, shared by hosts and guests; never includes the local hero. */
export class TeammateIndicators {
  private readonly layer = document.createElement('div');
  private readonly nodes = new Map<number, { root: HTMLDivElement; arrow: HTMLElement; label: HTMLElement }>();
  private readonly viewPosition = new Vector3();

  constructor(private readonly hud: HTMLElement) {
    this.layer.className = 'coop-indicators';
    hud.append(this.layer);
  }

  update(teammates: readonly Teammate[], local: Player, camera: Camera,
    project: (x: number, y: number, z: number) => ScreenPoint): void {
    const width = this.hud.clientWidth, height = this.hud.clientHeight;
    const present = new Set(teammates.map(mate => mate.slot));
    for (const [slot, node] of this.nodes) {
      if (!present.has(slot)) { node.root.remove(); this.nodes.delete(slot); }
    }
    for (const mate of teammates) {
      let node = this.nodes.get(mate.slot);
      if (!node) {
        const root = document.createElement('div'), arrow = document.createElement('span'), label = document.createElement('span');
        root.className = 'coop-indicator'; arrow.className = 'coop-indicator-arrow'; label.className = 'coop-indicator-label';
        arrow.textContent = '❮';
        root.append(arrow, label); this.layer.append(root);
        this.nodes.set(mate.slot, node = { root, arrow, label });
      }
      const p = mate.position;
      const screen = project(p.x, p.y + .8, p.z);
      node.root.hidden = width <= 0 || height <= 0 || !mate.player.chibi.root.isEnabled()
        || (screen.visible && screen.x >= 0 && screen.x <= width && screen.y >= 0 && screen.y <= height);
      if (node.root.hidden) continue;
      // Camera-space direction remains correct even behind the perspective camera.
      Vector3.TransformCoordinatesToRef(p, camera.getViewMatrix(), this.viewPosition);
      const dx = this.viewPosition.x, dy = -this.viewPosition.y;
      if (!Number.isFinite(dx + dy) || Math.hypot(dx, dy) < .001) { node.root.hidden = true; continue; }
      // Separate concentric lanes keep players on the same bearing distinguishable.
      const inset = 48 + mate.slot * 30;
      const halfWidth = Math.max(1, width / 2 - Math.min(inset, width * .3));
      const halfHeight = Math.max(1, height / 2 - Math.min(inset, height * .3));
      const t = Math.min(halfWidth / Math.abs(dx), halfHeight / Math.abs(dy));
      node.root.style.left = `${width / 2 + dx * t}px`;
      node.root.style.top = `${height / 2 + dy * t}px`;
      node.arrow.style.transform = `rotate(${Math.atan2(dy, dx) + Math.PI}rad)`;
      node.root.classList.toggle('down', !mate.alive);
      const distance = Math.round(Math.hypot(p.x - local.position.x, p.z - local.position.z));
      node.label.textContent = `${mate.name.toUpperCase()} · ${distance}m${mate.alive ? '' : ' · DOWN'}`;
    }
  }

  dispose(): void { this.layer.remove(); this.nodes.clear(); }
}
