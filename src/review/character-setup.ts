import { CHARACTER_MODULES, type CharacterId } from '../characters';
import { characterBurstButtonArt } from '../characters/assets';
import { characterSkins } from '../frontend/profile/Skins';
import { SkinModelPreview } from '../frontend/ui/SkinModelPreview';
import './character-setup.css';

const ids = ['marian', 'crown', 'kilo', 'cecil', 'sin', 'wells'] as const;
const root = document.querySelector<HTMLElement>('#setup')!;
root.innerHTML = `<header><small>ASSET SETUP</small><h1>Character preview</h1><p>Inspect appearances, animations and burst art. Gameplay kits are still in development.</p></header>
<nav><label>Character <select id="character"></select></label><label>Appearance <select id="skin"></select></label><label>Animation <select id="animation"></select></label></nav>
<p id="note"></p><section class="previews"><div id="model"></div><figure><img id="burst" alt=""><figcaption>Burst illustration</figcaption><div id="banner" aria-label="Burst HUD crop"></div></figure></section>`;
const character = root.querySelector<HTMLSelectElement>('#character')!;
const skin = root.querySelector<HTMLSelectElement>('#skin')!;
const animation = root.querySelector<HTMLSelectElement>('#animation')!;
const art = root.querySelector<HTMLImageElement>('#burst')!;
const banner = root.querySelector<HTMLElement>('#banner')!;
const note = root.querySelector<HTMLElement>('#note')!;
const preview = new SkinModelPreview();
root.querySelector('#model')!.append(preview.element);
for (const id of ids) character.add(new Option(CHARACTER_MODULES[id].name, id));
for (const [name, clip] of Object.entries({ Idle: 'idle', Walk: 'walk', Run: 'run', Aim: 'aim_idle', Fire: 'shot', Reload: 'cover_reload', Stun: 'stun', Death: 'death' })) animation.add(new Option(name, clip));
const params = new URLSearchParams(location.search);
character.value = ids.find(id => id === params.get('character')) ?? ids[0];
async function show(): Promise<void> {
  const selected = characterSkins(character.value as CharacterId).find(item => item.id === skin.value)!;
  await preview.show(selected, animation.value);
}
function selectCharacter(): void {
  const id = character.value as CharacterId;
  skin.replaceChildren(...characterSkins(id).map(item => new Option(item.name, item.id)));
  const path = `${import.meta.env.BASE_URL}${characterBurstButtonArt(id)}`;
  art.src = path; art.alt = `${CHARACTER_MODULES[id].name} burst illustration`;
  banner.style.backgroundImage = `url("${path}")`;
  note.textContent = id === 'cecil' ? 'Model stand-in: Liliweiss, with retargeted animations. A native Cecil model is not available in the source catalog.'
    : id === 'wells' ? 'Default: Research Uniform with clock-eye glow, silver bob, animated side bangs, cyan visor and lab coat. Product 08 is a separate skin.'
    : `${characterSkins(id).length} appearance${characterSkins(id).length === 1 ? '' : 's'} available.`;
  void show();
}
character.onchange = selectCharacter;
skin.onchange = animation.onchange = () => { void show(); };
selectCharacter();
addEventListener('pagehide', () => preview.dispose(), { once: true });
