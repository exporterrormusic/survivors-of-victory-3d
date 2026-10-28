import { ArcRotateCamera, Color3, Color4, DirectionalLight, Engine, HemisphericLight, MeshBuilder, Scene, StandardMaterial, Vector3, VertexBuffer } from '@babylonjs/core';
import { Chibi, loadChibiIndex } from '../../chibi';
import { CHARACTER_MODULES } from '../../characters';
import type { SkinDefinition } from '../profile/Skins';

/** Isolated showroom: never changes the gameplay camera, model or animation state. */
export class SkinModelPreview {
  readonly element = document.createElement('div');
  private readonly canvas = document.createElement('canvas');
  private readonly status = document.createElement('span');
  private readonly engine: Engine;
  private readonly resize: ResizeObserver;
  private active?: Scene;
  private sequence = 0;
  private disposed = false;
  private pending = 0;
  private fitCamera?: () => void;

  constructor() {
    this.element.className = 'skin-model-preview';
    this.canvas.setAttribute('aria-label', '3D skin preview. Drag to rotate. Scroll to zoom. Arrow keys rotate.');
    this.canvas.tabIndex = 0;
    this.status.className = 'skin-model-status'; this.status.setAttribute('role', 'status');
    this.element.append(this.canvas, this.status);
    this.engine = new Engine(this.canvas, true, { preserveDrawingBuffer: true, stencil: true });
    this.engine.setHardwareScalingLevel(1 / Math.min(devicePixelRatio, 2));
    this.resize = new ResizeObserver(() => { this.engine.resize(); this.fitCamera?.(); }); this.resize.observe(this.element);
    this.engine.runRenderLoop(() => this.active?.render());
  }

