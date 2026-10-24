import Phaser from "phaser";

export interface ButtonInteractionOptions {
  readonly draw: (hovered: boolean) => void;
  readonly enabled?: () => boolean;
  readonly onActivate: () => void;
  readonly onHover?: () => void;
}

export function bindButtonInteraction(
  target: Phaser.GameObjects.GameObject,
  options: ButtonInteractionOptions,
): void {
  const enabled = options.enabled ?? (() => true);
  target.setInteractive({ useHandCursor: enabled() });
  target.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OVER, () => {
    if (!enabled()) return;
    options.draw(true);
    options.onHover?.();
  });
  target.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OUT, () =>
    options.draw(false),
  );
  target.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => {
    if (enabled()) options.onActivate();
  });
}
