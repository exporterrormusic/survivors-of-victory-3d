// The one place the release number lives. Bump it for every build that goes out to players:
// the main menu footer, the NOTICE unread dot, the settings footer and exported saves all read it.
// Add a matching entry at the top of PATCH_RELEASES in src/frontend/scenes/MainMenuScene.ts.
export const RELEASE_VERSION = "0.1";

// What the game shows. The CI test builds stamp their full number here (e.g. "0.1.7") through
// VITE_GAME_VERSION; local and hand-made builds show RELEASE_VERSION.
export const GAME_VERSION: string =
  (import.meta as { env?: Record<string, string | undefined> }).env?.VITE_GAME_VERSION || RELEASE_VERSION;
export const VERSION_LABEL = `SOV-2026 // ARK SYS V${GAME_VERSION}`;
