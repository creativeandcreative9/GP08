import { type Scene } from '@babylonjs/core/scene.js';
import type { Rendering } from './render';
import type { Town } from './town/build';
import { MeshBatch } from './town/batch';
import { roadClearance, roadsW } from './town/site';
import { buildWheel, CAR_KINDS } from './life/carmodels';
import { Crowd, type CrowdEnv, type Person } from './life/crowd';
import { buildDog } from './life/animals';
import { carGallery, peopleGallery } from './life/gallery';
import { hideInstance, Instances, lifeMaterial, setPart, setPose } from './life/inst';
import { OUTFITS, STAFF } from './life/outfits';
import { buildFused } from './life/people';
import { FusedSet, PersonSet, SeatedSet } from './life/personset';
import { ObstacleGrid } from './life/obstacles';
import { Prober } from './life/probe';
import { Traffic, type Car } from './life/traffic';
import type { Contact } from './gameplay/world';
import { schedule } from './gameplay/calendar';
import { residentName } from './gameplay/errands';
import { ContactShadows } from './contact-shadows';
import { DEC3_Y } from './town/ctx';

export interface TownLife {
  contacts(): Contact[];
  talkTo(id: string | null): void;
  setTime(minute: number): void;
}

/** Height of the asphalt above the terrain (the road decal layer) */
const ROAD_Y = 0.45;

/** The jogger is the last of the walking outfits */
const JOGGER = OUTFITS.length - 1;

/** A dog's stride cycles per person stride cycle */
const DOG_STRIDE = 2.6;

interface CarSet {
  body: Instances;
  moving: boolean;
}

/**
 * Cars and people for the town: parked and driving cars, walkers, shop staff and people sitting on benches.
 * Everything is drawn with a few template meshes and thin instances; the simulation runs before every frame.
 * `?life=off` leaves them out (to compare), `?lifeshow=cars|people` shows the models up close (see gallery.ts).
 */
