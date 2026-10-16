import type { Spot } from '../town/ctx';
import { plazaW, roadClearance, roadsW } from '../town/site';
import { makeRng } from '../town/util';
import { Path, newPathPt, type PathPt, type Pt } from './path';

/**
 * The people of the town (pure logic, no Babylon): walkers on the sidewalks and the plaza paths, dogs on a lead,
 * people standing at shop fronts, sitting on benches and chairs, and the shop / station staff (the station concourse
 * has its own passengers and attendant, built with the station, so nobody is put in there). Walkers keep to the left
 * (like in Japan), avoid each other and the solid footprints ahead of them (furniture, walls) by moving sideways, and
 * turn around at the end of their stretch or where there is no way round.
 *
 * Where a person may stand or sit, and what is solid, is asked of a `CrowdEnv`: in the game it looks at the real
 * geometry of the town (decks, steps, benches, `town.obstacles`), in tests it is flat and free.
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
  /** height of the person's origin above the terrain (sidewalk, floor of a deck, seat top for sitters) */
  surface: number;
  /** sitters: height of the seat above the floor the feet rest on (selects the pose variant) */
  seatH: number;
  /** staff are never taken away from their post */
  staff: boolean;
  /** a dog on a lead (drawn by its own mesh, not counted as a person) */
  animal: boolean;
  /** removed from the scene (stood in front of the camera) */
  hidden: boolean;
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
  /** walking together: this person follows `buddy` (its leader) at a lateral offset, `lead` units ahead of it along the way (negative: behind) */
  buddy: Person | null;
  buddyOff: number;
  lead: number;
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

/** What the crowd needs to know about the place it is put in */
export interface CrowdEnv {
  /** terrain height */
  ground(x: number, z: number): number;
  /** absolute height of a free, flat floor at (x, z), or undefined when it is not a place to stand */
  stand(x: number, z: number): number | undefined;
  /** absolute height of the seat top if a seat of about `top` height really is at (x, z), else undefined */
  seat(x: number, z: number, top: number): number | undefined;
  /** is (x, z) inside a solid footprint (grown by m)? */
  solid(x: number, z: number, m: number): boolean;
}

export const FLAT_ENV: CrowdEnv = { ground: () => 0, stand: () => 0, seat: (_x, _z, top) => top, solid: () => false };

export interface CrowdCast {
  walkers: readonly number[];
  jogger: number;
  wagashi: number;
  cafe: number;
  station: number;
  /** the convenience store clerk, and the dog and the outfits of the people who walk it (all optional) */
  conbini?: number;
  dog?: number;
  dogOwners?: readonly number[];
  /** outfits of the seated people: for low seats (chairs, 6 units) and high seats (benches, 7 units) */
  sitters: { low: readonly number[]; high: readonly number[] };
}

/** Seated poses come in two seat heights; the feet of everyone land within half a unit of the floor */
export const SEAT_LOW = 6.2;
export const SEAT_HIGH = 7.2;

/** Walkers use the strip of the sidewalk beyond the kerb and the yellow tactile strip (3.5 to 7.5 from the road edge) ... */
const SIDEWALK_NEAR = 6.8;
/** ... and before the street clutter (bikes, vending machines: from 13.3 on) */
const SIDEWALK_FAR = 12.6;
const SIDEWALK_Y = 0.2;
const PATH_Y = 0.45;

/** Where walkers look for solid footprints: here, 5 and 10 units ahead (along the way they are going) */
const LOOK_AT: readonly number[] = [0, 5, 10];
/** Clearance a walker keeps from solid footprints */
const BODY = 1.9;

const TWO_PI = Math.PI * 2;
const angleDiff = (a: number, b: number): number => Math.atan2(Math.sin(a - b), Math.cos(a - b));

/** Door position (u along the front) of the hand-built shops; the others follow the `addShop` rule */
const FEATURED_DOOR: Readonly<Record<string, number>> = { 'e-wagashi': -2, 'w-cafe': 4, 'w-conbini': 13 };

