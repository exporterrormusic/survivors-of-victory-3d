import Phaser from "phaser";

const CAPTURE_DELAY_MS = 500;

/** Saves a rendered Phaser canvas into .preview during local development. */
export function captureDevelopmentPreview(
  scene: Phaser.Scene,
  name: string,
): void {
  // Survivors' visual harness endpoint; only requested explicitly here (?capture).
  if (
    !import.meta.env.DEV ||
    !new URLSearchParams(window.location.search).has("capture")
  ) {
    return;
  }

  scene.time.delayedCall(CAPTURE_DELAY_MS, () => {
    scene.game.canvas.toBlob((blob) => {
      if (blob === null) {
        return;
      }
      void fetch("/__preview-capture", {
        body: blob,
        headers: {
          "Content-Type": "image/png",
          "X-Preview-Name": name,
        },
        method: "POST",
      }).catch(() => {
        // Preview capture is optional and must never interrupt the game.
      });
    }, "image/png");
  });
}
