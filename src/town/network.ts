import { MeshBatch, beam } from './batch';
import { DEC0_Y, DEC1_Y, DEC2_Y, DEC3_Y, type Ctx } from './ctx';
import { Frame } from './frame';
import { plazaW, railW, RAIL_HALF, roadClearance, roadsW, stationRect, type Pt } from './site';
import { PLATFORM, platformObstacles } from './platform';
import { heightAt } from './terrain';
import { hex, type RGB, type V3 } from './util';

const ASPHALT = hex(0x4a4d57);
const SIDEWALK = hex(0xc9c6bd);
const LINE = hex(0xf4f4ee);
const BALLAST = hex(0x8c857c);
const SLEEPER = hex(0x5d4a3c);
const RAIL = hex(0x9a9ca8);
const CONCRETE = hex(0xd6d3cb);
const YELLOW = hex(0xf0c62a);

interface Sample {
  x: number;
  z: number;
  nx: number;
  nz: number;
  /** distance along the polyline */
  s: number;
}

/** Resamples a polyline at most `step` apart, keeping the original vertices, with left-hand normals. */
export function samplePolyline(pts: readonly Pt[], step: number): Sample[] {
  const out: Sample[] = [];
  let s = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const n = Math.max(1, Math.ceil(len / step));
    const dx = (b.x - a.x) / len;
    const dz = (b.z - a.z) / len;
    for (let k = 0; k < n; k++) {
      out.push({ x: a.x + (b.x - a.x) * (k / n), z: a.z + (b.z - a.z) * (k / n), nx: -dz, nz: dx, s: s + len * (k / n) });
    }
    s += len;
  }
  const last = pts[pts.length - 1]!;
  const prev = pts[pts.length - 2]!;
  const dl = Math.hypot(last.x - prev.x, last.z - prev.z);
  out.push({ x: last.x, z: last.z, nx: -(last.z - prev.z) / dl, nz: (last.x - prev.x) / dl, s });
  // smooth normals at the joints
  for (let i = 1; i + 1 < out.length; i++) {
    const a = out[i - 1]!;
    const b = out[i + 1]!;
    const nx = a.nx + b.nx;
    const nz = a.nz + b.nz;
    const l = Math.hypot(nx, nz) || 1;
    out[i]!.nx = nx / l;
    out[i]!.nz = nz / l;
  }
  return out;
}

function ribbon(b: MeshBatch, samples: readonly Sample[], off0: number, off1: number, yOff: number, color: RGB, keep?: (s: Sample) => boolean): void {
  let left: V3[] = [];
  let right: V3[] = [];
  const flush = (): void => {
    if (left.length > 1) b.strip(left, right, color);
    left = [];
    right = [];
  };
  for (const sm of samples) {
    if (keep && !keep(sm)) {
      flush();
      continue;
    }
    const lx = sm.x + sm.nx * off1;
    const lz = sm.z + sm.nz * off1;
    const rx = sm.x + sm.nx * off0;
    const rz = sm.z + sm.nz * off0;
    left.push([lx, heightAt(lx, lz) + yOff, lz]);
    right.push([rx, heightAt(rx, rz) + yOff, rz]);
  }
  flush();
}

export function buildRoads(c: Ctx): void {
  for (const r of roadsW) {
    const smp = samplePolyline(r.pts, 60);
    const hw = r.width / 2;
    ribbon(c.dec2, smp, -hw, hw, DEC2_Y, ASPHALT);
    ribbon(c.dec0, smp, hw - 2, hw + 13, DEC0_Y, SIDEWALK);
    ribbon(c.dec0, smp, -hw - 13, -hw + 2, DEC0_Y, SIDEWALK);
    // dashed centre line
    const total = smp[smp.length - 1]!.s;
    const fine = samplePolyline(r.pts, 6);
    for (let d = 10; d < total - 30; d += 52) {
      const seg = fine.filter((q) => q.s >= d && q.s <= d + 28);
      if (seg.length < 2) continue;
      const mid = seg[Math.floor(seg.length / 2)]!;
      if (roadClearance(mid.x, mid.z, r.id).d < 4) continue; // junction
      const ex = (mid.x - plazaW.x) / plazaW.rx;
      const ez = (mid.z - plazaW.z) / plazaW.rz;
      if (ex * ex + ez * ez < 1.05) continue;
      ribbon(c.dec3, seg, -1.1, 1.1, DEC3_Y, LINE);
    }
  }
}

