import { plazaW, roadClearance, roadsW } from '../town/site';
import { makeRng } from '../town/util';
import { CAR_KINDS } from './carmodels';
import { Path, newPathPt, polylineWindow, type Pt, type PathPt } from './path';

/**
 * Cars of the town: some parked along the kerbs, some driving slowly on the left lane of the roads (Japan drives on
 * the left), following the road polylines, turning around at the ends of their stretch and slowing near the plaza.
 * Pure logic (no Babylon): the poses are read by `life.ts`, which writes them into thin-instance matrices.
 */

export interface Car {
  kind: number;
  pal: number;
  /** length along the travel direction (spacing) */
  len: number;
  x: number;
  z: number;
  yaw: number;
  speed: number;
  /** wheel rotation (radians) */
  spin: number;
  parked: boolean;
  /** index inside the (kind, palette) instance set, assigned by the caller */
  slot: number;
  /** index among all cars of the same kind (for the wheel instances) */
  wslot: number;
  // driving state
  route: Route | null;
  dir: 1 | -1;
  /** arc length along the route's window path */
  s: number;
  vmax: number;
  /** 0 = driving, 1 = turning around at the end of the stretch */
  turning: 0 | 1;
  turnAngle: number;
  hint: number;
}

export interface Route {
  id: string;
  path: Path;
  hw: number;
  /** distance of the lane centre (left of the travel direction) from the road centre line */
  off: number;
  /** arc length range of the stretch on this path */
  s0: number;
  s1: number;
  cars: Car[];
}

/** Stretch of road where cars drive: from the point nearest `from` to the point nearest `to` */
interface Stretch {
  road: string;
  from: Pt;
  to: Pt;
  cars: number;
}

/** Drivable stretches (world coordinates). Windows keep U-turns away from the junctions of the (sparse) road net. */
export const STRETCHES: readonly Stretch[] = [
  { road: 'main-street', from: { x: 0, z: -700 }, to: { x: 24, z: -2900 }, cars: 5 },
  { road: 'east-road', from: { x: 330, z: -1152 }, to: { x: 3500, z: -1152 }, cars: 6 },
  { road: 'mountain-street', from: { x: -1000, z: -150 }, to: { x: -2400, z: -2500 }, cars: 4 },
  { road: 'west-road', from: { x: -3300, z: -45 }, to: { x: -1150, z: 22 }, cars: 3 },
  { road: 'ne-street', from: { x: 950, z: 560 }, to: { x: 1500, z: 1330 }, cars: 2 },
  { road: 'coast-road', from: { x: -2000, z: 1253 }, to: { x: 3300, z: 1530 }, cars: 3 },
  { road: 'univ-north-road', from: { x: 1750, z: 579 }, to: { x: 4000, z: 579 }, cars: 2 },
  { road: 'east-lane', from: { x: 3189, z: -1400 }, to: { x: 3189, z: -3200 }, cars: 1 },
  { road: 'south-lane', from: { x: 1126, z: -1350 }, to: { x: 1126, z: -3100 }, cars: 1 },
  { road: 'tower-lane', from: { x: 2519, z: -1350 }, to: { x: 2519, z: -3100 }, cars: 1 },
];

/** Relative frequency of the car kinds (compact, kei, retro, van, taxi, truck) */
const KIND_WEIGHT = [0.3, 0.3, 0.07, 0.12, 0.09, 0.12];

function pickWeighted(w: readonly number[], r: number): number {
  let t = 0;
  for (const v of w) t += v;
  let x = r * t;
  for (let i = 0; i < w.length; i++) {
    x -= w[i]!;
    if (x <= 0) return i;
  }
  return w.length - 1;
}

const CRUISE_MIN = 62;
const CRUISE_MAX = 98;
const TURN_SPEED = 26;
const MIN_GAP = 13;
/** Cars are kept this far from the ends of their stretch when placed */
const END_MARGIN = 90;

/** Slow-down factor near the plaza and the station (1 = free driving) */
export function zoneSpeed(x: number, z: number): number {
  const dx = (x - plazaW.x) / plazaW.rx;
  const dz = (z - plazaW.z) / plazaW.rz;
  const q = Math.sqrt(dx * dx + dz * dz); // 1 on the plaza edge
  const f = Math.min(1, Math.max(0, (q - 1.0) / 0.9));
  return 0.45 + 0.55 * f;
}

export class Traffic {
  readonly routes: Route[] = [];
  readonly cars: Car[] = [];
  private readonly tmp: PathPt = newPathPt();

