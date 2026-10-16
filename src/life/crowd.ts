import type { Spot } from '../town/ctx';
import { plazaW, roadClearance, roadsW } from '../town/site';
import { makeRng } from '../town/util';
import { Path, newPathPt, type PathPt, type Pt } from './path';

/**
 * The people of the town (pure logic, no Babylon): walkers on the sidewalks and the plaza paths, people standing at
 * shop fronts and the station, people sitting on benches and the shop / station staff. Walkers keep to the left
 * (like in Japan), avoid each other crudely by moving sideways, and turn around at the end of their stretch.
 */

export type Mode = 'walk' | 'stand' | 'sit';

export interface Person {
  /** index into the outfit list of the caller */
  outfit: number;
  /** slot inside the instance set of that outfit (assigned by the caller) */
  slot: number;
  mode: Mode;
  x: number;
  z: number;
  yaw: number;
  /** overall height scale */
  k: number;
  /** walk cycle phase (radians) and the amplitude factor of the limb swing (0 = standing) */
  phase: number;
  swing: number;
  speed: number;
  /** height of the surface above the ground (sidewalk, bench seat height for sitters) */
  surface: number;
  // standing / sitting
  yawTarget: number;
  idle: number;
  // walking
  lane: Lane | null;
  s: number;
  s0: number;
  s1: number;
  dir: 1 | -1;
  vmax: number;
  lat: number;
  latV: number;
  pause: number;
  hint: number;
  /** walking together: this person follows `buddy` (its leader) at a lateral offset */
  buddy: Person | null;
  buddyOff: number;
}

/** A line people walk along: a sidewalk (beside a road) or a path. Lateral offsets are along the left normal. */
export interface Lane {
  id: string;
  path: Path;
  latMin: number;
  latMax: number;
  /** preferred lateral offset when walking along (+1) / against (-1) the path direction: keep left */
  prefPlus: number;
  prefMinus: number;
  surface: number;
  walkers: Person[];
}

export interface Seat {
  x: number;
  z: number;
  yaw: number;
  seatH: number;
}

export interface Standing {
  x: number;
  z: number;
  yaw: number;
}

const SIDEWALK_NEAR = 3.3;
const SIDEWALK_FAR = 9.2;
const SIDEWALK_Y = 0.2;
const PATH_Y = 0.45;

const TWO_PI = Math.PI * 2;
const angleDiff = (a: number, b: number): number => Math.atan2(Math.sin(a - b), Math.cos(a - b));

/** Where the shop door is on its frontage (mirrors `addShop`) */
export function doorU(id: string, hu: number): number {
  return (hu > 60 ? 1 : 0) * hu * 0.35 * (id.length % 2 ? 1 : -1);
}

/** A point in front of a shop: u along the front (to the right when facing out of it), v out of the front wall */
export function shopPoint(s: Spot, u: number, v: number): Pt {
  const rx = s.fz;
  const rz = -s.fx;
  return { x: s.x + rx * u + s.fx * (s.hv + v), z: s.z + rz * u + s.fz * (s.hv + v) };
}

export class Crowd {
  readonly people: Person[] = [];
  readonly lanes: Lane[] = [];
  private readonly laneByKey = new Map<string, Lane>();
  private readonly tmp: PathPt = newPathPt();
  private readonly rnd: () => number;
  private bag: number[] = [];
  private readonly walkOutfits: number[];

  /**
   * @param spots named shops (front direction, size) from the town
   * @param walkOutfits outfit indices walkers are drawn from
   * @param staff outfit indices of the shop and station staff: wagashi clerk, cafe staff, station staff
   * @param sitOutfits outfit indices used for people sitting down on the plaza benches / the platform benches
   */
  constructor(
    spots: Readonly<Record<string, Spot>>,
    walkOutfits: readonly number[],
    private readonly staff: { wagashi: number; cafe: number; station: number },
    private readonly sitOutfits: { plaza: readonly number[]; platform: readonly number[] },
    private readonly jogger: number,
    seed = 77123,
  ) {
    this.rnd = makeRng(seed);
    this.walkOutfits = [...walkOutfits];
    this.buildSidewalkLanes();
    this.buildPlazaLanes();
    this.placeWalkers(spots);
    this.placeStanders(spots);
    this.placeStaff(spots);
    this.placeSitters();
  }

  // ---------------------------------------------------------------------------------------------- construction

