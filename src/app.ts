// Entry point. The Survivors of Victory front end (Phaser) runs until Stage Select deploys;
// then the page becomes a Babylon match (src/main.ts). ?hero=<character id> or ?v=<model id>
// opens a match directly, and ?preview=<scene> opens a menu screen directly.
import { isPlayable } from './characters';

const params = new URLSearchParams(location.search);
if (params.has('hero') || params.has('v')) startMatch();
else void startFrontEnd();

async function startFrontEnd(): Promise<void> {
  const container = document.createElement('main');
  container.id = 'front-end';
  container.setAttribute('aria-label', 'NIKKE front end');
  document.body.appendChild(container);
  const [{ bootFrontEnd }, { onDeploy }] = await Promise.all([import('./frontend/boot'), import('./frontend/handoff')]);
  const game = await bootFrontEnd(container);
  onDeploy(({ characterId, stageSelection }) => {
    if (!isPlayable(characterId)) return;
    const query = new URLSearchParams({ hero: characterId, zone: stageSelection.zoneId, mode: stageSelection.modeId, map:stageSelection.modeId==='stage_3'?'single-lane':'three-lane' });
    history.replaceState(null, '', `?${query}`);
    game.destroy(true);
    container.remove();
    startMatch();
  });
}

function startMatch(): void {
  document.getElementById('leave-match')?.addEventListener('click', () => {
    // A reload tears the Babylon scene down completely and reopens the lobby.
    location.assign(`${location.pathname}?preview=main-menu`);
  });
  void import('./main');
}