/** Where the shop door is on its frontage */
export function doorU(id: string, hu: number): number {
  return FEATURED_DOOR[id] ?? (hu > 60 ? 1 : 0) * hu * 0.35 * (id.length % 2 ? 1 : -1);
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
  /** The look-ahead points of the walker being updated (see `LOOK_AT`) */
  private readonly look: PathPt[] = LOOK_AT.map(() => newPathPt());
  private readonly rnd: () => number;
  private bag: number[] = [];

  constructor(
    spots: Readonly<Record<string, Spot>>,
    private readonly cast: CrowdCast,
    private readonly env: CrowdEnv = FLAT_ENV,
    seed = 77123,
  ) {
    this.rnd = makeRng(seed);
    this.buildSidewalkLanes();
    this.buildPlazaLanes();
    this.placeWalkers(spots);
    this.placeDogs(spots);
    this.placeShopFolk(spots);
    this.placeStationFolk();
    this.placeBenchSitters();
  }

  // ---------------------------------------------------------------------------------------------- construction

  private nextOutfit(): number {
    if (this.bag.length === 0) {
      this.bag = [...this.cast.walkers];
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
      seatH: 0,
      staff: false,
      animal: false,
      hidden: false,
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
      lead: -1.4,
    };
  }

  private buildSidewalkLanes(): void {
    for (const road of roadsW) {
      const path = new Path(road.pts, 20);
      const hw = road.width / 2;
      for (const side of [1, -1] as const) {
        // keep left: walking along the path on the left sidewalk uses its outer half, on the right sidewalk its inner half
        const outer = hw + 11.4;
        const inner = hw + 9.0;
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
        this.lanes.push(lane);
        this.laneByKey.set(lane.id, lane);
      }
    }
  }

  private addLane(id: string, pts: Pt[], half: number, surface = PATH_Y): Lane {
    const lane: Lane = { id, path: new Path(pts, 20), latMin: -half, latMax: half, prefPlus: half * 0.42, prefMinus: -half * 0.42, surface, walkers: [] };
    this.lanes.push(lane);
    this.laneByKey.set(id, lane);
    return lane;
  }

  private buildPlazaLanes(): void {
    const p = plazaW;
    // the paved axes: north-south (north of the fountain towards the station, and south of it) and east-west
    this.addLane('plaza-n', [{ x: 0, z: 125 }, { x: 0, z: 585 }], 24);
    this.addLane('plaza-s', [{ x: 0, z: -125 }, { x: 0, z: -520 }], 24);
    this.addLane('plaza-e', [{ x: 130, z: 0 }, { x: p.rx * 0.8, z: 0 }], 18);
    this.addLane('plaza-w', [{ x: -130, z: 0 }, { x: -p.rx * 0.8, z: 0 }], 18);
    // the paved ring around the lawn (a closed loop for the jogger)
    const ring: Pt[] = [];
    const n = 72;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * TWO_PI;
      ring.push({ x: Math.cos(a) * p.rx * 0.92, z: Math.sin(a) * p.rz * 0.9 });
    }
    this.addLane('plaza-ring', ring, 14);
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
      this.pose(p);
      if (this.env.solid(p.x, p.z, 1.5)) continue; // a pole or a piece of furniture is there
      lane.walkers.push(p);
      this.people.push(p);
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
      const road = roadClearance(fx, fz).road;
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
        const w = this.addWalker(useOther ? other : lane, s0, s1, this.nextOutfit(), dir, speed());
        // sometimes two people walk together
        if (w && rnd() < 0.18) this.addBuddy(w, this.nextOutfit());
      }
    }
    // plaza paths
    const plazaGroups: [string, number][] = [['plaza-n', 4], ['plaza-s', 3], ['plaza-e', 2], ['plaza-w', 2]];
    for (const [id, n] of plazaGroups) {
      const lane = this.laneByKey.get(id)!;
      for (let i = 0; i < n; i++) this.addWalker(lane, 5, lane.path.length - 5, this.nextOutfit(), rnd() < 0.5 ? 1 : -1, speed());
    }
    // a jogger around the plaza ring (the ring is a closed loop: arc length wraps)
    const ring = this.laneByKey.get('plaza-ring')!;
    const j = this.addWalker(ring, 0, ring.path.length, this.cast.jogger, 1, 36);
    if (j) j.s1 = ring.path.length * 1e6; // never turns around
  }

  /** A dog on a lead trotting a few units ahead of its owner along the owner's lane */
  private addDog(owner: Person, dog: number): void {
    const lane = owner.lane!;
    const p = this.newPerson(dog, 'walk');
    p.animal = true;
    p.lane = lane;
    p.s0 = owner.s0;
    p.s1 = owner.s1;
    p.dir = owner.dir;
    p.vmax = owner.vmax;
    p.speed = owner.speed;
    p.lead = 4.6;
    p.s = owner.s + owner.dir * p.lead;
    p.surface = lane.surface;
    const mid = (lane.latMin + lane.latMax) / 2;
    p.buddyOff = owner.lat >= mid ? -3.4 : 3.4;
    p.lat = Math.min(lane.latMax, Math.max(lane.latMin, owner.lat + p.buddyOff));
    p.buddy = owner;
    lane.walkers.push(p);
    this.people.push(p);
    this.pose(p);
    p.yaw = p.yawTarget;
  }

  /**
   * Dogs on a lead, with the people who walk them: on the cherry avenue (comparison view 4) and the sidewalk of the
   * convenience store (view 2), both coming towards the viewer, and one on the plaza path.
   */
  private placeDogs(spots: Readonly<Record<string, Spot>>): void {
    const dog = this.cast.dog;
    const owners = this.cast.dogOwners;
    if (dog === undefined || !owners || owners.length === 0) return;
    const rnd = this.rnd;
    const pair = (lane: Lane | undefined, s: number, dir: 1 | -1, owner: number): void => {
      if (!lane) return;
      const w = this.addWalker(lane, Math.max(40, s - 240), Math.min(lane.path.length - 40, s + 240), owner, dir, 12.5 + rnd() * 2);
      if (!w) return;
      w.s = Math.min(lane.path.length - 20, Math.max(20, s));
      this.pose(w);
      w.yaw = w.yawTarget;
      this.addDog(w, dog);
    };
    // cherry avenue: view 4 stands 420 along the street (as the crow flies from its first point) and looks ahead
    const mountain = roadsW.find((r) => r.id === 'mountain-street');
    const avenue = this.laneByKey.get('mountain-street:1');
    if (mountain && avenue) {
      const a = mountain.pts[0]!;
      const b = mountain.pts[mountain.pts.length - 1]!;
      const l = Math.hypot(b.x - a.x, b.z - a.z) || 1;
      const sCam = avenue.path.project(a.x + ((b.x - a.x) / l) * 420, a.z + ((b.z - a.z) / l) * 420);
      pair(avenue, sCam + 105, -1, owners[0]!);
    }
    // the convenience store: view 2 stands at the end of the frontage away from the station and looks along the street
    const conb = spots['w-conbini'];
    if (conb) {
      const fx = conb.x + conb.fx * conb.hv;
      const fz = conb.z + conb.fz * conb.hv;
      const road = roadClearance(fx, fz).road;
      const first = road ? this.laneByKey.get(`${road.id}:1`) : undefined;
      if (road && first) {
        const s = first.path.project(fx, fz);
        const q = this.tmp;
        first.path.at(s, q);
        const side: 1 | -1 = (fx - q.x) * -q.tz + (fz - q.z) * q.tx >= 0 ? 1 : -1;
        const toStation: 1 | -1 = -fx * q.tx + (600 - fz) * q.tz >= 0 ? 1 : -1;
        pair(this.laneByKey.get(`${road.id}:${side}`), s + toStation * 6, toStation === 1 ? -1 : 1, owners[Math.min(1, owners.length - 1)]!);
      }
    }
    // a walk on the plaza path towards the station
    pair(this.laneByKey.get('plaza-n'), 300, 1, owners[Math.min(2, owners.length - 1)]!);
  }

  private place(outfit: number, mode: Mode, x: number, z: number, yaw: number, staff = false): Person {
    const p = this.newPerson(outfit, mode);
    p.x = x;
    p.z = z;
    p.yaw = p.yawTarget = yaw;
    p.staff = staff;
    this.people.push(p);
    return p;
  }

  /**
   * Puts a standing person at the first free place among the candidates (absolute x, z). `minRise`: the floor must
   * be at least that far above the terrain (a room inside a shop; the plain ground there would be inside a wall).
   * `clear`: when set, the place must also be that far from every solid footprint (street furniture, walls) - for
   * people standing out in the street; on a deck or inside a shop the footprint of the building itself is under them.
   */
  private standAt(outfit: number, cands: readonly Pt[], yaw: number, staff = false, apart = 7, minRise = 0, clear = 0): Person | null {
    for (const c of cands) {
      if (clear > 0 && this.env.solid(c.x, c.z, clear)) continue;
      const y = this.env.stand(c.x, c.z);
      if (y === undefined || y - this.env.ground(c.x, c.z) < minRise) continue;
      if (this.people.some((o) => o.mode !== 'walk' && Math.hypot(o.x - c.x, o.z - c.z) < apart)) continue;
      const p = this.place(outfit, 'stand', c.x, c.z, yaw, staff);
      p.surface = y - this.env.ground(c.x, c.z);
      return p;
    }
    return null;
  }

  /**
   * Puts a seated person on a seat, if such a seat really is there: its top is about `top` above the terrain and
   * `floorTop` above the floor the feet rest on (the same unless the floor is raised, like the cafe deck).
   */
  private sitAt(x: number, z: number, yaw: number, top: number, floorTop = top): Person | null {
    const y = this.env.seat(x, z, top);
    if (y === undefined) return null;
    if (this.people.some((o) => o.mode === 'sit' && Math.hypot(o.x - x, o.z - z) < 4.5)) return null;
    const high = floorTop >= 6.8;
    const pool = high ? this.cast.sitters.high : this.cast.sitters.low;
    const outfit = pool[Math.floor(this.rnd() * pool.length)]!;
    const p = this.place(outfit, 'sit', x, z, yaw);
    p.surface = y - this.env.ground(x, z);
    p.seatH = high ? SEAT_HIGH : SEAT_LOW;
    return p;
  }

  private shuffle<T>(a: T[]): T[] {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this.rnd() * (i + 1));
      [a[i], a[j]] = [a[j]!, a[i]!];
    }
    return a;
  }

  /** People at the shop fronts, the staff of the wagashi shop and the cafe, and customers on the red bench and the deck chairs */
  private placeShopFolk(spots: Readonly<Record<string, Spot>>): void {
    const rnd = this.rnd;
    const face = (sp: Spot, toShop: boolean): number => (toShop ? Math.atan2(-sp.fx, -sp.fz) : Math.atan2(sp.fx, sp.fz));
    // ordinary shops: one or two people near the door, chatting or looking into the window
    const ids = ['w-conbini', 'e-karaoke', 'e-clothes', 'w-book', 'w-ramen', 'e-sushi', 'e-super', 'w-flower', 'e-gohan', 'w-hotel'];
    for (const id of ids) {
      const sp = spots[id];
      if (!sp) continue;
      const du = doorU(id, sp.hu);
      const rx = sp.fz;
      const rz = -sp.fx;
      const pair = rnd() < 0.3;
      const cands: Pt[] = [];
      for (const off of [-20, 20, -14, 14, -9, 9, -26, 26]) for (const v of [8, 11, 14]) cands.push(shopPoint(sp, du + off, v));
      this.shuffle(cands);
      const a = this.standAt(this.nextOutfit(), cands, face(sp, rnd() < 0.75) + (rnd() - 0.5) * 0.5, false, 7, 0, 1.6);
      if (a && pair) {
        // a second person next to the first, turned towards them
        const near = [8.5, -8.5].map((d) => ({ x: a.x + rx * d, z: a.z + rz * d }));
        const b = this.standAt(this.nextOutfit(), near, 0, false, 7, 0, 1.6);
        if (b) {
          a.yawTarget = a.yaw = Math.atan2(b.x - a.x, b.z - a.z);
          b.yawTarget = b.yaw = Math.atan2(a.x - b.x, a.z - b.z);
        }
      }
    }
    // the convenience store: the clerk behind the register and a customer reading magazines at the window (inside the shop)
    const conb = spots['w-conbini'];
    if (conb) {
      if (this.cast.conbini !== undefined) {
        const cands = [52, 57, 47, 60].map((u) => shopPoint(conb, u, -conb.hv - 3));
        this.standAt(this.cast.conbini, cands, face(conb, false), true, 7, 2.5);
      }
      const reader = [-40, -30, -52, -62].map((u) => shopPoint(conb, u, -19));
      this.standAt(this.nextOutfit(), reader, face(conb, false), false, 7, 2.5);
    }
    // the wagashi shop: the clerk beside the red bench serving tea, customers eating on the bench, someone looking at the sweets
    const wag = spots['e-wagashi'];
    if (wag) {
      const u0 = doorU('e-wagashi', wag.hu);
      this.standAt(
        this.cast.wagashi,
        [shopPoint(wag, -34, 18), shopPoint(wag, -34, 22), shopPoint(wag, u0 + 8, 15), shopPoint(wag, u0 - 4, 15)],
        face(wag, true) + 0.25,
        true,
      );
      // the red bench (縁台) runs from u = -48 to -20 in front of the shop, its seat 7.5 high
      this.shuffle([-46.5, -22.5]).forEach((u, i) => {
        // somebody is always having tea on the bench; sometimes two
        if (i === 0 || rnd() < 0.6) {
          const pt = shopPoint(wag, u, 6.2);
          this.sitAt(pt.x, pt.z, face(wag, false), 7.5);
        }
      });
      const cust = [shopPoint(wag, u0 + 16, 12), shopPoint(wag, u0 + 22, 15), shopPoint(wag, u0 + 9, 16)];
      this.standAt(this.nextOutfit(), cust, face(wag, true) + 0.2);
    }
    // the cafe: the waitress on the deck, customers at the tables
    const cafe = spots['w-cafe'];
    if (cafe) {
      const u0 = doorU('w-cafe', cafe.hu);
      this.standAt(this.cast.cafe, [shopPoint(cafe, u0 + 12, 14), shopPoint(cafe, u0 + 18, 10), shopPoint(cafe, u0 + 8, 20), shopPoint(cafe, u0 + 20, 22)], face(cafe, false) + 0.5, true);
      // chair seats at the tables of the deck: (u, v) and whether the person looks towards the street (+v) or the wall
      const seats: [number, number, boolean][] = [
        [34, 25.4, false],
        [-4, 5.6, true],
        [-44, 26.4, false],
        [-4, 22.4, false],
      ];
      for (const [u, v, towardStreet] of this.shuffle(seats)) {
        if (rnd() < 0.7) {
          const pt = shopPoint(cafe, u, v);
          this.sitAt(pt.x, pt.z, face(cafe, !towardStreet), 12, 6);
        }
      }
      // inside: the barista behind the counter (seen through the left window) and customers on the red stools
      // (the room's back wall is 18 units behind the middle of the shop, the counter 6 to 17 units in front of it, the stools 24)
      // (the aisle behind the counter is 5.4 wide: the barista stands in the middle of it)
      const back = -2 * cafe.hv + 18;
      const aisle: Pt[] = [];
      for (const dv of [3.3, 2.9, 3.7]) for (const u of [-12, -42, 0, -28]) aisle.push(shopPoint(cafe, u, back + dv));
      this.standAt(this.cast.cafe, aisle, face(cafe, false), true, 5, 3);
      for (const u of this.shuffle([-38, -22, -6])) {
        if (rnd() < 0.55) {
          const pt = shopPoint(cafe, u, back + 24);
          this.sitAt(pt.x, pt.z, face(cafe, true), 14.6, 8.4);
        }
      }
    }
  }

  /** People waiting in front of the station and a staff member on the entrance ramp; the platforms have their own passengers */
  private placeStationFolk(): void {
    const rnd = this.rnd;
    // forecourt: beside the entrance ramp (the lines of sight of the comparison cameras stay clear of them)
    const waits: [number, number][] = [[64, 596], [-70, 600], [88, 590], [-96, 606]];
    for (const [x, z] of waits) {
      const jitter = (): Pt => ({ x: x + (rnd() - 0.5) * 8, z: z + (rnd() - 0.5) * 8 });
      this.standAt(this.nextOutfit(), [jitter(), jitter(), { x, z }], 2.2 + rnd() * 1.5, false, 9, 0, 1.6);
    }
    // station staff at the top of the entrance ramp, facing the plaza
    this.standAt(this.cast.station, [{ x: 24, z: 610 }, { x: -24, z: 610 }, { x: 34, z: 604 }, { x: 52, z: 606 }], Math.PI, true);
    // and on the near platform, by the tracks
    this.standAt(this.cast.station, [{ x: 250, z: 766 }, { x: 262, z: 766 }, { x: 230, z: 764 }], 0.05, true);
  }

  /** People sitting on benches (only where a bench is really there): the plaza paths, the promenade and the station forecourt */
  private placeBenchSitters(): void {
    const rnd = this.rnd;
    // old plaza benches: seat 7 high, centre (x, z), the back on the outer side
    for (const z of [-300, -180, 180, 300, 420]) {
      for (const x of [-52, 52]) {
        if (rnd() > 0.42) continue;
        const yaw = x < 0 ? Math.PI / 2 : -Math.PI / 2;
        const n = rnd() < 0.3 ? 2 : 1;
        for (let i = 0; i < n; i++) this.sitAt(x, z + (n === 2 ? (i === 0 ? -5 : 5) : (rnd() - 0.5) * 8), yaw, 7);
      }
    }
    // benches on the promenade between the lawn and the rim, facing the middle of the plaza (seat 6.5 high)
    const p = plazaW;
    const NB = 16;
    for (let i = 0; i < NB; i++) {
      if (rnd() > 0.35) continue;
      const th = ((i + 0.5) / NB) * TWO_PI;
      const x = p.x + Math.cos(th) * p.rx * 0.93;
      const z = p.z + Math.sin(th) * p.rz * 0.93;
      let ix = -(x - p.x) / (p.rx * p.rx);
      let iz = -(z - p.z) / (p.rz * p.rz);
      const l = Math.hypot(ix, iz) || 1;
      ix /= l;
      iz /= l;
      this.sitAt(x - ix * 0.4, z - iz * 0.4, Math.atan2(ix, iz), 6.5);
    }
    // benches in front of the station facing the plaza
    for (const x of [-120, 120]) if (rnd() < 0.6) this.sitAt(x + (rnd() - 0.5) * 6, 603.4, Math.PI, 6.5);
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
      for (let i = 0; i < ws.length; i++) if (!ws[i]!.hidden) this.stepWalker(lane, ws[i]!, ws, dt);
    }
    for (const p of this.people) {
      if (p.mode === 'walk' || p.hidden) continue;
      // idle: breathing / shifting weight, slow glances
      p.idle += dt;
      p.yaw += angleDiff(p.yawTarget + Math.sin(p.idle * 0.45) * 0.06, p.yaw) * Math.min(1, dt * 3);
    }
  }

  /** Is the spot at lateral offset `lat` free of solid footprints at all the look-ahead points (see `clearOffset`)? */
  private freeAhead(lat: number): boolean {
    for (let i = 0; i < LOOK_AT.length; i++) {
      const q = this.look[i]!;
      if (this.env.solid(q.x - q.tz * lat, q.z + q.tx * lat, BODY)) return false;
    }
    return true;
  }

  /**
   * The lateral offset a walker aims for: `pref` if the way ahead is free there, else the nearest free offset beside it
   * within the lane, else NaN (no way round). The way ahead is checked here, a few steps ahead and a few behind.
   */
  private clearOffset(lane: Lane, p: Person, pref: number): number {
    for (let i = 0; i < LOOK_AT.length; i++) lane.path.at(p.s + p.dir * LOOK_AT[i]!, this.look[i]!, p.hint);
    if (this.freeAhead(pref)) return pref;
    for (let k = 1; k <= 7; k++) {
      const up = pref + k * 1.1;
      if (up <= lane.latMax && this.freeAhead(up)) return up;
      const down = pref - k * 1.1;
      if (down >= lane.latMin && this.freeAhead(down)) return down;
    }
    return NaN;
  }

  private stepWalker(lane: Lane, p: Person, ws: readonly Person[], dt: number): void {
    const loop = p.s1 > lane.path.length * 100;
    if (p.buddy) {
      // follow the leader: same stretch, speed and pauses
      const l = p.buddy;
      p.dir = l.dir;
      p.speed = l.speed;
      // (a limited catch-up speed: when the leader turns around, the dog trots over to the other side instead of jumping)
      const maxStep = (l.speed + 14) * dt;
      p.s += Math.max(-maxStep, Math.min(maxStep, l.s + l.dir * p.lead - p.s));
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
      if (o === p || o === p.buddy || o.buddy === p || o.hidden) continue;
      const ds = (o.s - p.s) * p.dir;
      if (ds < -3 || ds > 9) continue;
      const dl = p.lat - o.lat;
      if (Math.abs(dl) < 4.6) push += (dl >= 0 ? 1 : -1) * (4.6 - Math.abs(dl)) * 5;
    }
    let target = pref;
    if (p.buddy) target = p.buddy.lat + p.buddyOff;
    else if (p.pause <= 0) {
      // something solid ahead (a post box, a bench, a wall): aim for the nearest free place beside it, or turn round
      const free = this.clearOffset(lane, p, pref);
      if (Number.isNaN(free)) p.pause = 0.6 + this.rnd() * 1.4;
      else target = free;
    }
    // (the one who follows keeps up with a stiffer spring)
    const kp = p.buddy ? 11 : 4;
    const kd = p.buddy ? 6.2 : 3.2;
    p.latV += ((target - p.lat) * kp + push - p.latV * kd) * dt;
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