  private nextOutfit(): number {
    if (this.bag.length === 0) {
      this.bag = [...this.walkOutfits];
      for (let i = this.bag.length - 1; i > 0; i--) {
        const j = Math.floor(this.rnd() * (i + 1));
        [this.bag[i], this.bag[j]] = [this.bag[j]!, this.bag[i]!];
      }
    }
    return this.bag.pop()!;
  }

  private newPerson(outfit: number, mode: Mode): Person {
    return {
      outfit,
      slot: 0,
      mode,
      x: 0,
      z: 0,
      yaw: 0,
      k: 0.96 + this.rnd() * 0.08,
      phase: this.rnd() * TWO_PI,
      swing: 0,
      speed: 0,
      surface: 0,
      yawTarget: 0,
      idle: this.rnd() * TWO_PI,
      lane: null,
      s: 0,
      s0: 0,
      s1: 0,
      dir: 1,
      vmax: 0,
      lat: 0,
      latV: 0,
      pause: 0,
      hint: 0,
      buddy: null,
      buddyOff: 0,
    };
  }

  private buildSidewalkLanes(): void {
    for (const road of roadsW) {
      const path = new Path(road.pts, 20);
      const hw = road.width / 2;
      for (const side of [1, -1] as const) {
        // keep left: walking along the path on the left sidewalk uses its outer half, on the right sidewalk its inner half
        const outer = hw + 8.0;
        const inner = hw + 4.6;
        const lane: Lane = {
          id: `${road.id}:${side}`,
          path,
          latMin: side > 0 ? hw + SIDEWALK_NEAR : -(hw + SIDEWALK_FAR),
          latMax: side > 0 ? hw + SIDEWALK_FAR : -(hw + SIDEWALK_NEAR),
          prefPlus: side > 0 ? outer : -inner,
          prefMinus: side > 0 ? inner : -outer,
          surface: SIDEWALK_Y,
          walkers: [],
        };
        // prefMinus for the left sidewalk: walking against the path direction, the left hand is towards the road
        this.lanes.push(lane);
        this.laneByKey.set(`${road.id}:${side}`, lane);
      }
    }
  }

