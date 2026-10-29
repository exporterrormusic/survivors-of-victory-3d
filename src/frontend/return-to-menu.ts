import Phaser from 'phaser';
import { playHexWipeCover } from './ui/transitions/HexWipeTransition';
import { RENDER_HEIGHT, setViewWidth, view, windowViewWidth } from './rendering/DisplayQualityPlugin';

let returning = false;

/** Run the same cover as the menus, then preserve its final frame across reload. */
export function returnToMainMenu(): void {
  if (returning) return;
  returning = true;
  // Match the window's shape (16:9 to 21:9) so the cover reaches the screen edges.
  setViewWidth(windowViewWidth());
  const source = document.querySelector<HTMLCanvasElement>('#game');
  const snapshot = document.createElement('canvas');
  snapshot.width = source?.width || 1920;
  snapshot.height = source?.height || 1080;
  if (source) snapshot.getContext('2d')?.drawImage(source, 0, 0);
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:#070b10';
  document.documentElement.append(host);
  class ReturnTransition extends Phaser.Scene {
    create(): void {
      this.textures.addCanvas('departing-game', snapshot);
      this.add.image(view.renderWidth / 2, RENDER_HEIGHT / 2, 'departing-game').setDisplaySize(view.renderWidth, RENDER_HEIGHT);
      // During create(), Phaser still reports this scene as inactive. The cover
      // deliberately ignores inactive scenes, so start after the first drawn frame.
      this.game.events.once('postrender', () => {
        playHexWipeCover(this, () => {
          this.game.events.once('postrender', () => {
            // Capture while the WebGL drawing buffer is still available.
            try { sessionStorage.setItem('menu-transition-frame', this.game.canvas.toDataURL('image/png')); }
            catch { /* The initial page still supplies an opaque cover if storage is unavailable. */ }
            location.assign(`${location.pathname}?preview=main-menu&menuLoading=1`);
          });
        }, 'LOBBY');
      });
    }
  }
  new Phaser.Game({
    type: Phaser.AUTO, parent: host, width: view.renderWidth, height: RENDER_HEIGHT,
    backgroundColor: '#f4f6f8', scene: [ReturnTransition],
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    audio: { noAudio: true },
  });
}