  async show(skin: SkinDefinition): Promise<void> {
    const sequence = ++this.sequence;
    this.active?.dispose(); this.active = undefined; this.fitCamera = undefined;
    this.status.textContent = 'LOADING MODEL...';
    delete this.element.dataset.model;
    const scene = new Scene(this.engine); this.pending++;
    scene.clearColor = new Color4(.055, .085, .115, 1);
    const camera = new ArcRotateCamera('showroom-camera', Math.PI / 2 + .35, 1.25, 5, new Vector3(0, 1, 0), scene);
    camera.attachControl(this.canvas, true); camera.panningSensibility = 0;
    camera.lowerBetaLimit = .35; camera.upperBetaLimit = 1.5; camera.wheelDeltaPercentage = .025;
    camera.keysLeft = [37]; camera.keysRight = [39]; camera.keysUp = [38]; camera.keysDown = [40];
    const fill = new HemisphericLight('showroom-fill', new Vector3(0, 1, 0), scene); fill.intensity = 1.15;
    fill.groundColor = new Color3(.32, .38, .48);
    const key = new DirectionalLight('showroom-key', new Vector3(-.4, -1, -.6), scene); key.intensity = 2;
    try {
      const index = await loadChibiIndex();
      if (this.disposed || sequence !== this.sequence) return;
      const model = CHARACTER_MODULES[skin.characterId].model!;
      const chibi = await Chibi.load(scene, index.variants[skin.id], model.aim, model.muzzle);
      if (this.disposed || sequence !== this.sequence) return;
      const clip = chibi.has('walk') ? 'walk' : chibi.has('run') ? 'run' : 'idle';
      chibi.play(clip, { loop: true, fade: 0, speed: clip === 'run' ? .65 : 1 });
      scene.onBeforeAnimationsObservable.add(() => chibi.update(Math.min(.05, this.engine.getDeltaTime() / 1000)));
      scene.render();
      // Measure posed body geometry, excluding weapons and separate accessories.
      // Whole-model bounds bias both the platform center and scale toward equipment.
      const bodyNames = new Set(chibi.meta.parts.filter(part => part.role === 'skin').map(part => part.node));
      const visibleMeshes = chibi.meshes.filter(mesh => mesh.isVisible && mesh.isEnabled());
      const bodyMeshes = visibleMeshes.filter(mesh => {
        for (let node: typeof mesh.parent = mesh; node; node = node.parent) {
          if (bodyNames.has(node.name)) return true;
        }
        return false;
      });
      const min = new Vector3(Infinity, Infinity, Infinity);
      const max = new Vector3(-Infinity, -Infinity, -Infinity);
      for (const mesh of bodyMeshes.length ? bodyMeshes : visibleMeshes) {
        mesh.computeWorldMatrix(true);
        mesh.skeleton?.prepare(true);
        mesh.refreshBoundingInfo({ applySkeleton: true, applyMorph: true });
        const box = mesh.getBoundingInfo().boundingBox;
        min.minimizeInPlace(box.minimumWorld); max.maximizeInPlace(box.maximumWorld);
      }
      const height = max.y - min.y;
      if (!Number.isFinite(height) || height <= 0) throw new Error('No visible preview body');
      // Some exports merge equipment into the skin mesh. Joint proportions are
      // the consistent reference even for those models (e.g. Heavy Arms).
      const head = chibi.joint('Bip001 Head');
      const feet = [chibi.joint('Bip001 L Foot'), chibi.joint('Bip001 R Foot')].filter(node => node !== undefined);
      head?.computeWorldMatrix(true);
      feet.forEach(foot => foot.computeWorldMatrix(true));
      const footY = Math.min(...feet.map(foot => foot.getAbsolutePosition().y));
      const bodySpan = head ? head.getAbsolutePosition().y - footY : 0;
      const useJoints = Number.isFinite(bodySpan) && bodySpan > .01;
      const scale = useJoints ? 1.35 / bodySpan : 2 / height;
      // Joint pivots sit inside shoes, not on their soles. Use vertices weighted
      // to the foot/toe bones to find actual ground contact in every posed frame.
      const soleMeshes = (bodyMeshes.length ? bodyMeshes : visibleMeshes).map(mesh => {
        const footBones = new Set(mesh.skeleton?.bones.filter(bone => /foot|toe/i.test(bone.name)).map(bone => bone.getIndex()));
        const indices = mesh.getVerticesData(VertexBuffer.MatricesIndicesKind);
        const weights = mesh.getVerticesData(VertexBuffer.MatricesWeightsKind);
        const vertices: number[] = [];
        if (indices && weights) {
          for (let vertex = 0; vertex < mesh.getTotalVertices(); vertex++) {
            let weight = 0;
            for (let influence = 0; influence < 4; influence++) {
              const offset = vertex * 4 + influence;
              if (footBones.has(indices[offset])) weight += weights[offset];
            }
            if (weight > .25) vertices.push(vertex * 3);
          }
        }
        return { mesh, vertices };
      }).filter(source => source.vertices.length);
      const point = new Vector3();
      chibi.root.scaling.setAll(scale);
      // The pelvis stays over the platform even when the source clip translates.
      // Ground the lowest sole while preserving the relative motion of each foot.
      const pelvis = chibi.joint(chibi.meta.hips.split('/').pop()!);
      const anchor = pelvis ?? chibi.joint('Bip001 Pelvis');
      chibi.root.position.set(0, -min.y * scale, 0);
      const centerBody = () => {
        chibi.root.computeWorldMatrix(true);
        if (anchor) {
          anchor.computeWorldMatrix(true);
          const position = anchor.getAbsolutePosition();
          chibi.root.position.x -= position.x;
          chibi.root.position.z -= position.z;
        } else {
          chibi.root.position.x = -(min.x + max.x) * .5 * scale;
          chibi.root.position.z = -(min.z + max.z) * .5 * scale;
        }
        chibi.root.computeWorldMatrix(true);
        let soleY = Infinity;
        for (const { mesh, vertices } of soleMeshes) {
          mesh.computeWorldMatrix(true);
          mesh.skeleton?.prepare(true);
          const positions = mesh.getPositionData(true, true);
          if (!positions) continue;
          for (const offset of vertices) {
            Vector3.TransformCoordinatesFromFloatsToRef(positions[offset], positions[offset + 1], positions[offset + 2], mesh.getWorldMatrix(), point);
            soleY = Math.min(soleY, point.y);
          }
        }
        if (!Number.isFinite(soleY)) {
          for (const mesh of bodyMeshes.length ? bodyMeshes : visibleMeshes) {
            mesh.computeWorldMatrix(true);
            mesh.skeleton?.prepare(true);
            mesh.refreshBoundingInfo({ applySkeleton: true, applyMorph: true });
            soleY = Math.min(soleY, mesh.getBoundingInfo().boundingBox.minimumWorld.y);
          }
        }
        if (Number.isFinite(soleY)) chibi.root.position.y += .005 - soleY;
        chibi.root.computeWorldMatrix(true);
      };
      centerBody();
      scene.onAfterAnimationsObservable.add(centerBody);
      camera.target.set(0, 1, 0);
      camera.minZ = .01; camera.maxZ = 1000;
      let fittedRadius = 0;
      this.fitCamera = () => {
        const zoom = fittedRadius ? camera.radius / fittedRadius : 1;
        // Same close body framing for every skin, adjusted for narrow panels.
        fittedRadius = 4.8 * Math.max(1, .8 / this.engine.getAspectRatio(camera));
        camera.radius = fittedRadius * zoom;
        camera.lowerRadiusLimit = fittedRadius * .6;
        camera.upperRadiusLimit = fittedRadius * 1.8;
      };
      const plinth = MeshBuilder.CreateCylinder('display-plinth', { diameter: 2.5, height: .07, tessellation: 80 }, scene);
      plinth.position.set(0, -.035, 0);
      const material = new StandardMaterial('plinth', scene); material.disableLighting = true; material.emissiveColor = new Color3(.10, .16, .20); material.specularColor = Color3.Black(); plinth.material = material;
      this.active = scene; this.engine.resize(); this.fitCamera();
      this.status.textContent = 'DRAG TO ROTATE / SCROLL TO ZOOM';
      this.element.dataset.model = skin.id; this.element.dataset.animation = clip;
    } catch {
      if (!this.disposed && sequence === this.sequence) this.status.textContent = 'Preview unavailable. Select another appearance to retry.';
    } finally {
      this.pending--;
      if (this.active !== scene) scene.dispose();
      if (this.disposed && this.pending === 0) this.engine.dispose();
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true; this.sequence++; this.resize.disconnect();
    this.engine.stopRenderLoop(); this.active?.dispose(); this.active = undefined;
    if (this.pending === 0) this.engine.dispose();
    this.element.remove();
  }
}