// Zebra crossings, stop lines and the other street surface (kerbs, paving, tactile blocks, ...) are built from the
// junction layout in streetscape.ts, on top of the flat asphalt and sidewalk ribbons laid down by buildRoads.

/** Distance (along x) helpers for the straight station section. */
export function railCrossings(): { x: number; z: number; nx: number; nz: number; w: number }[] {
  const out: { x: number; z: number; nx: number; nz: number; w: number }[] = [];
  const smp = samplePolyline(railW, 8);
  let inRoad = false;
  let startIdx = 0;
  for (let i = 0; i < smp.length; i++) {
    const q = smp[i]!;
    const cl = roadClearance(q.x, q.z);
    const on = cl.d < RAIL_HALF * 0.6;
    if (on && !inRoad) {
      inRoad = true;
      startIdx = i;
    } else if (!on && inRoad) {
      inRoad = false;
      const mid = smp[Math.floor((startIdx + i) / 2)]!;
      const rd = roadClearance(mid.x, mid.z);
      out.push({ x: mid.x, z: mid.z, nx: mid.nx, nz: mid.nz, w: rd.road?.width ?? 80 });
    }
  }
  return out;
}

export function buildRailway(c: Ctx): void {
  const smp = samplePolyline(railW, 30);
  const onRoad = (s: Sample): boolean => roadClearance(s.x, s.z).d < 3;
  const keep = (s: Sample): boolean => !onRoad(s);
  ribbon(c.dec1, smp, -RAIL_HALF, RAIL_HALF, DEC1_Y, BALLAST, keep);
  ribbon(c.dec2, smp, -RAIL_HALF * 0.55, RAIL_HALF * 0.55, DEC2_Y, hex(0x9a938a), keep);
  // sleepers
  const fine = samplePolyline(railW, 11);
  for (const q of fine) {
    if (onRoad(q)) continue;
    const dx = q.nz;
    const dz = -q.nx;
    const hw = 11.5;
    const hl = 1.8;
    const y = heightAt(q.x, q.z) + DEC3_Y;
    c.dec3.quad(
      [q.x - q.nx * hw - dx * hl, y, q.z - q.nz * hw - dz * hl],
      [q.x + q.nx * hw - dx * hl, y, q.z + q.nz * hw - dz * hl],
      [q.x + q.nx * hw + dx * hl, y, q.z + q.nz * hw + dz * hl],
      [q.x - q.nx * hw + dx * hl, y, q.z - q.nz * hw + dz * hl],
      SLEEPER,
      [0, 1, 0],
    );
  }
  // rails
  const rs = samplePolyline(railW, 30);
  for (const off of [-6.6, 6.6]) {
    for (let i = 0; i + 1 < rs.length; i++) {
      const a = rs[i]!;
      const b = rs[i + 1]!;
      const m = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
      if (roadClearance(m.x, m.z).d < 3) continue;
      const ya = heightAt(a.x, a.z) + 0.55;
      const yb = heightAt(b.x, b.z) + 0.55;
      beam(c.main.at(m.x, m.z), [a.x + a.nx * off, ya + 1.2, a.z + a.nz * off], [b.x + b.nx * off, yb + 1.2, b.z + b.nz * off], 1.9, 2.4, RAIL);
    }
  }
  // buffer stop at the east end
  const end = railW[railW.length - 1]!;
  const prev = railW[railW.length - 2]!;
  const l = Math.hypot(end.x - prev.x, end.z - prev.z);
  const dx = (end.x - prev.x) / l;
  const dz = (end.z - prev.z) / l;
  const b = c.main.at(end.x, end.z);
  beam(b, [end.x - dz * 11 + dx * 2, 7, end.z + dx * 11 + dz * 2], [end.x + dz * 11 + dx * 2, 7, end.z - dx * 11 + dz * 2], 4, 9, hex(0xc8301f));

  // level crossing gates: a post on each side of the tracks at both road edges, arms lowered across the lane
  for (const x of railCrossings()) {
    const tx = x.nz; // track direction
    const tz = -x.nx;
    for (const s of [-1, 1]) {
      for (const e of [-1, 1]) {
        const px = x.x + x.nx * s * (RAIL_HALF + 12) + tx * e * (x.w / 2 + 6);
        const pz = x.z + x.nz * s * (RAIL_HALF + 12) + tz * e * (x.w / 2 + 6);
        const ex = px - tx * e * (x.w / 2 - 2);
        const ez = pz - tz * e * (x.w / 2 - 2);
        const bb = c.main.at(px, pz);
        bb.cylinder(px, pz, 0, 32, 1.4, 1.2, 6, hex(0x2b2b30));
        bb.blob(px, 36, pz, 3.5, 3.5, 3.5, hex(0xe03030), 0);
        for (let k = 0; k < 5; k++) {
          const t0 = k / 5;
          const t1 = (k + 1) / 5;
          beam(
            bb,
            [px + (ex - px) * t0, 26, pz + (ez - pz) * t0],
            [px + (ex - px) * t1, 26, pz + (ez - pz) * t1],
            1.6, 1.6, k % 2 ? hex(0xf2f2f2) : hex(0xd83030),
          );
        }
      }
    }
  }

  // overhead line poles beside the track
  const poleSpacing = 170;
  const poles: V3[] = [];
  const dense = samplePolyline(railW, 5);
  let next = 40;
  for (const q of dense) {
    if (q.s < next) continue;
    next += poleSpacing;
    if (roadClearance(q.x, q.z).d < 18) continue;
    const px = q.x + q.nx * -26;
    const pz = q.z + q.nz * -26;
    if (px > stationRect.minX - 20 && px < stationRect.maxX + 20 && pz > stationRect.minZ - 20 && pz < stationRect.maxZ + 20) {
      poles.push([q.x, 86, q.z]);
      continue;
    }
    const bb = c.main.at(px, pz);
    bb.cylinder(px, pz, 0, 100, 2.2, 1.6, 6, hex(0x8a8d96));
    beam(bb, [px, 94, pz], [q.x, 94, q.z], 2.2, 2.2, hex(0x8a8d96));
    poles.push([q.x, 86, q.z]);
  }
  for (let i = 0; i + 1 < poles.length; i++) {
    const a = poles[i]!;
    const b2 = poles[i + 1]!;
    if (Math.hypot(a[0] - b2[0], a[2] - b2[2]) > poleSpacing * 1.6) continue;
    c.main.at(a[0], a[2]).wire([a, b2], 0.7, hex(0x3a3a40));
  }
}

