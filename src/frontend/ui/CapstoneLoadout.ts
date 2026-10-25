import { ABILITY_TRACKS } from '../../survivor/ability-ranks';
import { loadCapstone, saveCapstone } from '../../survivor/capstone-loadout';
import './capstone-loadout.css';

/** Between-run loadout only: no live Run or skill wallet is modified here. */
export function openCapstoneLoadout(): HTMLDialogElement {
  const dialog = document.createElement('dialog');
  dialog.className = 'capstone-loadout';
  dialog.setAttribute('aria-labelledby', 'capstone-loadout-title');
  dialog.innerHTML = `<header><div><small>SNOW WHITE / BASE LOADOUT</small><h2 id="capstone-loadout-title">Choose one capstone</h2></div><button type="button" class="capstone-close" aria-label="Close loadout">×</button></header>
    <p>Your selected capstone activates when its ability reaches Rank 5. The other capstones remain inactive, even if you max their abilities. Swap here between runs.</p>
    <div class="capstone-options"></div>
    <footer><div><strong>Skills reset between runs</strong><p>Every deployment starts at Rank 1 with fresh run SP. Your capstone choice carries over until you change or clear it.</p></div><button type="button" class="capstone-reset">Clear capstone choice</button></footer>
    <p class="capstone-status" role="status" aria-live="polite"></p>`;
  let selected = loadCapstone();
  const options = dialog.querySelector('.capstone-options')!;
  const status = dialog.querySelector('.capstone-status')!;
  const buttons: HTMLButtonElement[] = [];
  const refresh = () => {
    buttons.forEach((button, i) => {
      const equipped = ABILITY_TRACKS[i].id === selected;
      button.setAttribute('aria-pressed', String(equipped));
      button.querySelector('b')!.textContent = equipped ? 'EQUIPPED' : 'SELECT';
    });
    status.textContent = selected ? `${ABILITY_TRACKS.find(track => track.id === selected)!.capstone.name} equipped for your next run.` : 'No capstone equipped. Select one before deploying.';
  };
  for (const track of ABILITY_TRACKS) {
    const button = document.createElement('button');
    button.type = 'button';
    const image = document.createElement('img');
    image.src = `${import.meta.env.BASE_URL}${track.art}`; image.alt = '';
    const label = document.createElement('small'); label.textContent = `${track.name} · Rank 5`;
    const name = document.createElement('h3'); name.textContent = track.capstone.name;
    const description = document.createElement('p'); description.textContent = track.capstone.description;
    button.append(image, label, name, description, document.createElement('b'));
    button.addEventListener('click', () => { selected = track.id; saveCapstone(selected); refresh(); });
    buttons.push(button); options.append(button);
  }
  dialog.querySelector('.capstone-reset')!.addEventListener('click', () => { selected = null; saveCapstone(null); refresh(); });
  dialog.querySelector('.capstone-close')!.addEventListener('click', () => dialog.close());
  dialog.addEventListener('keydown', event => event.stopPropagation());
  dialog.addEventListener('close', () => dialog.remove(), { once: true });
  document.body.append(dialog); refresh(); dialog.showModal();
  return dialog;
}
