import { Color3, Mesh, MeshBuilder, StandardMaterial, Texture, type Scene } from '@babylonjs/core';
import type { RangeEnvironment } from './range-environments';
import type { TimeOfDay } from './atmosphere';

const DAY_TINT = Color3.White(), DUSK_TINT = new Color3(.75, .48, .42), NIGHT_TINT = new Color3(.12, .18, .32);

/** Camera-centred panorama: visible in low-angle cinematics without affecting combat lighting. */
export class EnvironmentSky {
  private readonly mesh: Mesh;
  private readonly material: StandardMaterial;
  private readonly textures = new Map<string, Texture>();
  private theme: RangeEnvironment = 'plain';
  private textureKey = '';

  constructor(private readonly scene: Scene, private readonly time: () => TimeOfDay) {
    this.mesh = MeshBuilder.CreateSphere('environment-sky', { diameter: 2, segments: 48, sideOrientation: Mesh.BACKSIDE }, scene);
    this.mesh.infiniteDistance = true;
    this.mesh.isPickable = false;
    this.mesh.applyFog = false;
    this.mesh.metadata = { cameraOcclusionDisabled: true };
    this.material = new StandardMaterial('environment-sky', scene);
    this.material.disableLighting = true;
    this.material.disableDepthWrite = true;
    this.material.fogEnabled = false;
    this.material.diffuseColor = Color3.Black();
    this.material.specularColor = Color3.Black();
    this.mesh.material = this.material;
    this.mesh.setEnabled(false);
    const observer = scene.onBeforeRenderObservable.add(() => {
      this.mesh.scaling.setAll((scene.activeCamera?.maxZ || 300) * .9);
      if (this.mesh.isEnabled()) this.selectTexture();
      const nightArt = this.theme === 'forest' || this.theme === 'storm' || this.textureKey === 'frozen-night';
      const tint = time() === 'night' && !nightArt ? NIGHT_TINT
        : time() === 'dusk' && !nightArt ? DUSK_TINT : DAY_TINT;
      this.material.emissiveColor.copyFrom(tint);
    });
    scene.onDisposeObservable.addOnce(() => {
      scene.onBeforeRenderObservable.remove(observer);
      this.mesh.dispose(); this.material.dispose();
      for (const texture of this.textures.values()) texture.dispose();
    });
  }

  set(theme: RangeEnvironment): void {
    this.theme = theme;
    this.selectTexture();
    this.mesh.setEnabled(true);
  }

  private selectTexture(): void {
    const theme = this.theme;
    const key = theme === 'frozen' && this.time() === 'night' ? 'frozen-night'
      : theme === 'plain' ? 'outskirts' : theme;
    if (key === this.textureKey) return;
    this.textureKey = key;
    let texture = this.textures.get(key);
    if (!texture) {
      texture = new Texture(`${import.meta.env.BASE_URL}environment/skies/${key}.png`, this.scene, false, false);
      texture.wrapU = Texture.WRAP_ADDRESSMODE;
      texture.wrapV = Texture.CLAMP_ADDRESSMODE;
      this.textures.set(key, texture);
    }
    // Diffuse texture is multiplied by the unlit emissive tint; an emissive texture
    // would be added to the tint and wash the whole sky out to white.
    this.material.diffuseTexture = texture;
  }
}