  constructor(seed = 20261016) {
    const rnd = makeRng(seed);
    for (const st of STRETCHES) {
      const road = roadsW.find((r) => r.id === st.road);
      if (!road) continue;
      const full = new Path(road.pts, 20);
      const a = full.project(st.from.x, st.from.z);
      const b = full.project(st.to.x, st.to.z);
      const s0 = Math.min(a, b);
      const s1 = Math.max(a, b);
      const win = polylineWindow(road.pts, s0, s1);
      if (win.length < 2) continue;
      const path = new Path(win, 20);
      const hw = road.width / 2;
      const off = hw >= 45 ? Math.max(12.5, hw - 31.5) : hw * 0.5;
      const route: Route = { id: road.id, path, hw, off, s0: 0, s1: path.length, cars: [] };
      this.routes.push(route);
      this.placeDrivers(route, st.cars, rnd);
    }
    this.placeParked(rnd);
  }

  private newCar(kind: number, pal: number, parked: boolean): Car {
    return {
      kind,
      pal,
      len: CAR_KINDS[kind]!.length,
      x: 0,
      z: 0,
      yaw: 0,
      speed: 0,
      spin: 0,
      parked,
      slot: 0,
      wslot: 0,
      route: null,
      dir: 1,
      s: 0,
      vmax: 0,
      turning: 0,
      turnAngle: 0,
      hint: 0,
    };
  }

  private placeDrivers(route: Route, n: number, rnd: () => number): void {
    let placed = 0;
    let guard = 0;
    while (placed < n && guard++ < 400) {
      const dir: 1 | -1 = rnd() < 0.5 ? 1 : -1;
      const s = END_MARGIN + rnd() * Math.max(1, route.path.length - 2 * END_MARGIN);
      let ok = true;
      for (const o of route.cars) if (o.dir === dir && Math.abs(o.s - s) < 140) ok = false;
      if (!ok) continue;
      const kind = pickWeighted(KIND_WEIGHT, rnd());
      const pal = Math.floor(rnd() * CAR_KINDS[kind]!.palettes.length);
      const c = this.newCar(kind, pal, false);
      c.route = route;
      c.dir = dir;
      c.s = s;
      c.vmax = CRUISE_MIN + rnd() * (CRUISE_MAX - CRUISE_MIN);
      c.speed = c.vmax * 0.8;
      route.cars.push(c);
      this.cars.push(c);
      this.poseOnRoute(c);
      placed++;
    }
  }

  /** Cars parked at the kerb of the wider roads (inside their driving stretch, clear of the turning zones) */
  private placeParked(rnd: () => number): void {
    // spacing between parked cars (min, max) and the chance that a free spot is taken, per road
    const PARK: Record<string, { gap: [number, number]; chance: number }> = {
      'main-street': { gap: [90, 420], chance: 0.8 },
      'east-road': { gap: [100, 520], chance: 0.8 },
      'mountain-street': { gap: [110, 560], chance: 0.7 },
      'west-road': { gap: [150, 700], chance: 0.6 },
      'coast-road': { gap: [180, 800], chance: 0.6 },
    };
    for (const route of this.routes) {
      const cfg = PARK[route.id];
      if (!cfg || route.hw < 45) continue;
      const path = route.path;
      for (const side of [1, -1] as const) {
        let s = 140 + rnd() * 120;
        while (s < path.length - 140) {
          const kind = pickWeighted(KIND_WEIGHT, rnd());
          const pal = Math.floor(rnd() * CAR_KINDS[kind]!.palettes.length);
          const k = CAR_KINDS[kind]!;
          const sc = s + k.length / 2;
          s += k.length + cfg.gap[0] + rnd() * (cfg.gap[1] - cfg.gap[0]);
          if (rnd() > cfg.chance) continue;
          this.park(path, route.id, route.hw, sc, side, kind, pal);
        }
      }
    }
    // taxis waiting on the street that leaves the station plaza
    const ne = roadsW.find((r) => r.id === 'ne-street');
    if (ne) {
      const path = new Path(ne.pts, 20);
      const hw = ne.width / 2;
      this.park(path, ne.id, hw, 70, 1, 4, 0, true);
      this.park(path, ne.id, hw, 128, 1, 4, 1, true);
      this.park(path, ne.id, hw, 100, -1, 4, 0, true);
    }
  }

  /** Turns a car into another kind / colourway (keeps its place) */
  retarget(c: Car, kind: number, pal: number): void {
    c.kind = kind;
    c.pal = pal;
    c.len = CAR_KINDS[kind]!.length;
  }