  private buildPlazaLanes(): void {
    const p = plazaW;
    const add = (id: string, pts: Pt[], half: number): void => {
      const lane: Lane = { id, path: new Path(pts, 20), latMin: -half, latMax: half, prefPlus: half * 0.42, prefMinus: -half * 0.42, surface: PATH_Y, walkers: [] };
      this.lanes.push(lane);
      this.laneByKey.set(id, lane);
    };
    // the paved axes: north-south (north of the fountain towards the station, and south of it) and east-west
    add('plaza-n', [{ x: 0, z: 125 }, { x: 0, z: 590 }], 24);
    add('plaza-s', [{ x: 0, z: -125 }, { x: 0, z: -520 }], 24);
    add('plaza-e', [{ x: 130, z: 0 }, { x: p.rx * 0.8, z: 0 }], 18);
    add('plaza-w', [{ x: -130, z: 0 }, { x: -p.rx * 0.8, z: 0 }], 18);
    // the paved ring around the lawn (a closed loop for the jogger)
    const ring: Pt[] = [];
    const n = 72;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * TWO_PI;
      ring.push({ x: Math.cos(a) * p.rx * 0.92, z: Math.sin(a) * p.rz * 0.9 });
    }
    add('plaza-ring', ring, 14);
  }

  private addWalker(lane: Lane, s0: number, s1: number, outfit: number, dir: 1 | -1, vmax: number): Person | null {
    // find a free spot (not too close to another walker of the lane walking the same way)
    for (let tries = 0; tries < 30; tries++) {
      const s = s0 + this.rnd() * (s1 - s0);
      let ok = true;
      for (const o of lane.walkers) if (Math.abs(o.s - s) < 12 && o.dir === dir) ok = false;
      if (!ok) continue;
      const p = this.newPerson(outfit, 'walk');
      p.lane = lane;
      p.s0 = s0;
      p.s1 = s1;
      p.s = s;
      p.dir = dir;
      p.vmax = vmax;
      p.speed = vmax * (0.85 + this.rnd() * 0.15);
      p.lat = dir > 0 ? lane.prefPlus : lane.prefMinus;
      p.lat += (this.rnd() - 0.5) * 1.4;
      p.surface = lane.surface;
      lane.walkers.push(p);
      this.people.push(p);
      this.pose(p);
      p.yaw = p.yawTarget;
      return p;
    }
    return null;
  }

  /** A second person walking beside `leader` (same direction and speed, a few units to the side) */
  private addBuddy(leader: Person, outfit: number): void {
    const lane = leader.lane!;
    const p = this.newPerson(outfit, 'walk');
    p.lane = lane;
    p.s0 = leader.s0;
    p.s1 = leader.s1;
    p.s = leader.s - leader.dir * 1.4;
    p.dir = leader.dir;
    p.vmax = leader.vmax;
    p.speed = leader.speed;
    p.surface = lane.surface;
    // beside the leader, towards the side of the lane with more room
    const mid = (lane.latMin + lane.latMax) / 2;
    p.buddyOff = leader.lat >= mid ? -5.6 : 5.6;
    p.lat = Math.min(lane.latMax, Math.max(lane.latMin, leader.lat + p.buddyOff));
    p.buddy = leader;
    p.phase = leader.phase + 1.3;
    lane.walkers.push(p);
    this.people.push(p);
    this.pose(p);
    p.yaw = p.yawTarget;
  }

  /** Walkers on the sidewalks near every named shop, and extra ones around the comparison views */
  private placeWalkers(spots: Readonly<Record<string, Spot>>): void {
    const rnd = this.rnd;
    const speed = (): number => 13.5 + rnd() * 5;
    const groups: { road: string; side: 1 | -1; s: number; n: number }[] = [];
    for (const [id, sp] of Object.entries(spots)) {
      const fx = sp.x + sp.fx * sp.hv;
      const fz = sp.z + sp.fz * sp.hv;
      const cl = roadClearance(fx, fz);
      const road = cl.road;
      if (!road) continue;
      const lane = this.laneByKey.get(`${road.id}:1`);
      if (!lane) continue;
      const s = lane.path.project(fx, fz);
      // which side of the road the shop is on: the sign of its offset along the left normal
      const p = this.tmp;
      lane.path.at(s, p);
      const side: 1 | -1 = (fx - p.x) * -p.tz + (fz - p.z) * p.tx >= 0 ? 1 : -1;
      const extra = id === 'e-wagashi' || id === 'w-cafe' || id === 'w-conbini' ? 2 : 0;
      groups.push({ road: road.id, side, s, n: 2 + extra });
    }
    // the cherry avenue of the mountain street (comparison view 4): ahead of the point 420 along the road
    groups.push({ road: 'mountain-street', side: 1, s: 700, n: 3 });
    groups.push({ road: 'mountain-street', side: -1, s: 700, n: 2 });
    for (const g of groups) {
      const lane = this.laneByKey.get(`${g.road}:${g.side}`);
      const other = this.laneByKey.get(`${g.road}:${-g.side}`);
      if (!lane || !other) continue;
      const len = lane.path.length;
      const s0 = Math.max(60, g.s - 380);
      const s1 = Math.min(len - 60, g.s + 520);
      for (let i = 0; i < g.n; i++) {
        const useOther = rnd() < 0.3;
        const dir: 1 | -1 = rnd() < 0.5 ? 1 : -1;
        const outfit = this.nextOutfit();
        const w = this.addWalker(useOther ? other : lane, s0, s1, outfit, dir, speed());
        // sometimes two people walk together
        if (w && rnd() < 0.18) this.addBuddy(w, this.nextOutfit());
      }
    }
    // plaza paths
    const plazaGroups: [string, number][] = [['plaza-n', 5], ['plaza-s', 3], ['plaza-e', 2], ['plaza-w', 2]];
    for (const [id, n] of plazaGroups) {
      const lane = this.laneByKey.get(id)!;
      for (let i = 0; i < n; i++) this.addWalker(lane, 5, lane.path.length - 5, this.nextOutfit(), rnd() < 0.5 ? 1 : -1, speed());
    }
    // a jogger around the plaza ring (the ring is a closed loop: arc length wraps)
    const ring = this.laneByKey.get('plaza-ring')!;
    const j = this.addWalker(ring, 0, ring.path.length, this.jogger, 1, 36);
    if (j) j.s1 = ring.path.length * 1e6; // never turns around
  }

  private placeStanders(spots: Readonly<Record<string, Spot>>): void {
    const rnd = this.rnd;
    const ids = ['w-conbini', 'e-karaoke', 'e-clothes', 'w-book', 'w-ramen', 'e-sushi', 'e-super', 'w-flower', 'e-gohan', 'w-hotel', 'w-cafe', 'e-wagashi'];
    for (const id of ids) {
      const sp = spots[id];
      if (!sp) continue;
      const du = doorU(id, sp.hu);
      const pair = rnd() < 0.3;
      const count = id === 'e-wagashi' || id === 'w-cafe' ? 2 : pair ? 2 : 1;
      const faceShop = Math.atan2(-sp.fx, -sp.fz);
      const faceStreet = Math.atan2(sp.fx, sp.fz);
      for (let i = 0; i < count; i++) {
        const u = du + (i === 0 ? 1 : -1) * (9 + rnd() * 6);
        const v = 8 + rnd() * 3;
        const pt = shopPoint(sp, u, v);
        const p = this.newPerson(this.nextOutfit(), 'stand');
        p.x = pt.x;
        p.z = pt.z;
        p.surface = 0.15;
        // chatting pair: face each other; otherwise look into the window or at the street
        if (count === 2 && id !== 'e-wagashi' && id !== 'w-cafe') {
          const rx = sp.fz;
          const rz = -sp.fx;
          const toward = i === 0 ? -1 : 1;
          p.yawTarget = Math.atan2(rx * toward, rz * toward) + (rnd() - 0.5) * 0.3;
        } else p.yawTarget = rnd() < 0.7 ? faceShop + (rnd() - 0.5) * 0.5 : faceStreet;
        p.yaw = p.yawTarget;
        this.people.push(p);
      }
    }
    // people waiting in front of the station
    const wait: [number, number, number][] = [
      [16, 596, 2.9],
      [30, 600, -2.4],
      [58, 594, -0.3],
      [-62, 598, 1.4],
    ];
    for (const [x, z, yaw] of wait) {
      const p = this.newPerson(this.nextOutfit(), 'stand');
      p.x = x;
      p.z = z;
      p.yaw = p.yawTarget = yaw;
      p.surface = 0;
      this.people.push(p);
    }
    // passengers waiting on the platforms, behind the yellow line (south platform faces the tracks to the +z side)
    const south: [number, number][] = [[-210, 762], [75, 764], [430, 763]];
    for (const [x, z] of south) {
      const p = this.newPerson(this.nextOutfit(), 'stand');
      p.x = x;
      p.z = z;
      p.yaw = p.yawTarget = Math.PI * 0.03 * (x > 0 ? 1 : -1);
      p.surface = 0;
      this.people.push(p);
    }
    const north: [number, number][] = [[-150, 849], [330, 850]];
    for (const [x, z] of north) {
      const p = this.newPerson(this.nextOutfit(), 'stand');
      p.x = x;
      p.z = z;
      p.yaw = p.yawTarget = Math.PI + 0.05 * (x > 0 ? 1 : -1);
      this.people.push(p);
    }
  }

  private placeStaff(spots: Readonly<Record<string, Spot>>): void {
    const wag = spots['e-wagashi'];
    if (wag) {
      const pt = shopPoint(wag, doorU('e-wagashi', wag.hu) + 1, 6.5);
      const p = this.newPerson(this.staff.wagashi, 'stand');
      p.x = pt.x;
      p.z = pt.z;
      p.yaw = p.yawTarget = Math.atan2(wag.fx, wag.fz);
      p.surface = 0.15;
      this.people.push(p);
    }
    const cafe = spots['w-cafe'];
    if (cafe) {
      const pt = shopPoint(cafe, doorU('w-cafe', cafe.hu) + 2, 7);
      const p = this.newPerson(this.staff.cafe, 'stand');
      p.x = pt.x;
      p.z = pt.z;
      p.yaw = p.yawTarget = Math.atan2(cafe.fx, cafe.fz);
      p.surface = 0.15;
      this.people.push(p);
    }
    // station staff: one at the entrance, one on the platform
    for (const [x, z, yaw, surface] of [[30, 608, Math.PI, 0], [150, 760, 0.05, 0]] as [number, number, number, number][]) {
      const p = this.newPerson(this.staff.station, 'stand');
      p.x = x;
      p.z = z;
      p.yaw = p.yawTarget = yaw;
      p.surface = surface;
      this.people.push(p);
    }
  }

  private placeSitters(): void {
    const rnd = this.rnd;
    // plaza benches: seats at x = +-52, z = -300 -180 180 300 420; the back is on the outer side
    const seats: Seat[] = [];
    for (const z of [-300, -180, 180, 300, 420]) {
      for (const x of [-52, 52]) seats.push({ x, z, yaw: x < 0 ? Math.PI / 2 : -Math.PI / 2, seatH: 7 });
    }
    // station platform benches facing the tracks
    for (const x of [-120, 140, 360]) seats.push({ x, z: 754, yaw: Math.PI, seatH: 6 });
    for (const x of [-250, 260]) seats.push({ x, z: 909, yaw: Math.PI, seatH: 6 });
    // each bench is taken with some probability; some by two people (side by side along the bench)
    for (const st of seats) {
      if (rnd() > 0.5) continue;
      const two = st.seatH === 7 && rnd() < 0.3;
      const along = st.seatH === 7 ? [0, 1] : [1, 0];
      const n = two ? 2 : 1;
      for (let i = 0; i < n; i++) {
        const off = two ? (i === 0 ? -5 : 5) : (rnd() - 0.5) * 8;
        const pool = st.seatH === 7 ? this.sitOutfits.plaza : this.sitOutfits.platform;
        const p = this.newPerson(pool[Math.floor(rnd() * pool.length)]!, 'sit');
        p.x = st.x + along[0]! * off;
        p.z = st.z + along[1]! * off;
        p.yaw = p.yawTarget = st.yaw + (rnd() - 0.5) * 0.12;
        p.surface = st.seatH;
        this.people.push(p);
      }
    }
  }

  // ---------------------------------------------------------------------------------------------- simulation

  /** World position and facing of a walker from its lane state */
  private pose(p: Person): void {
    const lane = p.lane!;
    const q = this.tmp;
    p.hint = lane.path.at(p.s, q, p.hint);
    p.x = q.x - q.tz * p.lat;
    p.z = q.z + q.tx * p.lat;
    p.yawTarget = Math.atan2(p.dir * q.tx, p.dir * q.tz);
  }

  update(dt: number): void {
    for (const lane of this.lanes) {
      const ws = lane.walkers;
      for (let i = 0; i < ws.length; i++) this.stepWalker(lane, ws[i]!, ws, dt);
    }
    for (const p of this.people) {
      if (p.mode === 'walk') continue;
      // idle: breathing / shifting weight, slow glances
      p.idle += dt;
      p.yaw += angleDiff(p.yawTarget + Math.sin(p.idle * 0.45) * 0.06, p.yaw) * Math.min(1, dt * 3);
    }
  }

  private stepWalker(lane: Lane, p: Person, ws: readonly Person[], dt: number): void {
    const loop = p.s1 > lane.path.length * 100;
    if (p.buddy) {
      // follow the leader: same stretch, speed and pauses
      const l = p.buddy;
      p.dir = l.dir;
      p.speed = l.speed;
      p.s = l.s - l.dir * 1.4;
    } else if (p.pause > 0) {
      p.pause -= dt;
      p.speed = Math.max(0, p.speed - 40 * dt);
      if (p.pause <= 0) p.dir = p.dir === 1 ? -1 : 1;
    } else {
      p.speed += (p.vmax - p.speed) * Math.min(1, dt * 2.5);
      p.s += p.dir * p.speed * dt;
      if (loop) {
        if (p.s > lane.path.length) p.s -= lane.path.length;
      } else if (p.dir === 1 ? p.s >= p.s1 : p.s <= p.s0) {
        p.s = p.dir === 1 ? p.s1 : p.s0;
        p.pause = 0.8 + this.rnd() * 2.2;
      }
    }
    p.phase += (p.speed * dt * TWO_PI) / (18.8 * p.k);
    if (p.phase > 1e5) p.phase -= 1e5;
    p.swing = Math.min(1.25, p.speed / 15);
    // lateral: spring to the preferred lane, pushed away from people close ahead / beside
    const pref = p.dir === 1 ? lane.prefPlus : lane.prefMinus;
    let push = 0;
    for (let j = 0; j < ws.length; j++) {
      const o = ws[j]!;
      if (o === p || o === p.buddy || o.buddy === p) continue;
      const ds = (o.s - p.s) * p.dir;
      if (ds < -3 || ds > 9) continue;
      const dl = p.lat - o.lat;
      if (Math.abs(dl) < 4.6) push += (dl >= 0 ? 1 : -1) * (4.6 - Math.abs(dl)) * 5;
    }
    const target = p.buddy ? p.buddy.lat + p.buddyOff : pref;
    p.latV += ((target - p.lat) * 4 + push - p.latV * 3.2) * dt;
    p.lat += p.latV * dt;
    if (p.lat < lane.latMin) {
      p.lat = lane.latMin;
      p.latV = 0;
    } else if (p.lat > lane.latMax) {
      p.lat = lane.latMax;
      p.latV = 0;
    }
    const q = this.tmp;
    p.hint = lane.path.at(p.s, q, p.hint);
    p.x = q.x - q.tz * p.lat;
    p.z = q.z + q.tx * p.lat;
    const yt = Math.atan2(p.dir * q.tx, p.dir * q.tz);
    p.yaw += angleDiff(yt, p.yaw) * Math.min(1, dt * 7);
  }
}
