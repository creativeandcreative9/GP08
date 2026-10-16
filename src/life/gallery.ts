import { Color3, MeshBuilder, StandardMaterial, Vector3, type ArcRotateCamera, type Scene } from '@babylonjs/core';
import type { Rendering } from '../render';
import { MeshBatch } from '../town/batch';
import { buildWheel, CAR_KINDS } from './carmodels';
import { Instances, lifeMaterial, setPart, setPose } from './inst';
import { buildDog } from './animals';
import { OUTFITS, STAFF } from './outfits';
import { FusedSet, PersonSet, SeatedSet } from './personset';

/**
 * Debug views for looking at the models up close (not used by the game): the cast and the cars are put in a row high
 * above the town against the sky.
 *   ?lifeshow=cars&galrow=N&galview=V    car type N (V: 0 three-quarter front, 1 three-quarter rear, 2 side, 3 front, 4 rear)
 *   ?lifeshow=people&galview=V&galphase=P   everybody, standing (P = 0) or mid-stride (P = a walk phase in radians)
 */

const GALLERY_Y = 900;

function galleryGround(scene: Scene): void {
  const ground = MeshBuilder.CreateGround('lifeGalleryGround', { width: 900, height: 900 }, scene);
  ground.position.set(0, GALLERY_Y - 0.2, 0);
  const gm = new StandardMaterial('lifeGalleryMat', scene);
  gm.diffuseColor = new Color3(0.55, 0.57, 0.6);
  gm.specularColor = Color3.Black();
  ground.material = gm;
  ground.receiveShadows = true;
}

function galleryCamera(scene: Scene, target: Vector3, alpha: number, beta: number, radius: number): void {
  scene.onBeforeRenderObservable.addOnce(() => {
    const cam = scene.activeCamera as ArcRotateCamera;
    cam.upperBetaLimit = Math.PI;
    cam.lowerRadiusLimit = 1;
    cam.setTarget(target);
    cam.alpha = alpha;
    cam.beta = beta;
    cam.radius = radius;
  });
}

export function carGallery(scene: Scene, rendering: Rendering, rowInView: number, view: number): void {
  const mat = lifeMaterial(scene);
  const Y = GALLERY_Y;
  galleryGround(scene);
  const kind = CAR_KINDS[rowInView % CAR_KINDS.length]!;
  const wb = new MeshBatch();
  buildWheel(wb);
  const wheels = new Instances(`gal_wheel_${kind.id}`, wb, mat, scene, kind.palettes.length * 4);
  rendering.addShadowCaster(wheels.mesh);
  let verts = wheels.vertexCount;
  kind.palettes.forEach((pal, i) => {
    const b = new MeshBatch();
    kind.build(b, pal);
    const inst = new Instances(`gal_car_${kind.id}_${i}`, b, mat, scene, 1);
    verts += inst.vertexCount;
    rendering.addShadowCaster(inst.mesh);
    const x = i === 0 ? 0 : i * 60 - 60;
    const z = i === 0 ? 0 : 55;
    setPose(inst.data, 0, x, Y, z, 0);
    inst.upload();
    let w = i * 4;
    for (const sx of [-1, 1]) {
      for (const az of [kind.axle.front, kind.axle.rear]) {
        setPart(wheels.data, w * 16, x, Y, z, 0, 1, sx * kind.wheelX, kind.wheelR, az, 0);
        w++;
      }
    }
  });
  wheels.upload();
  console.info(`[life] gallery ${kind.id}: ${verts} vertices (${kind.palettes.length} colourways + wheel)`);
  // the camera orbits the car: alpha = pi/2 puts it in front (+z), -pi/2 behind, 0 on the car's right side
  const views: [number, number, number][] = [
    [Math.PI / 2 - 0.7, Math.PI / 2 - 0.2, 100],
    [-Math.PI / 2 - 0.7, Math.PI / 2 - 0.2, 100],
    [0, Math.PI / 2 - 0.1, 110],
    [Math.PI / 2, Math.PI / 2 - 0.1, 100],
    [-Math.PI / 2, Math.PI / 2 - 0.1, 100],
  ];
  const v = views[view % views.length]!;
  galleryCamera(scene, new Vector3(0, Y + 8, 0), v[0], v[1], v[2]);
}

export function peopleGallery(scene: Scene, rendering: Rendering, view: number, phase: number): void {
  const mat = lifeMaterial(scene);
  const Y = GALLERY_Y;
  galleryGround(scene);
  const all = [...OUTFITS, ...Object.values(STAFF)];
  let verts = 0;
  const perRow = 7;
  all.forEach((o, i) => {
    const set = new PersonSet(scene, mat, rendering, o, 1);
    const row = Math.floor(i / perRow);
    const col = i % perRow;
    set.write(0, (col - (perRow - 1) / 2) * 15, Y, -row * 16, 0, 1, phase, phase === 0 ? 0 : 1);
    set.upload();
    verts += set.vertexCount;
  });
  // a seated person on a 6.5-high seat
  const seat = new SeatedSet(scene, mat, rendering, OUTFITS[7]!, 6.5, 1);
  seat.write(0, 60, Y + 6.5, 10, -0.5);
  seat.upload();
  verts += seat.body.vertexCount;
  // dogs: standing and mid-stride
  const dogs = new FusedSet(scene, mat, rendering, 'dog', buildDog(), 2);
  dogs.write(0, 36, Y, 22, 0.4);
  dogs.gait(1, 22, Y, 22, -0.4, 1, phase, phase === 0 ? 0 : 1);
  dogs.upload();
  verts += dogs.body.vertexCount;
  console.info(`[life] gallery people: ${all.length} outfits, ${verts} vertices`);
  const views: [number, number, number][] = [
    [Math.PI / 2 - 0.35, Math.PI / 2 - 0.12, 120],
    [-Math.PI / 2 - 0.35, Math.PI / 2 - 0.12, 120],
    [Math.PI / 2, Math.PI / 2 - 0.05, 80],
    [0, Math.PI / 2 - 0.05, 120],
  ];
  const v = views[view % views.length]!;
  galleryCamera(scene, new Vector3(0, Y + 11, -8), v[0], v[1], v[2]);
}
