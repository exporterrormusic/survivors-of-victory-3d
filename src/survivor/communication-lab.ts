import { CommunicationPanel, type BroadcastMedia } from '../ui/communication-panel';

/** Local files stay local; URLs are released when replaced or the scene is disposed. */
export function createCommunicationLab(panel: CommunicationPanel): { element: HTMLElement; dispose: () => void } {
  const element = document.createElement('section');
  element.className = 'communication-lab';
  element.innerHTML = `<p>Incoming hologram broadcast. Walk with WASD to test the subtle movement response.</p>
    <label>Broadcast media<input type="file" accept="image/png,image/jpeg,image/webp,video/mp4,video/webm"></label>
    <label>Framing<select data-fit><option value="cover">Fill screen</option><option value="contain">Fit entire media</option></select></label>
    <label>Video audio<input type="checkbox" data-audio></label>
    <div class="communication-lab-actions"><button type="button" data-open>Receive / replay</button><button type="button" data-close>End call</button></div>
    <button type="button" data-demo>Use demo portrait</button>
    <p data-note role="status">Demo portrait ready. You can also choose a PNG, MP4, or WebM.</p>`;
  const demo = `${import.meta.env.BASE_URL}assets/menus/character-select/marian/portrait.png`;
  let src = demo;
  let kind: BroadcastMedia['kind'] = 'image';
  let objectUrl: string | null = null;
  const fit = element.querySelector<HTMLSelectElement>('[data-fit]')!;
  const audio = element.querySelector<HTMLInputElement>('[data-audio]')!;
  const file = element.querySelector<HTMLInputElement>('input[type=file]')!;
  const note = element.querySelector<HTMLElement>('[data-note]')!;
  const show = () => panel.show({ src, kind, fit: fit.value as 'cover' | 'contain', muted: !audio.checked });
  const release = () => { if (objectUrl) URL.revokeObjectURL(objectUrl); objectUrl = null; };
  file.addEventListener('change', () => {
    const selected = file.files?.[0];
    if (!selected) return;
    if (!selected.type.startsWith('image/') && !selected.type.startsWith('video/')) {
      note.textContent = 'Choose an image or video file.'; return;
    }
    const previous = objectUrl;
    objectUrl = URL.createObjectURL(selected); src = objectUrl;
    kind = selected.type.startsWith('video/') ? 'video' : 'image';
    note.textContent = selected.name;
    show();
    if (previous) URL.revokeObjectURL(previous);
  });
  element.querySelector('[data-open]')!.addEventListener('click', show);
  element.querySelector('[data-close]')!.addEventListener('click', () => panel.hide());
  element.querySelector('[data-demo]')!.addEventListener('click', () => {
    src = demo; kind = 'image'; file.value = ''; note.textContent = 'Demo portrait ready.'; show(); release();
  });
  fit.addEventListener('change', show);
  audio.addEventListener('change', show);
  element.addEventListener('click', event => {
    (event.target as HTMLElement).closest<HTMLButtonElement>('button')?.blur();
  });
  return { element, dispose: () => { panel.dispose(); release(); element.remove(); } };
}
