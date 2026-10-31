import type { CharacterId } from '../profile/Ids';
import { createSkinShowroom } from './SkinShowroom';

export function openSkinSelection(characterId: CharacterId, onChange: () => void, selectedSkinId?: string): HTMLDialogElement {
  const dialog = document.createElement('dialog'); dialog.className = 'skin-selection';
  dialog.setAttribute('aria-label', 'Select appearance');
  const close = document.createElement('button'); close.className = 'skin-close'; close.textContent = 'BACK'; close.onclick = () => dialog.close();
  const showroom = createSkinShowroom(characterId, 'equip', onChange, selectedSkinId);
  dialog.append(close, showroom.element);
  dialog.addEventListener('keydown', event => event.stopPropagation());
  // Phaser listens for pointer releases on window, so clicks inside the dialog would otherwise
  // hit-test the scene underneath and pick characters through it.
  for (const type of ['mousedown', 'mouseup', 'mousemove', 'pointerdown', 'pointerup', 'pointermove', 'touchstart', 'touchend', 'touchmove', 'wheel']) {
    dialog.addEventListener(type, event => event.stopPropagation());
  }
  // Laid out at 1080p and zoomed with the Phaser canvas, so it shrinks with the window like the
  // scene behind it instead of keeping fixed pixel sizes.
  const fit = () => {
    const canvasHeight = document.querySelector('#front-end canvas')?.getBoundingClientRect().height || innerHeight;
    dialog.style.zoom = String(Math.min(canvasHeight / 1080, innerWidth * 0.96 / 960, innerHeight * 0.96 / 900));
  };
  fit(); addEventListener('resize', fit);
  const dispose = () => { removeEventListener('resize', fit); showroom.dispose(); dialog.remove(); observer.disconnect(); };
  // Also release the engine when the owning Phaser scene removes the dialog.
  const observer = new MutationObserver(() => { if (!dialog.isConnected) dispose(); });
  dialog.addEventListener('close', dispose, { once: true });
  document.body.append(dialog); observer.observe(document.body, { childList: true }); dialog.showModal(); return dialog;
}
