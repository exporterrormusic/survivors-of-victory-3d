import type { CharacterId } from '../profile/Ids';
import { createSkinShowroom } from './SkinShowroom';

export function openSkinSelection(characterId: CharacterId, onChange: () => void, selectedSkinId?: string): HTMLDialogElement {
  const dialog = document.createElement('dialog'); dialog.className = 'skin-selection';
  dialog.setAttribute('aria-label', 'Select appearance');
  const close = document.createElement('button'); close.className = 'skin-close'; close.textContent = 'BACK'; close.onclick = () => dialog.close();
  const showroom = createSkinShowroom(characterId, 'equip', onChange, selectedSkinId);
  dialog.append(close, showroom.element);
  dialog.addEventListener('keydown', event => event.stopPropagation());
  const dispose = () => { showroom.dispose(); dialog.remove(); observer.disconnect(); };
  // Also release the engine when the owning Phaser scene removes the dialog.
  const observer = new MutationObserver(() => { if (!dialog.isConnected) dispose(); });
  dialog.addEventListener('close', dispose, { once: true });
  document.body.append(dialog); observer.observe(document.body, { childList: true }); dialog.showModal(); return dialog;
}
