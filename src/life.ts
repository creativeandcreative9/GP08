import { Color3, MeshBuilder, StandardMaterial, Vector3, type ArcRotateCamera, type Scene } from '@babylonjs/core';
import type { Rendering } from './render';
import type { Town } from './town/build';
import { MeshBatch } from './town/batch';
import { roadsW } from './town/site';
import { buildWheel, CAR_KINDS } from './life/carmodels';
import { Instances, lifeMaterial, setPart, setPose } from './life/inst';
import { Crowd, type Person } from './life/crowd';
import { OUTFITS, STAFF } from './life/outfits';
import type { Outfit } from './life/people';
import { FusedSet, PersonSet, SeatedSet } from './life/personset';
import { Traffic, type Car } from './life/traffic';

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

/**
 * Debug: `?lifeshow=cars&galrow=N&galview=V` shows car type N high above the town against the sky.
 * View 0 = three-quarter front, 1 = three-quarter rear, 2 = side, 3 = front, 4 = rear.
 */
function carGallery(scene: Scene, rendering: Rendering, rowInView: number, view: number): void {
  const mat = lifeMaterial(scene);
  const Y = GALLERY_Y;
  galleryGround(scene);
  const kind = CAR_KINDS[rowInView % CAR_KINDS.length]!;
  const wb = new MeshBatch();
  buildWheel(wb, kind.wheelR, kind.wheelW);
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

/** Debug: `?lifeshow=people&galview=V` shows the whole cast in two rows (walking pose) with a car for scale. */
function peopleGallery(scene: Scene, rendering: Rendering, view: number, phaseArg: number): void {
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
    const x = (col - (perRow - 1) / 2) * 15;
    const z = -row * 16;
    set.write(0, x, Y, z, 0, 1, phaseArg, phaseArg === 0 ? 0 : 1);
    set.upload();
    verts += set.vertexCount;
  });
  // a seated person on a 6.5-high seat
  const seat = new SeatedSet(scene, mat, rendering, OUTFITS[8]!, 6.5, 1);
  seat.write(0, 60, Y + 6.5, 10, -0.5);
  seat.upload();
  verts += seat.body.vertexCount;
  console.info(`[life] gallery people: ${all.length} outfits, ${verts} vertices`);
  const views: [number, number, number, number][] = [
    [Math.PI / 2 - 0.35, Math.PI / 2 - 0.12, 120, 0], // front, three-quarter
    [-Math.PI / 2 - 0.35, Math.PI / 2 - 0.12, 120, 0], // rear
    [Math.PI / 2, Math.PI / 2 - 0.05, 80, 0],
    [0, Math.PI / 2 - 0.05, 120, 0],
  ];
  const v = views[view % views.length]!;
  galleryCamera(scene, new Vector3(0, Y + 11, -8), v[0], v[1], v[2]);
}

/** Height of the asphalt above the terrain (the road decal layer) */
const ROAD_Y = 0.45;

const JOGGER = OUTFITS.length - 1;

interface CarSet {
  body: Instances;
  moving: boolean;
}

/**
 * Cars and people for the town: parked and driving cars, walkers, shop staff and people sitting on benches.
 * Everything is drawn with a few template meshes and thin instances; the simulation runs before every frame.
 */
