import Phaser from "phaser";

export const GAME_WIDTH = 1920;
export const GAME_HEIGHT = 1080;

export const RENDER_SCALE = 1.5;
export const GAMEPLAY_VIEW_SCALE = 0.85;
export const GAMEPLAY_CAMERA_ZOOM = RENDER_SCALE * GAMEPLAY_VIEW_SCALE;
const TEXT_RESOLUTION = 2;

export const RENDER_WIDTH = GAME_WIDTH * RENDER_SCALE;
export const RENDER_HEIGHT = GAME_HEIGHT * RENDER_SCALE;

// Screens wider than 16:9 (up to 21:9, like the run frame) see more of each scene to the sides:
// cameras stay centred on the 1920x1080 layout, and full-bleed art and edge-anchored chrome use `view`.
const MIN_ASPECT = 16 / 9;
const MAX_ASPECT = 21 / 9;
let viewWidth = GAME_WIDTH;

/** Logical width the window shows at 1080 high, from 1920 (16:9) to 2520 (21:9). */
export function windowViewWidth(): number {
  const aspect = window.innerWidth / Math.max(1, window.innerHeight);
  return Math.round((GAME_HEIGHT * Math.min(MAX_ASPECT, Math.max(MIN_ASPECT, aspect))) / 2) * 2;
}
export function setViewWidth(width: number): void { viewWidth = width; }
/** The visible span in 1920x1080 layout coordinates; left is negative on wide screens. */
export const view = {
  get width(): number { return viewWidth; },
  get left(): number { return (GAME_WIDTH - viewWidth) / 2; },
  get right(): number { return (GAME_WIDTH + viewWidth) / 2; },
  get renderWidth(): number { return viewWidth * RENDER_SCALE; },
};
/** Full-bleed art is always drawn this wide (21:9), so resizing the window never redraws it. */
const BLEED_WIDTH = Math.round(GAME_HEIGHT * MAX_ASPECT);
export const bleed = {
  left: (GAME_WIDTH - BLEED_WIDTH) / 2,
  right: (GAME_WIDTH + BLEED_WIDTH) / 2,
  width: BLEED_WIDTH,
} as const;

/** Pin header/footer chrome to a screen edge; it slides with that edge when the window resizes. */
export function pinToEdge<T extends Phaser.GameObjects.GameObject>(object: T, side: "left" | "right"): T {
  return object.setData("edge", side);
}

/** Resize every running scene's view in place: cameras stay centred and pinned chrome follows the edges. */
export function applyViewWidth(game: Phaser.Game, width: number): void {
  const shiftLeft = (GAME_WIDTH - width) / 2 - view.left;
  setViewWidth(width);
  game.scale.setGameSize(view.renderWidth, RENDER_HEIGHT);
  for (const scene of game.scene.getScenes(true)) {
    scene.cameras.main.setSize(view.renderWidth, RENDER_HEIGHT).centerOn(GAME_WIDTH / 2, GAME_HEIGHT / 2);
    for (const object of scene.children.list) {
      const side = object.getData("edge") as "left" | "right" | undefined;
      const positioned = object as unknown as { x: number };
      if (side === "left") positioned.x += shiftLeft;
      else if (side === "right") positioned.x -= shiftLeft;
    }
    scene.events.emit("view-resize");
  }
}

export function logicalPointerPosition(
  pointer: Phaser.Input.Pointer,
): Phaser.Math.Vector2 {
  return new Phaser.Math.Vector2(
    pointer.x / RENDER_SCALE + view.left,
    pointer.y / RENDER_SCALE,
  );
}

/**
 * Creates a 1920x1080-local container that remains correctly aligned inside
 * the supersampled renderer, including while the gameplay camera is following.
 */
export function createLogicalViewportContainer(
  scene: Phaser.Scene,
  depth: number,
): Phaser.GameObjects.Container {
  const viewport = scene.add.container(0, 0).setDepth(depth).setScrollFactor(0);
  const content = scene.add.container(0, 0);
  viewport.add(content);
  const syncToCamera = (): void => {
    const zoom = Math.max(0.001, scene.cameras.main.zoom);
    viewport.setPosition(
      view.renderWidth * 0.5 - (view.renderWidth * 0.5) / zoom - (view.left * RENDER_SCALE) / zoom,
      RENDER_HEIGHT * 0.5 - (RENDER_HEIGHT * 0.5) / zoom,
    );
    content.setScale(RENDER_SCALE / zoom);
  };
  syncToCamera();
  scene.events.on(Phaser.Scenes.Events.POST_UPDATE, syncToCamera);
  content.once(Phaser.GameObjects.Events.DESTROY, () => {
    scene.events.off(Phaser.Scenes.Events.POST_UPDATE, syncToCamera);
    if (!viewport.isDestroyed) viewport.destroy(false);
  });
  return content;
}

/** Keeps the 1080p layout while rendering UI and artwork to a denser backing canvas. */
export class DisplayQualityPlugin extends Phaser.Plugins.ScenePlugin {
  public boot(): void {
    const systems = this.systems;
    if (systems === null) return;
    systems.events.on(Phaser.Scenes.Events.START, this.configureCamera, this);
    systems.events.on(
      Phaser.Scenes.Events.ADDED_TO_SCENE,
      this.configureGameObject,
      this,
    );
    systems.events.once(Phaser.Scenes.Events.DESTROY, this.destroy, this);
  }

  public destroy(): void {
    const systems = this.systems;
    systems?.events.off(Phaser.Scenes.Events.START, this.configureCamera, this);
    systems?.events.off(
      Phaser.Scenes.Events.ADDED_TO_SCENE,
      this.configureGameObject,
      this,
    );
    super.destroy();
  }

  private configureCamera(): void {
    this.scene?.cameras.main
      .setZoom(RENDER_SCALE)
      .centerOn(GAME_WIDTH / 2, GAME_HEIGHT / 2);
  }

  private configureGameObject(gameObject: Phaser.GameObjects.GameObject): void {
    if (gameObject instanceof Phaser.GameObjects.Text)
      gameObject.setResolution(TEXT_RESOLUTION);
  }
}