const STATION_ROOF = hex(0x2f6fb5);
const STATION_WALL = hex(0xf3ecde);

export function buildStation(c: Ctx): void {
  const trackZ = 804;
  const x0 = -560;
  const x1 = 680;
  const h = 6;
  const b = c.main.at(0, trackZ);
  // platforms
  b.box(x0, x1, 0, h, 628, 780, CONCRETE, { top: hex(0xe3e0d8) });
  b.box(x0, x1, 0, h, 828, 980, CONCRETE, { top: hex(0xe3e0d8) });
  // ramps: the west ends of both platforms and a ramp from the plaza onto the south platform
  const conc = hex(0xd9d6ce);
  const up: V3 = [0, 1, 0];
  const rx0 = x0 - PLATFORM.rampLen;
  for (const [za, zb] of [[628, 780], [828, 980]] as [number, number][]) {
    b.quad([rx0, 0.2, za], [rx0, 0.2, zb], [x0, h, zb], [x0, h, za], hex(0xe3e0d8), up);
    b.tri([rx0, 0.2, za], [x0, 0.2, za], [x0, h, za], conc, [0, 0, -1]);
    b.tri([rx0, 0.2, zb], [x0, h, zb], [x0, 0.2, zb], conc, [0, 0, 1]);
    // yellow edge line along the top of the ramp
    b.box(x0 - 3, x0 - 1, h - 0.1, h + 0.3, za, zb, YELLOW);
  }
  const pr = PLATFORM.plazaRamp;
  const pz0 = pr.z0;
  b.quad([pr.x0, 0.2, pz0], [pr.x1, 0.2, pz0], [pr.x1, h, 628], [pr.x0, h, 628], hex(0xe3e0d8), up);
  b.tri([pr.x0, 0.2, pz0], [pr.x0, h, 628], [pr.x0, 0.2, 628], conc, [-1, 0, 0]);
  b.tri([pr.x1, 0.2, pz0], [pr.x1, 0.2, 628], [pr.x1, h, 628], conc, [1, 0, 0]);
  b.box(pr.x0, pr.x1, h - 0.1, h + 0.3, 629, 631, YELLOW);
  // low guard walls along the platform edges that have no access (solid for the player via obstacles)
  c.obstacles.push(...platformObstacles());
  // yellow safety lines (real geometry: the platform tops are above the decal layers)
  b.box(x0, x1, h, h + 0.35, 770, 774, YELLOW);
  b.box(x0, x1, h, h + 0.35, 834, 838, YELLOW);

  // station building (south platform, entrance facing the plaza = south)
  const f = new Frame(0, 664, 0, -1); // front faces -z
  const hu = 190;
  const hv = 38;
  f.box(b, -hu, hu, h, h + 46, -hv, hv, STATION_WALL, { sides: STATION_WALL });
  f.box(b, -hu, hu, h, h + 4, -hv - 1, hv + 1, hex(0xb9b4a8)); // plinth
  f.gable(b, -hu, hu, -hv, hv, h + 46, 24, 'u', 14, STATION_ROOF, STATION_WALL);
  // entrance canopy
  f.box(b, -70, 70, h + 34, h + 38, hv, hv + 34, hex(0x2f6fb5));
  for (const u of [-64, 64]) f.box(b, u - 2, u + 2, h, h + 34, hv + 28, hv + 32, hex(0x9a9ca8));
  // glass front with doors
  const glass = hex(0x8fc4e8);
  f.facade(b, -150, -80, h + 8, h + 30, hv + 0.6, 1, glass);
  f.facade(b, 80, 150, h + 8, h + 30, hv + 0.6, 1, glass);
  f.facade(b, -40, 40, h + 2, h + 30, hv + 0.6, 1, hex(0x6fa8d8));
  f.facade(b, -2, 2, h + 2, h + 30, hv + 0.8, 1, hex(0x3a4a5c));
  for (let k = -3; k <= 3; k++) {
    if (Math.abs(k) < 1) continue;
    f.facade(b, k * 60 - 18, k * 60 + 18, h + 34, h + 42, hv + 0.6, 1, glass);
  }
  // sign on the front wall above the canopy
  const uv = c.atlas.uv('駅');
  const sb = c.signs.at(0, 700);
  const sw = 92;
  const sh = 23;
  const y0 = h + 47;
  const v = hv + 1.0;
  sb.quad(f.pt(sw, y0, v), f.pt(-sw, y0, v), f.pt(-sw, y0 + sh, v), f.pt(sw, y0 + sh, v), [1, 1, 1], f.dir(0, 0, 1), [
    [uv.u0, uv.v0], [uv.u1, uv.v0], [uv.u1, uv.v1], [uv.u0, uv.v1],
  ]);
  // same sign at the back (facing the tracks)
  const vb = -hv - 1.0;
  sb.quad(f.pt(-sw, y0, vb), f.pt(sw, y0, vb), f.pt(sw, y0 + sh, vb), f.pt(-sw, y0 + sh, vb), [1, 1, 1], f.dir(0, 0, -1), [
    [uv.u0, uv.v0], [uv.u1, uv.v0], [uv.u1, uv.v1], [uv.u0, uv.v1],
  ]);
  c.obstacles.push({ minX: -hu, maxX: hu, minZ: 664 - hv, maxZ: 664 + hv });

  // platform canopies (long slab roofs on posts)
  const canopy = (zc: number, depth: number, xa: number, xb: number): void => {
    b.box(xa, xb, h + 44, h + 48, zc - depth / 2, zc + depth / 2, hex(0xe9eef3), { top: hex(0x6d8fb8) });
    for (let x = xa + 20; x <= xb - 10; x += 100) {
      b.cylinder(x, zc + depth / 2 - 6, h, h + 44, 1.6, 1.6, 6, hex(0x7d8088));
    }
  };
  canopy(740, 70, -330, 330);
  canopy(900, 110, -330, 330);
  // benches
  for (const x of [-300, -120, 140, 360, 500]) {
    b.box(x - 12, x + 12, h + 4, h + 6, 750, 757, hex(0x7b5a3c));
    b.box(x - 12, x + 12, h + 6, h + 14, 756, 758, hex(0x7b5a3c));
  }
  for (const x of [-250, 20, 260]) {
    b.box(x - 12, x + 12, h + 4, h + 6, 905, 912, hex(0x7b5a3c));
    b.box(x - 12, x + 12, h + 6, h + 14, 911, 913, hex(0x7b5a3c));
  }
  // platform end ramps (visual) and a tall station name pole
  b.cylinder(-440, 790, h, h + 40, 1.2, 1.2, 6, hex(0x555a62));
  b.box(-462, -418, h + 40, h + 52, 788, 792, hex(0x1a56a8));
  const u2 = c.atlas.uv('駅');
  const sg = c.signs.at(-440, 790);
  for (const zz of [785.9, 794.1]) {
    const dirn: 1 | -1 = zz < 790 ? -1 : 1;
    sg.quad(
      dirn > 0 ? [-462, h + 41, zz] : [-418, h + 41, zz],
      dirn > 0 ? [-418, h + 41, zz] : [-462, h + 41, zz],
      dirn > 0 ? [-418, h + 51, zz] : [-462, h + 51, zz],
      dirn > 0 ? [-462, h + 51, zz] : [-418, h + 51, zz],
      [1, 1, 1], [0, 0, dirn],
      [[u2.u0, u2.v0], [u2.u1, u2.v0], [u2.u1, u2.v1], [u2.u0, u2.v1]],
    );
  }

  // footbridge over the tracks
  const bx = 430;
  b.box(bx - 12, bx + 12, 62, 66, 636, 972, hex(0xb7bcc6));
  b.box(bx - 12, bx + 12, 66, 70, 636, 972, hex(0x8794a8), { top: hex(0x5f78a0) });
  b.box(bx - 12, bx - 10, 66, 76, 636, 972, hex(0xd4dae3));
  b.box(bx + 10, bx + 12, 66, 76, 636, 972, hex(0xd4dae3));
  b.box(bx - 14, bx + 14, 76, 80, 636, 972, hex(0x4d78b0));
  for (const zz of [640, 968]) {
    b.box(bx - 14, bx + 14, h, 76, zz - 14, zz + 14, hex(0xcfd6e0));
    b.box(bx - 16, bx + 16, 76, 80, zz - 16, zz + 16, hex(0x4d78b0));
  }
  c.obstacles.push({ minX: bx - 14, maxX: bx + 14, minZ: 626, maxZ: 654 }, { minX: bx - 14, maxX: bx + 14, minZ: 954, maxZ: 982 });
}

