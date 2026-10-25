// Keep one source asset per scene. Lane minions bake each into a crowd (src/crowd.ts).
import { AnimationGroup, AssetContainer, LoadAssetContainerAsync, Quaternion, Scene } from '@babylonjs/core';
import { GLTFLoaderAnimationStartMode } from '@babylonjs/loaders/glTF';
import '@babylonjs/loaders/glTF';

const libraries = new WeakMap<Scene, Map<string, AssetContainer>>();

/** Converter padding repeats unchanged rest channels in every clip. Apply those
 * once instead of evaluating a separate runtime animation for each every frame.
 * A channel is removable only if every clip supplies the same constant value. */
export function optimizeStaticTracks(groups: readonly AnimationGroup[]): void {
  const properties = new Map<object, Map<string, { values: number[]; value: any; count: number; constant: boolean }>>();
  const valuesOf = (value: any): number[] => typeof value === 'number' ? [value] : value?.asArray?.() ?? [];
  for (const group of groups) for (const track of group.targetedAnimations) {
    const keys = track.animation.getKeys();
    if (!keys.length) continue;
    let target = properties.get(track.target);
    if (!target) { target = new Map(); properties.set(track.target, target); }
    const name = track.animation.targetProperty;
    let property = target.get(name);
    if (!property) {
      property = { values: valuesOf(keys[0].value), value: keys[0].value, count: 0, constant: true };
      target.set(name, property);
    }
    property.count++;
    for (const key of keys) {
      const values = valuesOf(key.value);
      if (!values.length || values.length !== property.values.length || values.some((v, i) => Math.abs(v - property.values[i]) > 1e-7)
        || key.inTangent || key.outTangent) { property.constant = false; break; }
    }
  }
  for (const group of groups) for (const track of [...group.targetedAnimations]) {
    const property = properties.get(track.target)?.get(track.animation.targetProperty);
    if (!property?.constant || property.count !== groups.length) continue;
    const target = track.target as Record<string, any>, name = track.animation.targetProperty;
    if (target[name]?.copyFrom) target[name].copyFrom(property.value);
    else target[name] = property.value;
    group.removeTargetedAnimation(track.animation);
  }
}

export async function preloadModels(scene: Scene, urls: string[]): Promise<void> {
  let library = libraries.get(scene);
  if (!library) { library = new Map(); libraries.set(scene, library); }
  await Promise.all([...new Set(urls)].map(async url => {
    if (library.has(url)) return;
    const asset = await LoadAssetContainerAsync(url, scene, {
      pluginOptions: { gltf: { animationStartMode: GLTFLoaderAnimationStartMode.NONE } },
    });
    optimizeStaticTracks(asset.animationGroups);
    // Classify by asset origin, so red clothing, scenery and ability effects are
    // never mistaken for enemy armor. Instances share these source materials.
    if (url.startsWith(`${import.meta.env.BASE_URL}raptures/`)) {
      for (const material of asset.materials) material.metadata = { ...material.metadata, enemyRedGlow: true };
    }
    library.set(url, asset);
  }));
}

/** A scene copy sharing the source's geometry and materials, with its own skeleton and clips. */
export function instantiateModel(scene: Scene, url: string) {
  const asset = libraries.get(scene)?.get(url);
  if (!asset) throw new Error(`Model was not preloaded: ${url}`);
  return asset.instantiateModelsToScene(name => name, false, { doNotInstantiate: true });
}

/** Pelican's SD bundle has no walk. Its lower rig matches Crawler's; reuse only
 * those channels, keeping Pelican's own upper-body pose and firing animation.
 * This runs once before crowd baking, with no extra per-unit animation work. */
export function addPelicanWalk(scene: Scene, pelicanUrl: string, crawlerUrl: string): void {
  const target = libraries.get(scene)?.get(pelicanUrl), source = libraries.get(scene)?.get(crawlerUrl);
  if (!target || !source) throw new Error('Rapture models must be preloaded before sharing locomotion');
  if (target.animationGroups.some(group => group.name === 'walk')) return;
  const idle = target.animationGroups.find(group => group.name === 'idle')!;
  const sourceWalk = source.animationGroups.find(group => group.name === 'walk')!;
  const nodes = new Map(target.transformNodes.map(node => [node.name, node]));
  const tracks = sourceWalk.targetedAnimations.filter(track => /^(pelvis_bone$|body_lower_)/.test(track.target.name));
  // q and -q encode the same orientation (the pelvis uses opposite signs).
  for (const track of tracks) {
    const from = track.target, to = nodes.get(from.name);
    if (!to || from.parent?.name !== to.parent?.name || !from.position.equalsWithEpsilon(to.position, .002)
      || !from.scaling.equalsWithEpsilon(to.scaling, .002)
      || Math.abs(Quaternion.Dot(from.rotationQuaternion, to.rotationQuaternion!)) < .9999) {
      throw new Error(`Incompatible Pelican/Crawler locomotion joint: ${from.name}`);
    }
  }
  const replacements = new Set(tracks.map(track => `${track.target.name}/${track.animation.targetProperty}`));
  // Static-track optimization ran before the new clip existed. Restore any
  // omitted lower-body channels on the original clips, otherwise a walk pose
  // could leak into the following idle/shot bake.
  for (const group of target.animationGroups) {
    for (const track of tracks) {
      const node = nodes.get(track.target.name)!;
      if (group.targetedAnimations.some(t => t.target === node && t.animation.targetProperty === track.animation.targetProperty)) continue;
      const animation = track.animation.clone();
      const value = (node as unknown as Record<string, { clone(): unknown }>)[animation.targetProperty].clone();
      const end = (group.to - group.from) / group.targetedAnimations[0].animation.framePerSecond * animation.framePerSecond;
      animation.setKeys([{ frame: 0, value }, { frame: end, value }]);
      group.addTargetedAnimation(animation, node);
    }
  }
  const walk = new AnimationGroup('walk', scene);
  const sourceFps = sourceWalk.targetedAnimations[0].animation.framePerSecond;
  const duration = (sourceWalk.to - sourceWalk.from) / sourceFps;
  for (const track of idle.targetedAnimations) {
    if (replacements.has(`${track.target.name}/${track.animation.targetProperty}`)) continue;
    const animation = track.animation.clone(), value = animation.getKeys()[0].value;
    animation.setKeys([{ frame: 0, value }, { frame: duration * animation.framePerSecond, value }]);
    walk.addTargetedAnimation(animation, track.target);
  }
  for (const track of tracks) walk.addTargetedAnimation(track.animation.clone(), nodes.get(track.target.name)!);
  walk.metadata = { source: 'Crawler mmg005 walk: shared lower-body rig', native: false };
  scene.removeAnimationGroup(walk);
  target.animationGroups.push(walk);
}
