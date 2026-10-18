import './discovery-vistas.css';
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera.js';
import type { Camera } from '@babylonjs/core/Cameras/camera.js';
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh.js';
import type { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import type { Scene } from '@babylonjs/core/scene.js';
import '@babylonjs/core/PostProcesses/RenderPipeline/postProcessRenderPipelineManagerSceneComponent.js';
import { MeshBatch } from '../town/batch';
import type { Town } from '../town/build';
import type { V3 } from '../town/util';
import type { MapPlace } from './map';
import { createWalkingSegmentCheck } from './routes';
import { coastS, coastZ, SEA_Y } from '../town/heights';

export type VistaId = 'plaza' | 'beach' | 'summit';
export interface VistaSpot extends MapPlace { id: VistaId; caption: string }
interface Position { x: number; y: number; z: number }
export interface DiscoveryVistaOptions {
  subject?: AbstractMesh;
  /** The owner pauses walking, its clock, and ordinary camera controls while active. */
  onActiveChange?: (active: boolean) => void;
  completionIds?: Partial<Record<VistaId, string>>;
}

const COPY: Record<VistaId, { name: string; caption: string }> = {
  plaza: { name: '桜の下で、ひと呼吸', caption: '花びらの向こうに、いつもの街。' },
  beach: { name: '海のひろがりを、眺める', caption: '急がずに、波の届くところまで。' },
  summit: { name: '歩いた街を、見渡す', caption: 'ここまでの道も、景色の一部。' },
};
const isVista = (id: string): id is VistaId => id === 'plaza' || id === 'beach' || id === 'summit';
const HIDDEN_SUBJECT_LAYER = 0x20000000;

/** Three hand-painted waymarks share one atlas and stay low enough to walk across. */
function paintWaymarks(scene: Scene): DynamicTexture {
  const texture = new DynamicTexture('vista-waymark-atlas', { width: 768, height: 256 }, scene, true);
  const g = texture.getContext() as CanvasRenderingContext2D;
  const ink = ['#6e6557', '#476f74', '#666550'];
  const paper = ['#eee5d5', '#e1e8df', '#e5e1ce'];
  for (let i = 0; i < 3; i++) {
    g.save(); g.translate(i * 256, 0);
    g.fillStyle = paper[i]!; g.fillRect(0, 0, 256, 256);
    g.strokeStyle = ink[i]!; g.lineWidth = 2; g.strokeRect(11, 11, 234, 234);
    g.strokeStyle = `${ink[i]}55`; g.strokeRect(17, 17, 222, 222);
    if (i === 0) {
      g.fillStyle = '#a77d77';
      for (let k = 0; k < 5; k++) {
        g.save(); g.translate(128, 110); g.rotate(k * Math.PI * .4);
        g.beginPath(); g.ellipse(0, -26, 17, 31, 0, 0, Math.PI * 2); g.fill(); g.restore();
      }
      g.fillStyle = '#ddbd82'; g.beginPath(); g.arc(128, 110, 8, 0, Math.PI * 2); g.fill();
    } else if (i === 1) {
      g.strokeStyle = '#638e93'; g.lineWidth = 4;
      for (let y = 115; y < 153; y += 17) {
        g.beginPath(); g.moveTo(53, y); g.bezierCurveTo(83, y - 19, 102, y + 19, 128, y); g.bezierCurveTo(156, y - 19, 176, y + 19, 203, y); g.stroke();
      }
      g.fillStyle = '#71877d'; g.beginPath(); g.moveTo(128, 45); g.lineTo(110, 90); g.lineTo(128, 81); g.lineTo(146, 90); g.closePath(); g.fill();
    } else {
      g.strokeStyle = '#818475'; g.lineWidth = 3;
      g.beginPath(); g.arc(128, 109, 54, 0, Math.PI * 2); g.stroke();
      g.fillStyle = '#727963'; g.beginPath(); g.moveTo(128, 51); g.lineTo(114, 123); g.lineTo(128, 111); g.lineTo(143, 123); g.closePath(); g.fill();
      g.font = '20px serif'; g.textAlign = 'center'; g.fillText('北', 128, 43); g.fillText('東', 198, 115); g.fillText('西', 58, 115);
      g.fillText('街 と 海', 128, 167);
    }
    g.font = '600 21px serif'; g.textAlign = 'center'; g.fillStyle = ink[i]!;
    g.fillText(['桜 の ひ ろ ば', '潮 風 の 散 歩 道', '山 頂 の 展 望 台'][i]!, 128, 213);
    g.restore();
  }
  texture.update(); return texture;
}

function placeMarkers(scene: Scene, town: Pick<Town, 'root' | 'heightAt' | 'obstacles'>, spots: readonly VistaSpot[]): { meshes: Mesh[]; gifts: Partial<Record<VistaId, Mesh>>; materials: StandardMaterial[] } {
  const plain = new StandardMaterial('vista-keepsake-material', scene); plain.diffuseColor = Color3.White(); plain.specularColor = Color3.Black();
  const illustrated = new StandardMaterial('vista-waymark-material', scene); illustrated.diffuseTexture = paintWaymarks(scene); illustrated.specularColor = Color3.Black();
  const frames = new MeshBatch(), pictures = new MeshBatch(true), gifts: Partial<Record<VistaId, Mesh>> = {};
  for (const spot of spots) {
    const tile = spot.id === 'plaza' ? 0 : spot.id === 'beach' ? 1 : 2;
    // The marker follows the existing floor without adding an obstacle or changing its height.
    const centerHeight = town.heightAt(spot.x, spot.z);
    const corner = (x: number, z: number, lift: number): V3 => [spot.x + x, spot.y + town.heightAt(spot.x + x, spot.z + z) - centerHeight + lift, spot.z + z];
    frames.quad(corner(-10, -10, .7), corner(10, -10, .7), corner(10, 10, .7), corner(-10, 10, .7), [.49, .40, .29], [0, 1, 0]);
    pictures.quad(corner(-9, -9, .73), corner(9, -9, .73), corner(9, 9, .73), corner(-9, 9, .73), [1, 1, 1], [0, 1, 0], [[(tile + .01) / 3, .01], [(tile + .99) / 3, .01], [(tile + .99) / 3, .99], [(tile + .01) / 3, .99]]);
    if (spot.id === 'summit') continue;
    const gift = new MeshBatch(), x = spot.x + 8, z = spot.z + 7, y = spot.y + .9;
    if (spot.id === 'plaza') {
      // A small laid bouquet: stems, a paper tie and three flowers, below ankle height.
      for (const dx of [-1.6, 0, 1.6]) {
        gift.box(x + dx - .18, x + dx + .18, y, y + .35, z - 4, z + 1, [.34, .49, .31]);
        for (let p = 0; p < 5; p++) {
          const angle = p * Math.PI * .4;
          gift.disc(x + dx + Math.cos(angle) * .85, z + 1 + dx * .4 + Math.sin(angle) * .85, y + .5, .85, .6, 6, dx === 0 ? [.88, .71, .70] : [.97, .87, .82]);
        }
        gift.disc(x + dx, z + 1 + dx * .4, y + .53, .35, .35, 6, [.87, .70, .32]);
      }
      gift.box(x - 2.3, x + 2.3, y + .3, y + .6, z - 2.5, z - 1.3, [.88, .78, .61]);
    } else {
      // Three ridged shells are placed here after the seaside story, with no collectible collision.
      for (let shell = 0; shell < 3; shell++) {
        const sx = x + shell * 2.2 - 2.2, sz = z + (shell % 2) * 2;
        for (let ridge = 0; ridge < 8; ridge++) {
          const a = Math.PI + ridge * Math.PI / 8, b = Math.PI + (ridge + 1) * Math.PI / 8;
          gift.tri([sx, y + .3, sz], [sx + Math.cos(a) * 1.8, y + .6, sz + Math.sin(a) * 2.4], [sx + Math.cos(b) * 1.8, y + .6, sz + Math.sin(b) * 2.4], ridge % 2 ? [.88, .74, .65] : [.98, .88, .77], [0, 1, 0]);
        }
      }
    }
    const mesh = gift.toMesh(`vista-keepsake-${spot.id}`, scene, plain);
    mesh.parent = town.root; mesh.isPickable = false; mesh.setEnabled(false); gifts[spot.id] = mesh;
  }
  const meshes: Mesh[] = [];
  if (!frames.empty) meshes.push(frames.toMesh('vista-waymark-frames', scene, plain));
  if (!pictures.empty) meshes.push(pictures.toMesh('vista-waymark-pictures', scene, illustrated));
  for (const mesh of meshes) { mesh.parent = town.root; mesh.isPickable = false; }
  return { meshes: [...meshes, ...Object.values(gifts)], gifts, materials: [plain, illustrated] };
}

/** An explicit, reversible scenic pause. It never teleports the player or starts on proximity. */
export class DiscoveryVistas {
  readonly spots: readonly VistaSpot[];
  private readonly camera: FreeCamera;
  private readonly markers: ReturnType<typeof placeMarkers>;
  private readonly toolbar = document.createElement('div');
  private readonly title = document.createElement('strong');
  private readonly caption = document.createElement('span');
  private readonly close = document.createElement('button');
  private readonly listeners = new AbortController();
  private readonly clearSegment: ReturnType<typeof createWalkingSegmentCheck>;
  private previousCamera: Camera | null = null;
  private previousFocus: HTMLElement | null = null;
  private subjectMasks: { mesh: AbstractMesh; mask: number }[] = [];
  private pipelines: string[] = [];
  private active: VistaId | null = null;
  private disposed = false;

  constructor(private readonly scene: Scene, town: Pick<Town, 'root' | 'heightAt' | 'obstacles'>, places: readonly MapPlace[], private readonly options: DiscoveryVistaOptions = {}) {
    this.clearSegment = createWalkingSegmentCheck(town.obstacles, town.heightAt, (x, z) => coastS(x, z) < -8);
    this.spots = places.filter(p => isVista(p.id)).map(p => ({ ...p, id: p.id as VistaId, caption: COPY[p.id as VistaId].caption }));
    this.markers = placeMarkers(scene, town, this.spots);
    this.camera = new FreeCamera('discovery-vista-camera', Vector3.Zero(), scene);
    this.camera.inputs.clear(); this.camera.inputs.addMouse(true);
    this.camera.angularSensibility = 3500; this.camera.minZ = .6; this.camera.maxZ = 40000; this.camera.fov = .82;
    this.toolbar.className = 'life-vista-toolbar'; this.toolbar.hidden = true; this.toolbar.setAttribute('role', 'region'); this.toolbar.setAttribute('aria-label', '景色を眺めています');
    const copy = document.createElement('div'); copy.className = 'life-vista-copy'; copy.append(this.title, this.caption);
    this.close.className = 'life-vista-return'; this.close.type = 'button'; this.close.textContent = '街歩きに戻る'; this.close.setAttribute('aria-keyshortcuts', 'Escape');
    this.toolbar.append(copy, this.close); document.body.append(this.toolbar);
    this.close.addEventListener('click', () => this.restore(), { signal: this.listeners.signal });
    window.addEventListener('keydown', event => {
      if (!this.active || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.code === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); this.restore(); }
      else if (['Tab', 'Enter', 'Space'].includes(event.code)) {
        if (event.code === 'Tab') { event.preventDefault(); this.close.focus(); }
      } else if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyE', 'KeyI', 'KeyJ', 'KeyM'].includes(event.code)) {
        event.preventDefault(); event.stopImmediatePropagation();
      }
    }, { capture: true, signal: this.listeners.signal });
    scene.onDisposeObservable.addOnce(() => this.dispose());
  }

  get activeId(): VistaId | null { return this.active; }

  nearest(position: Position): VistaSpot | undefined {
    if (![position.x, position.y, position.z].every(Number.isFinite)) return undefined;
    return this.spots.filter(spot => Math.hypot(spot.x - position.x, spot.z - position.z) <= 55
      && Math.abs(spot.y - position.y) < 16 && this.clearSegment(position, spot))
      .sort((a, b) => Math.hypot(a.x - position.x, a.z - position.z) - Math.hypot(b.x - position.x, b.z - position.z))[0];
  }

  activate(id: string, position: Position): boolean {
    if (this.disposed || this.active || this.scene.activeCameras?.length) return false;
    const spot = this.nearest(position); if (!spot || spot.id !== id || !this.scene.activeCamera) return false;
    const old = this.scene.activeCamera;
    this.previousCamera = old; this.previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // Frame the actual place, not just its compass direction. The deck's visual floor
    // sits above terrain height; looking from terrain + 20 puts the rail at eye level.
    // Only the view is raised. The player's position and the saved walking position stay put.
    const eye = spot.id === 'summit' ? Math.max(position.y, spot.y) + 42 : position.y + 24;
    this.camera.position.set(position.x, eye, position.z);
    this.camera.fov = spot.id === 'summit' ? .70 : spot.id === 'beach' ? .86 : .82;
    const target = spot.id === 'summit' ? new Vector3(0, 80, 650)
      // Look along the curved shoreline with sea on the left and sand on the right.
      : spot.id === 'beach' ? new Vector3(position.x + 600, SEA_Y + 2, coastZ(position.x + 600) - 12)
        // The festival booth is due north. The north-west grove and a path-side bench
        // provide a foreground, a cherry canopy and the town beyond without that obstruction.
        : new Vector3(spot.x - 270, spot.y + 46, spot.z + 185);
    this.camera.setTarget(target); this.camera.layerMask = old.layerMask & ~HIDDEN_SUBJECT_LAYER;
    if (this.options.subject) this.subjectMasks = [this.options.subject, ...this.options.subject.getChildMeshes()].map(mesh => {
      const mask = mesh.layerMask; mesh.layerMask = HIDDEN_SUBJECT_LAYER; return { mesh, mask };
    });
    this.pipelines = this.scene.postProcessRenderPipelineManager.supportedPipelines.filter(pipe => pipe.name === 'post' || pipe.name === 'ao').map(pipe => pipe.name);
    for (const name of this.pipelines) this.scene.postProcessRenderPipelineManager.attachCamerasToRenderPipeline(name, this.camera, true);
    this.scene.activeCamera = this.camera; this.active = spot.id;
    this.title.textContent = COPY[spot.id].name; this.caption.textContent = `${COPY[spot.id].caption} 画面をなぞって見渡せます。`;
    this.toolbar.hidden = false; document.body.classList.add('discovery-viewing'); this.close.focus({ preventScroll: true });
    try {
      this.options.onActiveChange?.(true);
      const canvas = this.scene.getEngine().getRenderingCanvas(); if (canvas) this.camera.attachControl(canvas, true);
    } catch (error) { this.restore(); throw error; }
    return true;
  }

  /** World keepsakes follow existing story progress and remain after leaving the view. */
  update(completedStoryIds: readonly string[]): void {
    const ids = this.options.completionIds ?? { plaza: 'sakura', beach: 'sea' };
    for (const id of ['plaza', 'beach'] as const) this.markers.gifts[id]?.setEnabled(!!ids[id] && completedStoryIds.includes(ids[id]!));
  }

  restore(): void {
    if (!this.active) return;
    this.active = null;
    this.camera.detachControl();
    if (this.scene.activeCamera === this.camera) this.scene.activeCamera = this.previousCamera;
    this.previousCamera = null;
    const available = new Set(this.scene.postProcessRenderPipelineManager.supportedPipelines.map(pipe => pipe.name));
    for (const name of this.pipelines) if (available.has(name)) this.scene.postProcessRenderPipelineManager.detachCamerasFromRenderPipeline(name, this.camera);
    this.pipelines = [];
    for (const { mesh, mask } of this.subjectMasks) if (!mesh.isDisposed()) mesh.layerMask = mask;
    this.subjectMasks = []; this.toolbar.hidden = true; document.body.classList.remove('discovery-viewing');
    this.options.onActiveChange?.(false);
    if (this.previousFocus?.isConnected) this.previousFocus.focus({ preventScroll: true });
    this.previousFocus = null;
  }

  dispose(): void {
    if (this.disposed) return;
    this.restore(); this.disposed = true; this.listeners.abort(); this.toolbar.remove(); this.camera.dispose();
    for (const mesh of this.markers.meshes) mesh.dispose();
    for (const material of this.markers.materials) material.dispose(false, true);
  }
}
