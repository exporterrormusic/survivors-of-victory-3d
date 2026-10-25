// Entry point. The Survivors of Victory front end (Phaser) runs until Stage Select deploys;
// then the page becomes a Babylon survivor run (src/survivor/main.ts; ?run=test-range opens one
// directly). The archived MOBA match (src/main.ts) still opens with ?hero=<character id> or
// ?v=<model id>, and ?preview=<scene> opens a menu screen directly.
import { isPlayable } from './characters';

const params = new URLSearchParams(location.search);
if (params.has('run')) startRun();
else if (params.has('hero') || params.has('v')) startMatch();
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
    // `mission` picks the run type (salvage_run = the sortie loop); `mode=sortie` is the old dev link.
    const query = new URLSearchParams({ run: 'test-range', character: characterId, zone: stageSelection.zoneId, mission: stageSelection.modeId });
    history.replaceState(null, '', `?${query}`);
    game.destroy(true);
    container.remove();
    startRun();
  });
}

function startRun(): void {
  // The survivor run wires its own Leave button (back to Stage Select, or abandon a sortie).
  void import('./survivor/main');
}

function startMatch(): void {
  leaveToLobby();
  void import('./main');
}

function leaveToLobby(): void {
  document.getElementById('leave-match')?.addEventListener('click', () => {
    // A reload tears the Babylon scene down completely and reopens the lobby.
    location.assign(`${location.pathname}?preview=main-menu`);
  });
}