  /** Parks an extra car at the kerb of `roadId` nearest to (x,z), on the side of the road that point is on */
  parkNear(roadId: string, x: number, z: number, kind: number, pal: number): Car | undefined {
    const road = roadsW.find((r) => r.id === roadId);
    if (!road) return undefined;
    const path = new Path(road.pts, 20);
    const s = path.project(x, z);
    const p = this.tmp;
    path.at(s, p);
    const side: 1 | -1 = (x - p.x) * -p.tz + (z - p.z) * p.tx >= 0 ? 1 : -1;
    const before = this.cars.length;
    this.park(path, roadId, road.width / 2, s, side, kind, pal, true);
    return this.cars.length > before ? this.cars[this.cars.length - 1] : undefined;
  }

  /** Parks one car at arc length `s` of a road path on the given side (+1 = left of the path direction) */
  private park(path: Path, roadId: string, hw: number, s: number, side: 1 | -1, kind: number, pal: number, force = false): void {
    const k = CAR_KINDS[kind]!;
    const p = this.tmp;
    path.at(s, p);
    const lat = side * (hw - 1.2 - k.width / 2);
    const x = p.x - p.tz * lat;
    const z = p.z + p.tx * lat;
    // not at a cross street, not on the plaza
    if (!force && roadClearance(x, z, roadId).d < 34) return;
    if (!force && zoneSpeed(x, z) < 0.5) return;
    const c = this.newCar(kind, pal, true);
    c.x = x;
    c.z = z;
    // parked in the direction of traffic on that side of the road
    c.yaw = Math.atan2(side * p.tx, side * p.tz);
    this.cars.push(c);
  }

  /** Writes the pose of a driving car from its route position */
  private poseOnRoute(c: Car): void {
    const r = c.route!;
    const p = this.tmp;
    c.hint = r.path.at(c.s, p, c.hint);
    const lat = c.dir * r.off;
    c.x = p.x - p.tz * lat;
    c.z = p.z + p.tx * lat;
    c.yaw = Math.atan2(c.dir * p.tx, c.dir * p.tz);
  }

  update(dt: number): void {
    for (const r of this.routes) {
      for (const c of r.cars) this.step(r, c, dt);
    }
  }

  private step(r: Route, c: Car, dt: number): void {
    const p = this.tmp;
    if (c.turning === 1) {
      // half circle from the lane we came in on to the opposite lane
      c.turnAngle += (TURN_SPEED / r.off) * dt;
      const endS = c.dir === 1 ? r.s1 : r.s0;
      r.path.at(endS, p, c.hint);
      const a = Math.min(Math.PI, c.turnAngle);
      const nx = -p.tz;
      const nz = p.tx;
      const ca = Math.cos(a) * r.off;
      const sa = Math.sin(a) * r.off;
      c.x = p.x + c.dir * (nx * ca + p.tx * sa);
      c.z = p.z + c.dir * (nz * ca + p.tz * sa);
      const hx = c.dir * (-nx * Math.sin(a) + p.tx * Math.cos(a));
      const hz = c.dir * (-nz * Math.sin(a) + p.tz * Math.cos(a));
      c.yaw = Math.atan2(hx, hz);
      c.speed = TURN_SPEED;
      c.spin += (TURN_SPEED * dt) / 3.7;
      if (c.turnAngle >= Math.PI) {
        c.turning = 0;
        c.dir = c.dir === 1 ? -1 : 1;
        c.s = endS;
        this.poseOnRoute(c);
      }
      return;
    }
    // desired speed: cruising, slower near the plaza, limited by the car ahead in the same lane
    let target = c.vmax * zoneSpeed(c.x, c.z);
    for (const o of r.cars) {
      if (o === c) continue;
      let ahead: number;
      let ov: number;
      if (o.turning === 1) {
        // a car turning at the end blocks the lane that leads there
        const endS = o.dir === 1 ? r.s1 : r.s0;
        if (endS !== (c.dir === 1 ? r.s1 : r.s0)) continue;
        ahead = (endS - c.s) * c.dir;
        ov = 0;
      } else {
        if (o.dir !== c.dir) continue;
        ahead = (o.s - c.s) * c.dir;
        ov = o.speed;
      }
      if (ahead <= 0 || ahead > 160) continue;
      const gap = ahead - (c.len + o.len) / 2;
      const limit = Math.max(0, ov + (gap - MIN_GAP) * 1.4);
      if (limit < target) target = limit;
    }
    const acc = target > c.speed ? 38 : 150;
    c.speed += Math.max(-acc * dt, Math.min(acc * dt, target - c.speed));
    if (c.speed < 0.05) c.speed = 0;
    c.s += c.dir * c.speed * dt;
    c.spin += (c.speed * dt) / 3.7;
    // reached the end of the stretch: turn around
    if (c.dir === 1 ? c.s >= r.s1 : c.s <= r.s0) {
      c.s = c.dir === 1 ? r.s1 : r.s0;
      c.turning = 1;
      c.turnAngle = 0;
      return;
    }
    this.poseOnRoute(c);
  }
}
