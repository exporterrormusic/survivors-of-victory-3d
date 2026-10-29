import { CHARACTER_MODULES } from '../../characters';
import type { CharacterId } from './Ids';
import { CHARACTERS, characterLockReason, loadRosterState, saveRosterState } from './CharacterRoster';

export interface SkinDefinition { id: string; characterId: CharacterId; name: string; cost: number; icon: string }
export function characterSkins(characterId: CharacterId): SkinDefinition[] {
  const model = CHARACTER_MODULES[characterId].model;
  if (!model) return [];
  return [{ variant: model.variant, name: 'Default' }, ...(model.skins ?? [])].map((skin, index) => ({
    id: skin.variant, characterId, name: skin.name.replace(/^.*?: /, ''), cost: index === 0 ? 0 : 1,
    icon: characterId === 'wells' && index === 0
      ? CHARACTER_MODULES.wells.profile.portraitPath
      : `chibi/${skin.variant}_icon.png`,
  }));
}
export const SHOP_SKINS = CHARACTERS.flatMap(character => characterSkins(character.id)).filter(skin => skin.cost > 0);
export function ownsSkin(skin: SkinDefinition): boolean { return skin.cost === 0 || loadRosterState().ownedSkinIds.includes(skin.id); }
export function equippedSkin(characterId: CharacterId): SkinDefinition | undefined {
  const skins = characterSkins(characterId), state = loadRosterState();
  return skins.find(skin => skin.id === state.equippedSkins[characterId] && ownsSkin(skin)) ?? skins[0];
}
export function equipSkin(skin: SkinDefinition): boolean {
  const canonical = characterSkins(skin.characterId).find(item => item.id === skin.id);
  if (!canonical || characterLockReason(skin.characterId) || !ownsSkin(canonical)) return false;
  const state = loadRosterState(); state.equippedSkins[skin.characterId] = skin.id;
  return saveRosterState(state);
}
export function purchaseSkin(id: string): boolean {
  const skin = SHOP_SKINS.find(item => item.id === id);
  if (!skin || ownsSkin(skin) || characterLockReason(skin.characterId)) return false;
  const state = loadRosterState();
  if (state.pristineCores < skin.cost) return false;
  state.pristineCores -= skin.cost; state.ownedSkinIds.push(skin.id);
  return saveRosterState(state);
}