export function createLife(scene: Scene, town: Town, rendering: Rendering): void {
  const q = new URLSearchParams(location.search);
  const show = q.get('lifeshow');
  if (show === 'cars') {
    carGallery(scene, rendering, Number(q.get('galrow') ?? 0), Number(q.get('galview') ?? 0));
    return;
  }
  if (show === 'people') {
    peopleGallery(scene, rendering, Number(q.get('galview') ?? 0), Number(q.get('galphase') ?? 0));
    return;
  }
  if (q.get('life') === 'off') return;

  const t0 = performance.now();
  const engine = scene.getEngine();
  const mat = lifeMaterial(scene);
  const height = (x: number, z: number): number => town.heightAt(x, z);

  // ---------------------------------------------------------------------------------------------- cars
  const traffic = new Traffic();
  // the pink two-tone classic of the references: parked by the convenience store and by the cherry avenue, and on the move
  const conbini = town.spots['w-conbini'];
  if (conbini) traffic.parkNear('main-street', conbini.x + conbini.fx * conbini.hv, conbini.z + conbini.fz * conbini.hv + 150, 2, 0);
  const mountain = roadsW.find((r) => r.id === 'mountain-street');
  if (mountain) {
    const a = mountain.pts[0]!;
    const b = mountain.pts[mountain.pts.length - 1]!;
    const l = Math.hypot(b.x - a.x, b.z - a.z);
    const dx = (b.x - a.x) / l;
    const dz = (b.z - a.z) / l;
    const hw = mountain.width / 2;
    traffic.parkNear('mountain-street', a.x + dx * 600 - dz * (hw - 10), a.z + dz * 600 + dx * (hw - 10), 2, 0);
  }
  const mover = traffic.routes.find((r) => r.id === 'main-street')?.cars[0];
  if (mover) traffic.retarget(mover, 2, 0);

  const setCount = new Map<string, number>();
  let wheelTotal = 0;
  const movingKeys = new Set<string>();
  for (const c of traffic.cars) {
    const key = `${c.kind}:${c.pal}`;
    c.slot = setCount.get(key) ?? 0;
    setCount.set(key, c.slot + 1);
    c.wslot = wheelTotal++;
    if (!c.parked) movingKeys.add(key);
  }
  const carSets = new Map<string, CarSet>();
  for (const [key, n] of setCount) {
    const [k, p] = key.split(':').map(Number) as [number, number];
    const kind = CAR_KINDS[k]!;
    const b = new MeshBatch();
    kind.build(b, kind.palettes[p]!);
    const inst = new Instances(`life_car_${kind.id}_${p}`, b, mat, scene, n);
    rendering.addShadowCaster(inst.mesh);
    carSets.set(key, { body: inst, moving: movingKeys.has(key) });
  }
  const wheelBatch = new MeshBatch();
  buildWheel(wheelBatch);
  const wheels = new Instances('life_wheels', wheelBatch, mat, scene, wheelTotal * 4);
  rendering.addShadowCaster(wheels.mesh);
  const writeCar = (c: Car): void => {
    const kind = CAR_KINDS[c.kind]!;
    const body = carSets.get(`${c.kind}:${c.pal}`)!.body;
    const y = height(c.x, c.z) + ROAD_Y;
    setPose(body.data, c.slot * 16, c.x, y, c.z, c.yaw);
    let w = c.wslot * 4;
    for (const sx of [-1, 1]) {
      for (const az of [kind.axle.front, kind.axle.rear]) {
        setPart(wheels.data, w * 16, c.x, y, c.z, c.yaw, 1, sx * kind.wheelX, kind.wheelR, az, c.spin);
        w++;
      }
    }
  };
  for (const c of traffic.cars) writeCar(c);
  for (const s of carSets.values()) s.body.upload();
  wheels.upload();

  // ---------------------------------------------------------------------------------------------- people
  const staffFirst = OUTFITS.length;
  const cast: Outfit[] = [...OUTFITS, STAFF.wagashi!, STAFF.cafe!, STAFF.station!];
  const idx = (id: string): number => OUTFITS.findIndex((o) => o.id === id);
  const walkOutfits = OUTFITS.map((_, i) => i).filter((i) => i !== JOGGER);
  const staff = { wagashi: staffFirst, cafe: staffFirst + 1, station: staffFirst + 2 };
  const sitOutfits = {
    plaza: ['elder_man', 'casual_woman_pink', 'schoolgirl_blazer'].map(idx),
    platform: ['office_man_gray', 'office_woman'].map(idx),
  };
  const crowd = new Crowd(town.spots, walkOutfits, staff, sitOutfits, JOGGER);

  const standCount: number[] = cast.map(() => 0);
  const seatCount = new Map<string, number>();
  for (const p of crowd.people) {
    if (p.mode === 'sit') {
      const key = `${p.outfit}:${p.surface}`;
      p.slot = seatCount.get(key) ?? 0;
      seatCount.set(key, p.slot + 1);
    } else p.slot = standCount[p.outfit]!++;
  }
  const personSets: (PersonSet | undefined)[] = [];
  const fusedSets: (FusedSet | undefined)[] = [];
  cast.forEach((o, i) => {
    const n = standCount[i]!;
    if (n === 0) return;
    if (i >= staffFirst) fusedSets[i] = new FusedSet(scene, mat, rendering, o, n);
    else personSets[i] = new PersonSet(scene, mat, rendering, o, n);
  });
  const seatedSets = new Map<string, SeatedSet>();
  for (const [key, n] of seatCount) {
    const [o, h] = key.split(':').map(Number) as [number, number];
    seatedSets.set(key, new SeatedSet(scene, mat, rendering, cast[o]!, h, n));
  }
  const writePerson = (p: Person): void => {
    const y = height(p.x, p.z) + p.surface;
    if (p.mode === 'sit') seatedSets.get(`${p.outfit}:${p.surface}`)!.write(p.slot, p.x, y, p.z, p.yaw, p.k);
    else if (p.outfit >= staffFirst) fusedSets[p.outfit]!.write(p.slot, p.x, y, p.z, p.yaw, p.k);
    else personSets[p.outfit]!.write(p.slot, p.x, y, p.z, p.yaw, p.k, p.phase, p.mode === 'walk' ? p.swing : 0);
  };
  for (const p of crowd.people) writePerson(p);
  for (const s of personSets) s?.upload();
  for (const s of fusedSets) s?.upload();
  for (const s of seatedSets.values()) s.upload();

  mat.freeze();

  // ---------------------------------------------------------------------------------------------- every frame
  const driving = traffic.cars.filter((c) => !c.parked);
  const movingSets = [...carSets.values()].filter((s) => s.moving);
  const mobile = crowd.people.filter((p) => p.mode !== 'sit');
  scene.onBeforeRenderObservable.add(() => {
    const dt = Math.min(0.1, engine.getDeltaTime() / 1000);
    traffic.update(dt);
    for (const c of driving) writeCar(c);
    for (const s of movingSets) s.body.upload();
    wheels.upload();
    crowd.update(dt);
    for (const p of mobile) writePerson(p);
    for (const s of personSets) s?.upload();
    for (const s of fusedSets) s?.upload();
  });

  // ---------------------------------------------------------------------------------------------- report and test hooks
  let verts = wheels.vertexCount;
  let meshes = 1;
  for (const s of carSets.values()) (verts += s.body.vertexCount), meshes++;
  for (const s of personSets) if (s) (verts += s.vertexCount), (meshes += s.meshes().length);
  for (const s of fusedSets) if (s) (verts += s.body.vertexCount), meshes++;
  for (const s of seatedSets.values()) (verts += s.body.vertexCount), meshes++;
  const walkers = crowd.people.filter((p) => p.mode === 'walk').length;
  const standing = crowd.people.filter((p) => p.mode === 'stand').length;
  const sitting = crowd.people.filter((p) => p.mode === 'sit').length;
  console.info(
    `[town] life: ${driving.length} driving + ${traffic.cars.length - driving.length} parked cars, ${crowd.people.length} people (${walkers} walking, ${standing} standing, ${sitting} sitting), ${meshes} meshes, ${verts} template vertices, built in ${Math.round(performance.now() - t0)} ms`,
  );
  scene.metadata = {
    ...(scene.metadata ?? {}),
    life: {
      cars: traffic.cars.length,
      driving: driving.length,
      parked: traffic.cars.length - driving.length,
      people: crowd.people.length,
      walkers,
      standing,
      sitting,
      meshes,
      vertices: verts,
      /** x,z of every driving car and walking person (for tests) */
      positions: (): { cars: [number, number][]; walkers: [number, number][] } => ({
        cars: driving.map((c) => [c.x, c.z]),
        walkers: mobile.filter((p) => p.mode === 'walk').map((p) => [p.x, p.z]),
      }),
    },
  };
}
