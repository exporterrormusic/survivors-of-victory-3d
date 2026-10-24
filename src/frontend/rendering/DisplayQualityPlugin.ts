import Phaser from "phaser";

export const GAME_WIDTH = 1920;
export const GAME_HEIGHT = 1080;

export const RENDER_SCALE = 1.5;
export const GAMEPLAY_VIEW_SCALE = 0.85;
export const GAMEPLAY_CAMERA_ZOOM = RENDER_SCALE * GAMEPLAY_VIEW_SCALE;
const TEXT_RESOLUTION = 2;

export const RENDER_WIDTH = GAME_WIDTH * RENDER_SCALE;
export const RENDER_HEIGHT = GAME_HEIGHT * RENDER_SCALE;

export function logicalPointerPosition(
  pointer: Phaser.Input.Pointer,
): Phaser.Math.Vector2 {
  return new Phaser.Math.Vector2(
    pointer.x / RENDER_SCALE,
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
      RENDER_WIDTH * 0.5 - (RENDER_WIDTH * 0.5) / zoom,
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
