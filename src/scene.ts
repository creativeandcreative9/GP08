import {
  ArcRotateCamera,
  Color3,
  Color4,
  DirectionalLight,
  type Engine,
  HemisphericLight,
  Scene,
  Vector3,
} from '@babylonjs/core';
import { createFallingPetals } from './petals';
import { LIGHT, setupRendering, type Rendering } from './render';
import { createSky, HORIZON } from './sky';
import { applySurfaceDetail } from './surface';
import { SPAWN } from './town/layout';
import { buildTown, type Town } from './town/build';
import { EYE, evalPoses } from './town/evalcams';

export interface GameScene {
  scene: Scene;
  camera: ArcRotateCamera;
  town: Town;
  rendering: Rendering;
}

const VIEWS = ['overview', 'street', 'summit', 'platform', 'alley', 'ref1', 'ref2', 'ref3', 'ref4', 'ref5'] as const;
type View = (typeof VIEWS)[number] | 'default';

function eyeLevel(camera: ArcRotateCamera, eye: Vector3, target: Vector3): void {
  camera.upperBetaLimit = Math.PI / 2 + 0.3;
  camera.setTarget(target);
  camera.setPosition(eye);
}

function applyView(camera: ArcRotateCamera, scene: Scene, town: Town, view: View): void {
  const groundY = (x: number, z: number): number => town.heightAt(x, z);
  camera.upperBetaLimit = Math.PI / 2 - 0.03;
  switch (view) {
    case 'overview':
      scene.fogDensity = 0.000013;
      scene.getTransformNodeByName('clouds')?.setEnabled(false); // the camera is above them
      camera.setTarget(new Vector3(250, 0, -250));
      camera.alpha = -Math.PI / 2 - 0.1;
      camera.beta = 0.5;
      camera.radius = 9300;
      break;
    case 'street': {
      const eye = new Vector3(SPAWN.x, groundY(SPAWN.x, SPAWN.z) + 18, SPAWN.z);
      camera.upperBetaLimit = Math.PI / 2 + 0.3;
      camera.setTarget(new Vector3(eye.x, eye.y, eye.z + 40));
      camera.setPosition(eye);
      break;
    }
    case 'platform': {
      // standing on the near platform, looking west along the track
      const eye = new Vector3(330, groundY(330, 745) + 18, 745);
      camera.upperBetaLimit = Math.PI / 2 + 0.3;
      camera.setTarget(new Vector3(eye.x - 40, eye.y - 3, eye.z + 6));
      camera.setPosition(eye);
      break;
    }
    case 'alley': {
      // standing in a dead-end back alley, looking at the open lot hidden at its end
      const l = town.alleyLookout;
      if (!l) break;
      const eye = new Vector3(l.x, groundY(l.x, l.z) + 18, l.z);
      camera.upperBetaLimit = Math.PI / 2 + 0.3;
      camera.setTarget(new Vector3(eye.x + l.dx * 40, eye.y - 4, eye.z + l.dz * 40));
      camera.setPosition(eye);
      break;
    }
    // ---- comparison shots matching the reference images (see docs/20261016_visual_eval.md) ----
    case 'ref1':
    case 'ref2':
    case 'ref3':
    case 'ref4':
    case 'ref5': {
      const pose = evalPoses(town.spots)[view];
      if (!pose) break;
      const eye = new Vector3(pose.x, groundY(pose.x, pose.z) + EYE, pose.z);
      if (view === 'ref3') camera.fov = 1.05;
      eyeLevel(camera, eye, new Vector3(pose.tx, eye.y + pose.dy, pose.tz));
      break;
    }
    case 'summit': {
      const d = town.summitDeck;
      const eye = new Vector3(d.x - 14, d.y + 18, d.z - 10);
      camera.upperBetaLimit = Math.PI / 2 + 0.3;
      // look towards the plaza: north-east over the town and the sea
      const dir = new Vector3(-eye.x, 0, -eye.z).normalize();
      camera.setTarget(new Vector3(eye.x + dir.x * 28, eye.y - 6.5, eye.z + dir.z * 28));
      camera.setPosition(eye);
      break;
    }
    default:
      camera.setTarget(new Vector3(80, 0, 520));
      camera.alpha = -2.05;
      camera.beta = 1.0;
      camera.radius = 1750;
      break;
  }
}

/** Build the town scene. Later modules can extend the returned scene. */
export function createScene(engine: Engine, canvas: HTMLCanvasElement): GameScene {
  const scene = new Scene(engine);
  scene.clearColor = new Color4(HORIZON.r, HORIZON.g, HORIZON.b, 1);
  scene.fogMode = Scene.FOGMODE_EXP2;
  scene.fogColor = new Color3(HORIZON.r, HORIZON.g, HORIZON.b);
  scene.fogDensity = 0.0001;

  const camera = new ArcRotateCamera('camera', -Math.PI / 2, Math.PI / 3, 40, new Vector3(0, 2, 0), scene);
  camera.minZ = 1;
  camera.maxZ = 40000;
  camera.lowerRadiusLimit = 5;
  camera.upperRadiusLimit = 30000;
  camera.wheelDeltaPercentage = 0.012;
  camera.pinchDeltaPercentage = 0.01;
  camera.panningSensibility = 40;
  camera.attachControl(canvas, true);

  // Spring afternoon: cool sky light, warm sun from the south-east low enough for long soft shadows.
  const hemi = new HemisphericLight('hemi', new Vector3(0, 1, 0), scene);
  hemi.intensity = LIGHT.skyIntensity;
  hemi.diffuse = LIGHT.skyColor.clone();
  hemi.groundColor = LIGHT.groundColor.clone();
  hemi.specular = Color3.Black();
  const sun = new DirectionalLight('sun', new Vector3(-0.6, -0.62, 0.55).normalize(), scene);
  sun.intensity = LIGHT.sunIntensity;
  sun.diffuse = LIGHT.sunColor.clone();
  sun.specular = new Color3(0.3, 0.3, 0.28);

  createSky(scene);
  createFallingPetals(scene);
  const town = buildTown(scene);
  for (const line of town.report) console.info(`[town] ${line}`);

  // town geometry casts and receives sun shadows; signs, decals and the terrain only receive them
  const townMeshes = town.root.getChildMeshes(true);
  const casters = townMeshes.filter((m) => m.name.startsWith('town_') || m.name.startsWith('forest_'));
  const receivers = [...townMeshes.filter((m) => m.name !== 'clouds' && m.name !== 'sea'), ...scene.meshes.filter((m) => m.name === 'terrain')];
  const rendering = setupRendering(scene, camera, sun, casters, receivers);
  applySurfaceDetail(scene);

  scene.metadata = { ...(scene.metadata ?? {}), town };
  const q = new URLSearchParams(location.search).get('view');
  const view: View = (VIEWS as readonly string[]).includes(q ?? '') ? (q as View) : 'default';
  applyView(camera, scene, town, view);

  return { scene, camera, town, rendering };
}
