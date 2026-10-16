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
import { createFallingPetals } from './petals';
import { SPAWN } from './town/layout';
import { buildTown, type Town } from './town/build';
import { roadClearance, roadsW } from './town/site';

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

const VIEWS = ['overview', 'street', 'summit', 'platform', 'alley', 'ref1', 'ref2', 'ref3', 'ref4', 'ref5'] as const;
type View = (typeof VIEWS)[number] | 'default';

/** Eye height of a standing person (≈1.5 m) for the eye-level comparison shots. */
const EYE = 19;

function eyeLevel(camera: ArcRotateCamera, eye: Vector3, target: Vector3): void {
  camera.upperBetaLimit = Math.PI / 2 + 0.3;
  camera.setTarget(target);
  camera.setPosition(eye);
}

/**
 * Eye-level shot on the sidewalk in front of a named shop, looking along its frontage with the shop on the left
 * (the composition of the reference shop-street images). `look` overrides the point looked at.
 */
function shopfrontView(camera: ArcRotateCamera, town: Town, id: string, look?: (eye: Vector3) => Vector3): boolean {
  const s = town.spots[id];
  if (!s) return false;
  const rx = s.fz; // local right (facing out of the front)
  const rz = -s.fx;
  const fcx = s.x + s.fx * s.hv;
  const fcz = s.z + s.fz * s.hv;
  const d = roadClearance(fcx, fcz).d; // front of the shop to the road edge
  const v = s.hv + Math.min(Math.max(d * 0.5, 12), 24); // stay on the shop side of the street trees
  const ex = s.x + s.fx * v + rx * s.hu * 0.8;
  const ez = s.z + s.fz * v + rz * s.hu * 0.8;
  const eye = new Vector3(ex, town.heightAt(ex, ez) + EYE, ez);
  const tx = s.x + s.fx * (s.hv + 4) - rx * s.hu * 1.5;
  const tz = s.z + s.fz * (s.hv + 4) - rz * s.hu * 1.5;
  eyeLevel(camera, eye, look ? look(eye) : new Vector3(tx, eye.y - 1.5, tz));
  return true;
}

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
    case 'ref1': // shop street: the sidewalk in front of the Japanese sweets shop
      shopfrontView(camera, town, 'e-wagashi');
      break;
    case 'ref2': {
      // convenience store at the corner, the plaza cherries and the station behind
      const s = town.spots['w-conbini'];
      if (!s) break;
      // stand at the end of the frontage farther from the station, looking towards the station front
      const rx = s.fz;
      const rz = -s.fx;
      const far = Math.hypot(s.x + rx * s.hu, s.z + rz * s.hu - 600) > Math.hypot(s.x - rx * s.hu, s.z - rz * s.hu - 600) ? 1 : -1;
      const v = s.hv + 26;
      const ex = s.x + s.fx * v + rx * s.hu * 0.95 * far;
      const ez = s.z + s.fz * v + rz * s.hu * 0.95 * far;
      const eye = new Vector3(ex, groundY(ex, ez) + EYE, ez);
      eyeLevel(camera, eye, new Vector3(30, eye.y + 4, 600));
      break;
    }
    case 'ref3': {
      // the station entrance (the ticket gates will be inside)
      const eye = new Vector3(-36, groundY(-36, 560) + EYE, 560);
      eyeLevel(camera, eye, new Vector3(6, eye.y + 2, 640));
      break;
    }
    case 'ref4': {
      // cherry avenue: the sidewalk of the street from the plaza to the mountain, looking towards the mountain
      const r = roadsW.find((w) => w.id === 'mountain-street');
      if (!r) break;
      const p0 = r.pts[0]!;
      const p1 = r.pts[r.pts.length - 1]!;
      const l = Math.hypot(p1.x - p0.x, p1.z - p0.z);
      const dx = (p1.x - p0.x) / l;
      const dz = (p1.z - p0.z) / l;
      const off = r.width / 2 + 8;
      const ex = p0.x + dx * 420 - dz * off;
      const ez = p0.z + dz * 420 + dx * off;
      const eye = new Vector3(ex, groundY(ex, ez) + EYE, ez);
      eyeLevel(camera, eye, new Vector3(ex + dx * 120 + dz * 12, eye.y + 3, ez + dz * 120 - dx * 12));
      break;
    }
    case 'ref5': // cafe terrace on the shop street
      shopfrontView(camera, town, 'w-cafe');
      break;
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
  createFallingPetals(scene);
  const town = buildTown(scene);
  for (const line of town.report) console.info(`[town] ${line}`);

  scene.metadata = { ...(scene.metadata ?? {}), town };
  const q = new URLSearchParams(location.search).get('view');
  const view: View = (VIEWS as readonly string[]).includes(q ?? '') ? (q as View) : 'default';
  applyView(camera, scene, town, view);

  return { scene, camera, town };
}
