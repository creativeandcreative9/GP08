import {
  ArcRotateCamera,
  Color3,
  Color4,
  DirectionalLight,
  type Engine,
  HemisphericLight,
  Mesh,
  MeshBuilder,
  Scene,
  StandardMaterial,
  Vector3,
  VertexBuffer,
} from '@babylonjs/core';
import { SPAWN } from './town/layout';
import { buildTown, type Town } from './town/build';

export interface GameScene {
  scene: Scene;
  camera: ArcRotateCamera;
  town: Town;
}

const HORIZON = new Color3(0.8, 0.91, 0.99);
const ZENITH = new Color3(0.27, 0.56, 0.93);

/** Gradient sky dome that follows the camera. */
function createSky(scene: Scene): Mesh {
  const sky = MeshBuilder.CreateSphere('sky', { diameter: 56000, segments: 24, sideOrientation: Mesh.BACKSIDE }, scene);
  const pos = sky.getVerticesData(VertexBuffer.PositionKind)!;
  const colors: number[] = [];
  for (let i = 0; i < pos.length; i += 3) {
    const e = Math.max(0, pos[i + 1]! / 28000);
    const t = Math.pow(Math.min(1, e * 1.35), 0.62);
    colors.push(
      HORIZON.r + (ZENITH.r - HORIZON.r) * t,
      HORIZON.g + (ZENITH.g - HORIZON.g) * t,
      HORIZON.b + (ZENITH.b - HORIZON.b) * t,
      1,
    );
  }
  sky.setVerticesData(VertexBuffer.ColorKind, colors);
  const m = new StandardMaterial('skyMat', scene);
  m.disableLighting = true;
  m.diffuseColor = Color3.Black();
  m.specularColor = Color3.Black();
  m.emissiveColor = Color3.White();
  m.backFaceCulling = false;
  m.fogEnabled = false;
  sky.material = m;
  sky.infiniteDistance = true;
  sky.isPickable = false;
  sky.applyFog = false;
  sky.alwaysSelectAsActiveMesh = true;
  return sky;
}

type View = 'overview' | 'street' | 'summit' | 'default';

function applyView(camera: ArcRotateCamera, scene: Scene, town: Town, view: View): void {
  const groundY = (x: number, z: number): number => town.heightAt(x, z);
  camera.upperBetaLimit = Math.PI / 2 - 0.03;
  switch (view) {
    case 'overview':
      scene.fogDensity = 0.000013;
      scene.getMeshByName('clouds')?.setEnabled(false); // the camera is above them
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
  scene.fogDensity = 0.00005;

  const camera = new ArcRotateCamera('camera', -Math.PI / 2, Math.PI / 3, 40, new Vector3(0, 2, 0), scene);
  camera.minZ = 1;
  camera.maxZ = 40000;
  camera.lowerRadiusLimit = 5;
  camera.upperRadiusLimit = 30000;
  camera.wheelDeltaPercentage = 0.012;
  camera.pinchDeltaPercentage = 0.01;
  camera.panningSensibility = 40;
  camera.attachControl(canvas, true);

  // Spring daylight: sky-blue ambient, warm sun from the south-east.
  const hemi = new HemisphericLight('hemi', new Vector3(0, 1, 0), scene);
  hemi.intensity = 0.8;
  hemi.diffuse = new Color3(1, 0.985, 0.975);
  hemi.groundColor = new Color3(0.84, 0.78, 0.78);
  hemi.specular = Color3.Black();
  const sun = new DirectionalLight('sun', new Vector3(-0.55, -0.75, 0.5).normalize(), scene);
  sun.intensity = 0.62;
  sun.diffuse = new Color3(1, 0.94, 0.82);
  sun.specular = new Color3(0.3, 0.3, 0.28);

  createSky(scene);
  const town = buildTown(scene);
  for (const line of town.report) console.info(`[town] ${line}`);

  const q = new URLSearchParams(location.search).get('view');
  const view: View = q === 'overview' || q === 'street' || q === 'summit' ? q : 'default';
  applyView(camera, scene, town, view);

  return { scene, camera, town };
}