export function createLife(scene: Scene, town: Town, rendering: Rendering): TownLife | undefined {
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
  const carMat = lifeMaterial(scene, true);
  const height = (x: number, z: number): number => town.heightAt(x, z);

  // ---------------------------------------------------------------------------------------------- cars
  const traffic = new Traffic();
  // the pink two-tone classic of the references: parked by the convenience store and by the cherry avenue, and on the move
  const conbini = town.spots['w-conbini'];
  if (conbini) {
    const x = conbini.x + conbini.fx * conbini.hv, z = conbini.z + conbini.fz * conbini.hv;
    const road = roadClearance(x, z).road;
    const distance = Math.hypot(x, z - 600) || 1;
    if (road) traffic.parkNear(road.id, x - x / distance * 100, z + (600 - z) / distance * 100, 2, 0);
  }
  const mountain = roadsW.find((r) => r.id === 'mountain-street');
  if (mountain) {
    const a = mountain.pts[0]!;
    const b = mountain.pts[mountain.pts.length - 1]!;
    const l = Math.hypot(b.x - a.x, b.z - a.z);
    const dx = (b.x - a.x) / l;
    const dz = (b.z - a.z) / l;
    const hw = mountain.width / 2;
    traffic.parkNear('mountain-street', a.x + dx * 550 + dz * (hw - 10), a.z + dz * 550 - dx * (hw - 10), 2, 0);
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
    const inst = new Instances(`life_car_${kind.id}_${p}`, b, carMat, scene, n);
    rendering.addShadowCaster(inst.mesh);
    carSets.set(key, { body: inst, moving: movingKeys.has(key) });
  }
  const wheelBatch = new MeshBatch();
  buildWheel(wheelBatch);
  const wheels = new Instances('life_wheels', wheelBatch, mat, scene, wheelTotal * 4);
  rendering.addShadowCaster(wheels.mesh);
  const carContacts = new ContactShadows('life_contact_cars', scene, traffic.cars.length, rendering);
  const writeCar = (c: Car): void => {
    const kind = CAR_KINDS[c.kind]!;
    const body = carSets.get(`${c.kind}:${c.pal}`)!.body;
    const y = height(c.x, c.z) + ROAD_Y;
    setPose(body.data, c.slot * 16, c.x, y, c.z, c.yaw);
    carContacts.set(c.wslot, c.x, height(c.x, c.z) + DEC3_Y + .03, c.z, c.yaw, kind.width * .56, kind.length * .48);
    // the four wheels (no temporary arrays: this runs for every moving car on every frame)
    const o = c.wslot * 64;
    const wd = wheels.data;
    const wx = kind.wheelX;
    const wr = kind.wheelR;
    setPart(wd, o, c.x, y, c.z, c.yaw, 1, -wx, wr, kind.axle.front, c.spin);
    setPart(wd, o + 16, c.x, y, c.z, c.yaw, 1, -wx, wr, kind.axle.rear, c.spin);
    setPart(wd, o + 32, c.x, y, c.z, c.yaw, 1, wx, wr, kind.axle.front, c.spin);
    setPart(wd, o + 48, c.x, y, c.z, c.yaw, 1, wx, wr, kind.axle.rear, c.spin);
  };
  const hideCar = (c: Car): void => {
    carContacts.hide(c.wslot);
    hideInstance(carSets.get(`${c.kind}:${c.pal}`)!.body.data, c.slot * 16);
    for (let w = 0; w < 4; w++) hideInstance(wheels.data, (c.wslot * 4 + w) * 16);
  };
  for (const c of traffic.cars) writeCar(c);
  for (const s of carSets.values()) s.body.upload();
  wheels.upload();
  carContacts.upload();

  // ---------------------------------------------------------------------------------------------- people
  // the cast: the walking outfits, then the staff (one fused mesh each), then the dog
  const staffFirst = OUTFITS.length;
  const staff = [STAFF.wagashi!, STAFF.cafe!, STAFF.station!, STAFF.conbini!];
  const dogIndex = staffFirst + staff.length;
  const castSize = dogIndex + 1;
  const idx = (id: string): number => OUTFITS.findIndex((o) => o.id === id);
  const prober = new Prober(scene);
  const grid = new ObstacleGrid(town.obstacles);
  const env: CrowdEnv = {
    ground: height,
    stand: (x, z) => prober.stand(x, z, height(x, z)),
    seat: (x, z, top) => prober.seat(x, z, height(x, z), top),
    solid: (x, z, m) => grid.hit(x, z, m),
  };
  const crowd = new Crowd(
    town.spots,
    {
      walkers: OUTFITS.map((_, i) => i).filter((i) => i !== JOGGER),
      jogger: JOGGER,
      wagashi: staffFirst,
      cafe: staffFirst + 1,
      station: staffFirst + 2,
      conbini: staffFirst + 3,
      dog: dogIndex,
      dogOwners: ['elder_woman', 'casual_man_teal', 'casual_woman_pink'].map(idx),
      sitters: { low: ['casual_woman_pink', 'office_woman', 'schoolgirl_blazer'].map(idx), high: ['elder_man', 'office_man_gray'].map(idx) },
    },
    env,
  );

  const standCount: number[] = Array.from({ length: castSize }, () => 0);
  const seatCount = new Map<string, number>();
  for (const p of crowd.people) {
    if (p.mode === 'sit') {
      const key = `${p.outfit}:${p.seatH}`;
      p.slot = seatCount.get(key) ?? 0;
      seatCount.set(key, p.slot + 1);
    } else p.slot = standCount[p.outfit]!++;
  }
  const personSets: (PersonSet | undefined)[] = [];
  const fusedSets: (FusedSet | undefined)[] = [];
  for (let i = 0; i < castSize; i++) {
    const n = standCount[i]!;
    if (n === 0) continue;
    if (i < staffFirst) personSets[i] = new PersonSet(scene, mat, rendering, OUTFITS[i]!, n);
    else if (i === dogIndex) fusedSets[i] = new FusedSet(scene, mat, rendering, 'dog', buildDog(), n);
    else fusedSets[i] = new FusedSet(scene, mat, rendering, staff[i - staffFirst]!.id, buildFused(staff[i - staffFirst]!), n);
  }
  const seatedSets = new Map<string, SeatedSet>();
  for (const [key, n] of seatCount) {
    const [o, h] = key.split(':').map(Number) as [number, number];
    seatedSets.set(key, new SeatedSet(scene, mat, rendering, OUTFITS[o]!, h, n));
  }
  const personContacts = new ContactShadows('life_contact_people', scene, crowd.people.length, rendering);
  const contactSlots = new Map(crowd.people.map((p, i) => [p, i]));
  const writePerson = (p: Person): void => {
    const y = height(p.x, p.z) + p.surface;
    const floorY = Math.max(height(p.x, p.z) + DEC3_Y + .03, y - (p.mode === 'sit' ? p.seatH : 0));
    personContacts.set(contactSlots.get(p)!, p.x, floorY, p.z, p.yaw, (p.animal ? 2.8 : 4.8) * p.k, (p.animal ? 4.4 : 3.6) * p.k);
    if (p.mode === 'sit') seatedSets.get(`${p.outfit}:${p.seatH}`)!.write(p.slot, p.x, y, p.z, p.yaw, p.k);
    else if (p.animal) fusedSets[p.outfit]!.gait(p.slot, p.x, y, p.z, p.yaw, p.k, p.phase * DOG_STRIDE, p.swing);
    else if (p.outfit >= staffFirst) fusedSets[p.outfit]!.write(p.slot, p.x, y, p.z, p.yaw, p.k);
    else personSets[p.outfit]!.write(p.slot, p.x, y, p.z, p.yaw, p.k, p.phase, p.mode === 'walk' ? p.swing : 0);
  };
  const hidePerson = (p: Person): void => {
    personContacts.hide(contactSlots.get(p)!);
    p.hidden = true;
    if (p.mode === 'sit') seatedSets.get(`${p.outfit}:${p.seatH}`)!.hide(p.slot);
    else if (p.outfit >= staffFirst) fusedSets[p.outfit]!.hide(p.slot);
    else personSets[p.outfit]!.hide(p.slot);
  };
  for (const p of crowd.people) writePerson(p);
  for (const s of personSets) s?.upload();
  for (const s of fusedSets) s?.upload();
  for (const s of seatedSets.values()) s.upload();
  personContacts.upload();

  mat.freeze(); carMat.freeze();
  // Rooms hide the outdoor town, including its cast. Keep the playable avatar outside this hierarchy.
  for (const mesh of scene.meshes) if (mesh.name.startsWith('life_')) mesh.parent = town.root;

  // ---------------------------------------------------------------------------------------------- every frame
  const driving = traffic.cars.filter((c) => !c.parked);
  const movingSets = [...carSets.values()].filter((s) => s.moving);
  const mobile = crowd.people.filter((p) => p.mode !== 'sit');
  let speakingTo: Person | undefined;
  let minute = 14 * 60;
  const present = (p: Person, i: number): boolean => p.staff || schedule(minute, i).outside;
  const hideForSchedule = (p: Person): void => { const hidden = p.hidden; hidePerson(p); p.hidden = hidden; };
  scene.onBeforeRenderObservable.add(() => {
    const dt = Math.min(0.1, engine.getDeltaTime() / 1000);
    traffic.update(dt);
    for (const c of driving) if (!c.hidden) writeCar(c);
    for (const s of movingSets) s.body.upload();
    wheels.upload();
    crowd.update(dt * schedule(minute, 0).pace);
    for (const [i, p] of crowd.people.entries()) {
      if (p.hidden) continue;
      if (!present(p, i)) hideForSchedule(p);
      else writePerson(p);
    }
    for (const s of seatedSets.values()) s.upload();
    for (const s of personSets) s?.upload();
    for (const s of fusedSets) s?.upload();
    personContacts.upload(); carContacts.upload();
  });

  // Whatever stands right in front of the lens only hides the picture: on the first frame (the camera has been put in
  // place by then) people and parked cars next to the eye or in the middle of the view are taken away.
  scene.onBeforeRenderObservable.addOnce(() => {
    // Clearing the lens is only a presentation aid for fixed inspection cameras.
    // Playable residents must remain present when progress and errands are resumed.
    if (!q.has('view')) return;
    const cam = scene.activeCamera;
    if (!cam) return;
    // The first onBeforeRender runs before the camera's normal matrix update.
    // Read the chosen inspection position, rather than the previous frame's global origin.
    cam.getViewMatrix(true);
    const ex = cam.globalPosition.x;
    const ez = cam.globalPosition.z;
    const fwd = cam.getForwardRay(1).direction;
    const fl = Math.hypot(fwd.x, fwd.z) || 1;
    const fx = fwd.x / fl;
    const fz = fwd.z / fl;
    const inView = (x: number, z: number, dist: number, cone: number): boolean => {
      const dx = x - ex;
      const dz = z - ez;
      const d = Math.hypot(dx, dz);
      if (d < dist * 0.32) return true;
      return d < dist && (dx * fx + dz * fz) / (d || 1) > Math.cos(cone);
    };
    let removed = 0;
    for (const p of crowd.people) {
      if (p.hidden) continue;
      const near = p.staff ? Math.hypot(p.x - ex, p.z - ez) < 10 : inView(p.x, p.z, 20, 0.42);
      if (near) {
        hidePerson(p);
        removed++;
      }
    }
    // whoever follows a person who was taken away (a friend, a dog) goes too: it would walk on the spot
    for (const p of crowd.people) {
      if (p.buddy?.hidden && !p.hidden) {
        hidePerson(p);
        removed++;
      }
    }
    for (const c of traffic.cars) {
      if (c.hidden) continue;
      const kind = CAR_KINDS[c.kind]!, dx = ex - c.x, dz = ez - c.z;
      const lateral = Math.abs(dx * Math.cos(c.yaw) - dz * Math.sin(c.yaw));
      const longitudinal = Math.abs(dx * Math.sin(c.yaw) + dz * Math.cos(c.yaw));
      const bodyDistance = Math.hypot(Math.max(0, lateral - kind.width / 2), Math.max(0, longitudinal - kind.length / 2));
      if (bodyDistance < 45 || inView(c.x, c.z, 18, 0.3)) {
        traffic.remove(c);
        hideCar(c);
        removed++;
      }
    }
    for (const s of personSets) s?.upload();
    for (const s of fusedSets) s?.upload();
    for (const s of seatedSets.values()) s.upload();
    for (const s of carSets.values()) s.body.upload();
    wheels.upload();
    personContacts.upload(); carContacts.upload();
    if (removed > 0) console.info(`[life] cleared ${removed} people / cars from the camera's way`);
  });

  // ---------------------------------------------------------------------------------------------- report and test hooks
  let verts = wheels.vertexCount + carContacts.mesh.getTotalVertices() + personContacts.mesh.getTotalVertices();
  let meshes = 3;
  for (const s of carSets.values()) (verts += s.body.vertexCount), meshes++;
  for (const s of personSets) if (s) (verts += s.vertexCount), (meshes += s.meshes().length);
  for (const s of fusedSets) if (s) (verts += s.body.vertexCount), meshes++;
  for (const s of seatedSets.values()) (verts += s.body.vertexCount), meshes++;
  const humans = crowd.people.filter((p) => !p.animal);
  const dogs = crowd.people.length - humans.length;
  const walkers = humans.filter((p) => p.mode === 'walk').length;
  const standing = humans.filter((p) => p.mode === 'stand').length;
  const sitting = humans.filter((p) => p.mode === 'sit').length;
  const staffPosts = humans.filter((p) => p.staff).map((p) => ({ outfit: p.outfit, x: p.x, z: p.z }));
  console.info(
    `[town] life: ${driving.length} driving + ${traffic.cars.length - driving.length} parked cars, ${humans.length} people (${walkers} walking, ${standing} standing, ${sitting} sitting, ${staffPosts.length} staff) and ${dogs} dogs, ${meshes} meshes, ${verts} template vertices, built in ${Math.round(performance.now() - t0)} ms`,
  );
  scene.metadata = {
    ...(scene.metadata ?? {}),
    life: {
      cars: traffic.cars.length,
      driving: driving.length,
      parked: traffic.cars.length - driving.length,
      people: humans.length,
      dogs,
      walkers,
      standing,
      sitting,
      /** where the shop and station staff stand (outfit index, x, z) */
      staff: staffPosts,
      meshes,
      vertices: verts,
      /** runs the simulation ahead by `seconds` without drawing (for tests and debugging) */
      step: (seconds: number): void => {
        for (let t = 0; t < seconds; t += 0.1) {
          traffic.update(0.1);
          crowd.update(0.1);
        }
      },
      /** how many walkers stand still at the moment (waiting at the end of a stretch or in front of something solid) */
      paused: (): number => mobile.filter((p) => p.mode === 'walk' && !p.hidden && !p.animal && p.pause > 0).length,
      /** outfit, mode and x,z of everyone who stands or sits (for tests and debugging) */
      posts: (): { outfit: number; mode: string; x: number; z: number; hidden: boolean }[] =>
        humans.filter((p) => p.mode !== 'walk').map((p) => ({ outfit: p.outfit, mode: p.mode, x: p.x, z: p.z, hidden: p.hidden })),
      /** x,z of every driving car and walking person (for tests) */
      positions: (): { cars: [number, number][]; walkers: [number, number][] } => ({
        cars: driving.filter((c) => !c.hidden).map((c) => [c.x, c.z]),
        walkers: mobile.filter((p) => p.mode === 'walk' && !p.hidden).map((p) => [p.x, p.z]),
      }),
    },
  };
  const lines = [
    'こんにちは。この街は初めて？ 和菓子屋の三色だんご、おすすめですよ。お店案内から場所が分かります。',
    '桜がきれいですね。海は駅の向こうの北側、展望台は南西の山の上にあります。',
    'お散歩日和ですね。買ったものは「持ち物」から食べたり飲んだりできますよ。',
    'こんにちは！ カフェのコーヒーを持って、公園でひと休みするのが好きなんです。',
    'この公園はお気に入りの場所です。急がなくても大丈夫。ゆっくり街を歩いていってね。',
  ];
  return {
    contacts: () => crowd.people.flatMap((p, i) => p.hidden || p.animal || p.staff || !present(p, i) ? [] : [{
      id: `resident-${i}`, name: residentName(`resident-${i}`), line: `${schedule(minute, i).activity}の途中です。${lines[i % lines.length]!}`,
      x: p.x, z: p.z, y: height(p.x, p.z) + p.surface, kind: 'resident' as const,
    }]),
    setTime: value => { minute = value; crowd.setTime(value); },
    talkTo: id => {
      if (speakingTo) speakingTo.talking = false;
      speakingTo = id ? crowd.people[Number(id.replace('resident-', ''))] : undefined;
      if (speakingTo) speakingTo.talking = true;
    },
  };
}