export function buildPlaza(c: Ctx): void {
  const p = plazaW;
  const pave = hex(0xe6d9c6);
  const lawn = hex(0x8fd16a);
  const path = hex(0xf0e6d4);
  c.dec0.disc(p.x, p.z, DEC0_Y + 0.05, p.rx, p.rz, 64, pave);
  c.dec1.disc(p.x, p.z, DEC1_Y, p.rx * 0.84, p.rz * 0.8, 64, lawn);
  // paths: north-south axis and east-west axis
  c.dec2.quad([-34, DEC2_Y, -p.rz * 0.8], [34, DEC2_Y, -p.rz * 0.8], [34, DEC2_Y, p.rz + 40], [-34, DEC2_Y, p.rz + 40], path, [0, 1, 0]);
  c.dec2.quad([-p.rx * 0.84, DEC2_Y, -26], [p.rx * 0.84, DEC2_Y, -26], [p.rx * 0.84, DEC2_Y, 26], [-p.rx * 0.84, DEC2_Y, 26], path, [0, 1, 0]);
  // paving joints on the paths
  const joint = hex(0xd6cdbb);
  for (let z = -p.rz * 0.8 + 7; z < p.rz + 40; z += 14) c.dec3.quad([-34, DEC3_Y, z], [34, DEC3_Y, z], [34, DEC3_Y, z + 0.7], [-34, DEC3_Y, z + 0.7], joint, [0, 1, 0]);
  for (const x of [-11, 11]) c.dec3.quad([x, DEC3_Y, -p.rz * 0.8], [x + 0.7, DEC3_Y, -p.rz * 0.8], [x + 0.7, DEC3_Y, p.rz + 40], [x, DEC3_Y, p.rz + 40], joint, [0, 1, 0]);
  for (let x = -p.rx * 0.84 + 7; x < p.rx * 0.84; x += 14) c.dec3.quad([x, DEC3_Y, -26], [x + 0.7, DEC3_Y, -26], [x + 0.7, DEC3_Y, 26], [x, DEC3_Y, 26], joint, [0, 1, 0]);
  // fountain
  c.dec3.disc(0, 0, DEC3_Y, 78, 78, 32, hex(0xe6d9c6));
  const b = c.main.at(0, 0);
  b.cylinder(0, 0, 0, 9, 62, 62, 24, hex(0xcfc4b0));
  b.cylinder(0, 0, 8.5, 9, 54, 54, 24, hex(0x6fc3ee));
  b.cylinder(0, 0, 0, 24, 9, 6, 10, hex(0xcfc4b0));
  b.cylinder(0, 0, 24, 28, 22, 22, 16, hex(0xcfc4b0));
  b.cylinder(0, 0, 28, 29, 19, 19, 16, hex(0x78c8f0));
  b.blob(0, 40, 0, 5, 12, 5, hex(0xcfeeff), 0.1);
  // flower beds around the fountain
  const bedCols = [hex(0xff6f9a), hex(0xffd23f), hex(0xffffff), hex(0xff9a4a), hex(0xc77dff)];
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2;
    const r = 92;
    c.dec3.disc(Math.cos(a) * r, Math.sin(a) * r, DEC3_Y, 11, 11, 8, hex(0x4f9a3c));
    b.blob(Math.cos(a) * r, 4, Math.sin(a) * r, 6, 4, 6, bedCols[i % bedCols.length]!, 0.1, i);
  }
  // benches along the north-south path and lamps
  for (const z of [-300, -180, 180, 300, 420]) {
    for (const x of [-52, 52]) {
      const dir = x < 0 ? -1 : 1;
      b.box(x - 3, x + 3, 5, 7, z - 11, z + 11, hex(0x8a5f3a));
      b.box(x + dir * 2, x + dir * 4, 7, 15, z - 11, z + 11, hex(0x8a5f3a));
      b.box(x - 2, x - 1, 0, 5, z - 9, z - 8, hex(0x444444));
      b.box(x - 2, x - 1, 0, 5, z + 8, z + 9, hex(0x444444));
    }
  }
  for (const z of [-360, -240, 240, 360, 480]) {
    for (const x of [-40, 40]) {
      b.cylinder(x, z, 0, 46, 1.4, 1.2, 6, hex(0x3b3f48));
      b.blob(x, 49, z, 5.5, 5.5, 5.5, hex(0xfff3c8), 0);
    }
  }
}
