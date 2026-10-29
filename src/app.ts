import { returnToMainMenu } from './frontend/return-to-menu';
// Entry point. The Survivors of Victory front end (Phaser) runs until Stage Select deploys;
// then the page becomes a Babylon survivor run (src/survivor/main.ts; ?run=test-range opens one
// directly). The archived MOBA match (src/main.ts) still opens with ?hero=<character id> or
// ?v=<model id>, and ?preview=<scene> opens a menu screen directly.
import { isPlayable } from './characters';
import { characterLockReason } from './frontend/profile/CharacterRoster';
import { requestPersistentStorage } from './frontend/persistence/ProfileStorage';
import { holdLevelTransition, cancelLevelTransition } from './frontend/level-transition';

// Ask the browser to keep the save through storage cleanup (matters most in the itch.io web build).
void requestPersistentStorage();

const params = new URLSearchParams(location.search);
if (params.get('mission') === 'ark_siege' || params.get('prototype') === 'ark-siege') void import('./siege/main');
else if (params.has('run')) startRun();
else if (params.has('hero') || params.has('v')) startMatch();
else void startFrontEnd();

async function startFrontEnd(): Promise<void> {
  const container = document.createElement('main');
  container.id = 'front-end';
  container.setAttribute('aria-label', 'NIKKE front end');
  document.body.appendChild(container);
  const [{ bootFrontEnd }, { onDeploy }] = await Promise.all([import('./frontend/boot'), import('./frontend/handoff')]);
  const game = await bootFrontEnd(container);
  onDeploy(({ characterId, stageSelection, coop }) => {
    if (!isPlayable(characterId) || characterLockReason(characterId) !== undefined) return;
    // `mission` picks the run type (salvage_run = the sortie loop); `mode=sortie` is the old dev link.
    const query = new URLSearchParams({ run: 'test-range', character: characterId, zone: stageSelection.zoneId, time: stageSelection.time, mission: stageSelection.modeId });
    if (coop) { query.set('coop', coop.role); query.set('room', coop.code); }
    history.replaceState(null, '', `?${query}`);
    // Capture after rendering: WebGL's drawing buffer is cleared between frames.
    game.events.once('postrender', () => {
      holdLevelTransition(game.canvas);
      game.destroy(true);
      container.remove();
      startRun();
    });
  });
}

function startRun(): void {
  if (new URLSearchParams(location.search).get('mission') === 'ark_siege') {
    void import('./siege/main').catch(handleRunLoadError);
    return;
  }
  // The survivor run wires its own Leave button (back to Stage Select, or abandon a sortie).
  void import('./survivor/main').catch(handleRunLoadError);
}

function handleRunLoadError(error: unknown): void {
  cancelLevelTransition();
  console.error(error);
  const loading = document.getElementById('loading');
  if (loading) loading.textContent = `Failed to load: ${error instanceof Error ? error.message : error}`;
}

function startMatch(): void {
  leaveToLobby();
  void import('./main');
}

function leaveToLobby(): void {
  document.getElementById('leave-match')?.addEventListener('click', () => {
    // A reload tears the Babylon scene down completely and reopens the lobby.
    returnToMainMenu();
  });
}
