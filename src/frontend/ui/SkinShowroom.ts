import { cores } from './cores';
import { CHARACTER_MODULES } from '../../characters';
import type { CharacterId } from '../profile/Ids';
import { characterLockReason } from '../profile/CharacterRoster';
import { characterSkins, equippedSkin, equipSkin, ownsSkin, purchaseSkin } from '../profile/Skins';
import { loadRosterState } from '../profile/CharacterRoster';
import { SkinModelPreview } from './SkinModelPreview';
import './skin-selection.css';

export function createSkinShowroom(characterId: CharacterId, mode: 'shop' | 'equip', onChange: () => void, selectedSkinId?: string) {
  const element = document.createElement('section'); element.className = 'skin-showroom';
  const heading = document.createElement('header');
  const identity = document.createElement('small'); identity.textContent = `${CHARACTER_MODULES[characterId].profile.name} / APPEARANCES`;
  const name = document.createElement('h2'); heading.append(identity, name);
  const preview = new SkinModelPreview();
  const choices = document.createElement('div'); choices.className = 'skin-choices'; choices.setAttribute('aria-label', 'Choose appearance to preview');
  const footer = document.createElement('footer');
  const state = document.createElement('p'); state.setAttribute('role', 'status');
  const action = document.createElement('button'); action.type = 'button';
  footer.append(state, action); element.append(heading, preview.element, choices, footer);
  const skins = characterSkins(characterId);
  let selected = skins.find(skin => skin.id === selectedSkinId) ?? equippedSkin(characterId) ?? skins[0];
  const buttons: HTMLButtonElement[] = [];
  const refresh = () => {
    if (!selected) { name.textContent = 'COMING SOON'; state.textContent = 'Appearances are not available yet.'; action.hidden = true; return; }
    const owned = ownsSkin(selected), locked = !!characterLockReason(characterId), equipped = equippedSkin(characterId)?.id === selected.id;
    name.textContent = selected.name;
    buttons.forEach((button, i) => { button.setAttribute('aria-pressed', String(skins[i].id === selected.id)); button.querySelector('small')!.textContent = skins[i].cost === 0 ? 'INCLUDED' : ownsSkin(skins[i]) ? 'OWNED' : locked ? 'COMING SOON' : cores(skins[i].cost); });
    state.textContent = locked ? 'This character is not available yet.' : selected.cost === 0 ? 'Default appearance / Included' : owned ? 'Permanently unlocked' : `${selected.cost} Rapture Core${selected.cost === 1 ? '' : 's'}`;
    action.disabled = locked || (mode === 'shop' ? owned || loadRosterState().pristineCores < selected.cost : !owned || equipped);
    action.textContent = locked ? 'COMING SOON' : mode === 'shop' ? owned ? 'OWNED' : action.disabled ? 'NOT ENOUGH CORES' : 'BUY SKIN' : equipped ? 'EQUIPPED' : owned ? 'EQUIP SKIN' : 'UNLOCK IN SHOP';
  };
  for (const skin of skins) {
    const button = document.createElement('button'); button.type = 'button';
    const img = document.createElement('img'); img.src = `${import.meta.env.BASE_URL}${skin.icon}`; img.alt = '';
    const label = document.createElement('span'); label.textContent = skin.name; label.title = skin.name;
    const badge = document.createElement('small'); button.append(img, label, badge);
    button.onclick = () => { selected = skin; refresh(); void preview.show(skin); };
    buttons.push(button); choices.append(button);
  }
  action.onclick = () => {
    if (!selected) return;
    const success = mode === 'shop' ? purchaseSkin(selected.id) : equipSkin(selected);
    refresh();
    if (success) { state.textContent = mode === 'shop' ? 'Unlocked! Equip this skin in Character Select.' : 'Equipped for your next deployment.'; onChange(); }
    else state.textContent = 'Could not save your change. Please try again.';
  };
  refresh(); if (selected) void preview.show(selected);
  return { element, dispose: () => { preview.dispose(); element.remove(); } };
}
