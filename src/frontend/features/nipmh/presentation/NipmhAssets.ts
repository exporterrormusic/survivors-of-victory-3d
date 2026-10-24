import type Phaser from "phaser";

import { NIPMH_CATALOG, type NipmhId } from "../domain/NipmhCatalog";

export function nipmhTextureKey(id: NipmhId): string {
  return `nipmh-memory-${id}`;
}

export function preloadNipmhAssets(scene: Phaser.Scene): void {
  NIPMH_CATALOG.forEach((definition) => {
    scene.load.image(nipmhTextureKey(definition.id), definition.artPath);
  });
}
