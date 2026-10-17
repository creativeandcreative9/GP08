import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { Material } from '@babylonjs/core/Materials/material.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { type Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { type Scene } from '@babylonjs/core/scene.js';
import { type Texture } from '@babylonjs/core/Materials/Textures/texture.js';
import { ChunkedBatch, MeshBatch } from './batch';
import { DEC2_Y, DEC3_Y, type Ctx } from './ctx';
import { RoadPath, breaks, findArms, freeRuns, inPlaza, ivMerge, ivMinus, steep, type Iv } from './roadpath';
import { roadClearance, roadsW } from './site';
import { heightAt } from './terrain';
import * as T from './streettex';
import { clipPaving, type ClipPoint, type PavingVertex } from './paving';
import { hex, makeRng, mix, shade, type RGB, type V3 } from './util';

/**
 * The street surface: kerb stones, paved sidewalks, yellow tactile paving, zebra crossings, stop lines with the
 * painted 「止まれ」, white edge lines, gutter grates, manhole covers and a worn asphalt layer.
 *
 * Everything is laid along the road centre lines (`RoadPath`: arc length s, lateral offset o, o > 0 = left of the
 * direction of travel). The detail comes from textures on a few long strips (see streettex.ts), so the whole
 * street costs only a few ten thousand vertices. The flat sidewalk and asphalt ribbons of `buildRoads` stay
 * underneath as a base: the textured layers lie a hair above them with a slightly stronger depth bias, so any
 * gap in the overlay falls back to the plain colour instead of showing the grass.
 *
 * Solid geometry (kerbs) leaves gaps where roads meet and at crossings; decals simply stop short of other roads.
 */

// ---- dimensions (world units, 1 unit ~ 8 cm) -------------------------------------------------------------------
const KERB_W = 2;
const KERB_H = 1.6;
const SW_IN = 2; // the paved band starts under the asphalt ...
const SW_OUT = 23; // up to 1.84 m beyond the road edge; cut back at plots and crossing roads
const PAVE_U = 64; // texture repeat lengths along / across the strips
const PAVE_V = 4;
const KERB_U = 96;
const TAC_IN = 3.5; // tactile strip: from the road edge to its inner side
const TAC_W = 4;
const TAC_U = 16;
const GUT_W = 3;
const GUT_U = 8;
const ASPH_U = 512;
const ASPH_V = 128;
const EDGE_IN = 4.3; // white edge line, measured inwards from the asphalt edge
const EDGE_OUT = 6.5;
const ZEBRA_GAP = 17; // zebra: distance from the other road's asphalt edge
const ZEBRA_LEN = 36;
const ZEBRA_BAR = 5.6;
const ZEBRA_PITCH = 11.2;
const STOP_AT = ZEBRA_GAP + ZEBRA_LEN + 5;
const STOP_T = 4.5;
const TEXT_AT = STOP_AT + 16; // distance of the text's near end from the junction (glyph tops point at the stop line)
// The label cell is 512 x 128 texels with the glyphs in its middle (slots of 170 texels along the road, 100 texels wide).
// The quad covers the cell minus a 16 x 10 texel margin (so that the neighbouring atlas cells never bleed in at the
// low mip levels): TEXT_LEN world units for the 480 texels along the road, TEXT_W for the 108 across it. Road paint is
// stretched along the road so that drivers (and the eye-level camera) can read it.
const TEXT_LEN = 119;
const TEXT_W = 17.3;
const TEXT_LABEL = '止まれ';
/** Average distance between heaps of fallen petals along the kerb: the cherry avenue gets many, plain lanes few. */
const PETAL_SPACING: Record<string, number> = { 'mountain-street': 70, 'coast-road': 190, 'west-road': 170, 'main-street': 170 };

// ---- layers (all above the old flat decals, below the kerb top) --------------------------------------------------
const Y_PAVE = 0.17; // + rank * 0.008, so that at junctions the wider road's pavers win deterministically
const Y_TAC = 0.27;
const Y_ASPH = DEC2_Y + 0.01; // + rank * 0.004, likewise
const Y_GUT = DEC2_Y + 0.08;
const Y_MASK = DEC3_Y + 0.04;
const Y_PETAL = DEC3_Y + 0.02;

const LINE: RGB = hex(0xf4f4ee);
const WHITE: RGB = [1, 1, 1];
const UP: V3 = [0, 1, 0];
type UV = [number, number];

/** A strip between lateral offsets oa and ob from arc length sa to sb, lying on the ground at height y. */
function strip(
  b: MeshBatch,
  path: RoadPath,
  sa: number,
  sb: number,
  oa: number,
  ob: number,
  y: number,
  color: RGB,
  uv?: (s: number, o: number) => UV,
  maxLen = 240,
): void {
  const bs = breaks(path, sa, sb, (oa + ob) / 2, maxLen);
  const p = (s: number, o: number): V3 => {
    const [x, z] = path.at(s, o);
    return [x, heightAt(x, z) + y, z];
  };
  for (let i = 0; i + 1 < bs.length; i++) {
    const s0 = bs[i]!;
    const s1 = bs[i + 1]!;
    b.quad(p(s0, oa), p(s1, oa), p(s1, ob), p(s0, ob), color, UP, uv ? [uv(s0, oa), uv(s1, oa), uv(s1, ob), uv(s0, ob)] : undefined);
  }
}

interface PavingMask { polygon: ClipPoint[]; minX: number; maxX: number; minZ: number; maxZ: number }
function pavingMask(polygon: ClipPoint[]): PavingMask {
  return { polygon, minX: Math.min(...polygon.map(p => p.x)), maxX: Math.max(...polygon.map(p => p.x)), minZ: Math.min(...polygon.map(p => p.z)), maxZ: Math.max(...polygon.map(p => p.z)) };
}

/** Fill the available frontage without painting over a reserved plot or another carriageway. */
function pavedStrip(b: MeshBatch, path: RoadPath, sa: number, sb: number, side: 1 | -1, y: number, phaseU: number, phaseV: number, masks: readonly PavingMask[]): void {
  const near = side * (path.hw - SW_IN), far = side * (path.hw + SW_OUT);
  const bs = breaks(path, sa, sb, (near + far) / 2, 240);
  const vertex = (s: number, o: number): PavingVertex => { const [x, z] = path.at(s, o); return { x, z, u: s / PAVE_U + phaseU, v: (Math.abs(o) - path.hw) / PAVE_V + phaseV }; };
  const point = (p: PavingVertex): V3 => [p.x, heightAt(p.x, p.z) + y, p.z];
  for (let i = 0; i + 1 < bs.length; i++) {
    const quad = [vertex(bs[i]!, near), vertex(bs[i + 1]!, near), vertex(bs[i + 1]!, far), vertex(bs[i]!, far)];
    const box = pavingMask(quad);
    let pieces: PavingVertex[][] = [quad];
    for (const mask of masks) {
      if (mask.minX > box.maxX || mask.maxX < box.minX || mask.minZ > box.maxZ || mask.maxZ < box.minZ) continue;
      pieces = pieces.flatMap(piece => clipPaving(piece, mask.polygon));
      if (!pieces.length) break;
    }
    for (const poly of pieces) {
      if (poly.length === 4) b.quad(point(poly[0]!), point(poly[1]!), point(poly[2]!), point(poly[3]!), WHITE, UP, poly.map(p => [p.u, p.v] as [number, number]));
      else for (let j = 1; j + 1 < poly.length; j++) {
        const tri = [poly[0]!, poly[j]!, poly[j + 1]!]; b.tri(point(tri[0]!), point(tri[1]!), point(tri[2]!), WHITE, UP, tri.map(p => [p.u, p.v] as [number, number]));
      }
    }
  }
}

/** A kerb stone row along one side of the road between arc lengths sa and sb, with end caps. */
function kerbRun(b: ChunkedBatch, path: RoadPath, side: 1 | -1, sa: number, sb: number, phase: number): void {
  const hw = path.hw;
  const oi = side * hw;
  const oo = side * (hw + KERB_W);
  const bs = breaks(path, sa, sb, side * (hw + KERB_W / 2), 160);
  const base = (x: number, z: number): V3 => [x, heightAt(x, z) - 0.3, z];
  const top = (x: number, z: number): V3 => [x, heightAt(x, z) + KERB_H, z];
  for (let i = 0; i + 1 < bs.length; i++) {
    const s0 = bs[i]!;
    const s1 = bs[i + 1]!;
    const g = path.segAt((s0 + s1) / 2);
    const [ax, az] = path.at(s0, oi);
    const [bx, bz] = path.at(s1, oi);
    const [cx, cz] = path.at(s1, oo);
    const [dx, dz] = path.at(s0, oo);
    const u0 = s0 / KERB_U + phase;
    const u1 = s1 / KERB_U + phase;
    const m = b.at((ax + bx) / 2, (az + bz) / 2);
    // top face: v runs across it, from the road side (0) to the sidewalk side (1)
    m.quad(top(ax, az), top(bx, bz), top(cx, cz), top(dx, dz), WHITE, UP, [[u0, 0], [u1, 0], [u1, 1], [u0, 1]]);
    // road-side face and sidewalk-side face: v runs from the foot (0) to the top (1)
    m.quad(base(ax, az), base(bx, bz), top(bx, bz), top(ax, az), WHITE, [-side * g.nx, 0, -side * g.nz], [[u0, 0], [u1, 0], [u1, 1], [u0, 1]]);
    m.quad(base(dx, dz), base(cx, cz), top(cx, cz), top(dx, dz), WHITE, [side * g.nx, 0, side * g.nz], [[u0, 0], [u1, 0], [u1, 1], [u0, 1]]);
  }
  for (const [s, dir] of [[sa, -1], [sb, 1]] as const) {
    const g = path.segAt(s);
    const [ax, az] = path.at(s, oi);
    const [dx, dz] = path.at(s, oo);
    const u0 = s / KERB_U + phase;
    const du = (KERB_W / KERB_U) * dir;
    b.at(ax, az).quad(base(ax, az), base(dx, dz), top(dx, dz), top(ax, az), WHITE, [dir * g.dx, 0, dir * g.dz], [[u0, 0], [u0 + du, 0], [u0 + du, 1], [u0, 1]]);
  }
}

// ---- materials ---------------------------------------------------------------------------------------------------------
// `bias` is the depth bias towards the camera (the decal layers use 1..4: dec0 = 1, dec1 = 2, dec2 = 3, dec3 = 4;
// zOffset = -bias, zOffsetUnits = -2 * bias), so a layer with a larger bias is drawn over a smaller one.
function texMat(scene: Scene, name: string, tex: Texture, bias: number): StandardMaterial {
  const m = new StandardMaterial(name, scene);
  m.diffuseTexture = tex;
  m.diffuseColor = Color3.White();
  m.specularColor = Color3.Black();
  m.backFaceCulling = false;
  m.twoSidedLighting = true;
  if (bias) {
    m.zOffset = -bias;
    m.zOffsetUnits = -2 * bias;
  }
  return m;
}

/** Alpha-tested paint: the texture is a black/white mask, the colour comes from the vertex colours. */
function maskMat(scene: Scene, name: string, mask: Texture, bias: number): StandardMaterial {
  const m = new StandardMaterial(name, scene);
  m.diffuseColor = Color3.White();
  m.specularColor = Color3.Black();
  m.opacityTexture = mask;
  mask.getAlphaFromRGB = true;
  m.transparencyMode = Material.MATERIAL_ALPHATEST;
  m.alphaCutOff = 0.45;
  m.backFaceCulling = false;
  m.twoSidedLighting = true;
  m.zOffset = -bias;
  m.zOffsetUnits = -2 * bias;
  return m;
}

export interface StreetResult {
  meshes: Mesh[];
  /** vertices added by the street surface (its own meshes plus the markings added to the decal layer) */
  vertices: number;
}

// ---- the builder -------------------------------------------------------------------------------------------------------
export function buildStreetscape(c: Ctx): StreetResult {
  const t0 = performance.now();
  const scene = c.scene;
  const paths = roadsW.map((r) => new RoadPath(r));
  const rank = new Map([...paths].sort((p, q) => p.road.width - q.road.width).map((p, i) => [p, i]));
  const uvRnd = makeRng(2024);
  const dec3Before = c.dec3.vertexCount;

  const pave = new MeshBatch(true);
  const asphalt = new MeshBatch(true);
  const kerbs = new ChunkedBatch(1200, true);
  const tactile = new MeshBatch(true);
  const dots = new MeshBatch(true);
  const gutters = new MeshBatch(true);
  const holes = new MeshBatch(true);
  const petals = new MeshBatch(true);
  const text = new MeshBatch(true);

  const arms = findArms(paths);
  const cuts = new Map<RoadPath, Iv[]>(); // pedestrian crossings: no kerb, tactile strip, edge line or gutter
  const zones = new Map<RoadPath, Iv[]>(); // everything painted near a junction: no manholes
  const addTo = (m: Map<RoadPath, Iv[]>, p: RoadPath, iv: Iv): void => {
    if (!m.has(p)) m.set(p, []);
    m.get(p)!.push(iv);
  };

  // ---- junction paint: zebra crossings, stop lines, 止まれ ---------------------------------------------------------------
  let nZebra = 0;
  let nStop = 0;
  const uvText = c.atlas.has(TEXT_LABEL) ? c.atlas.uv(TEXT_LABEL) : null; // the label is registered in build.ts
  for (const arm of arms) {
    const p = arm.path;
    const hw = p.hw;
    const dirn = arm.toward;
    const sAt = (d: number): number => arm.sj - dirn * d; // arc length at distance d from the junction
    const span = (d0: number, d1: number): Iv => [Math.min(sAt(d0), sAt(d1)), Math.max(sAt(d0), sAt(d1))];
    addTo(zones, p, span(6, arm.stop ? TEXT_AT + TEXT_LEN + 10 : ZEBRA_GAP + ZEBRA_LEN + 10));
    if (arm.len < ZEBRA_GAP + ZEBRA_LEN + 24) continue;

    // zebra crossing across the whole road, bars along the direction of travel
    const [z0, z1] = span(ZEBRA_GAP, ZEBRA_GAP + ZEBRA_LEN);
    const k = Math.floor((hw - EDGE_OUT - 1 - ZEBRA_BAR / 2) / ZEBRA_PITCH);
    for (let i = -k; i <= k; i++) {
      const o = i * ZEBRA_PITCH;
      strip(c.dec3, p, z0, z1, o - ZEBRA_BAR / 2, o + ZEBRA_BAR / 2, DEC3_Y, shade(LINE, 0.9 + c.rnd() * 0.1));
    }
    nZebra++;
    addTo(cuts, p, [z0 - 0.5, z1 + 0.5]);
    // warning dot blocks where the sidewalks meet the crossing
    for (const side of [1, -1] as const) {
      const o0 = side * (hw - 1);
      const o1 = side * (hw + 8);
      strip(dots, p, z0, z1, o0, o1, Y_TAC, WHITE, (s, o) => [(s - z0) / 8, (Math.abs(o) - (hw - 1)) / 8]);
    }
    if (!arm.stop || arm.len < TEXT_AT + TEXT_LEN + 12) continue;

    // stop line across the approach lane (traffic keeps left, so the lane is on the left of the direction of travel)
    const [l0, l1] = span(STOP_AT - STOP_T / 2, STOP_AT + STOP_T / 2);
    strip(c.dec3, p, l0, l1, dirn * 0.9, dirn * (hw - EDGE_OUT - 0.4), DEC3_Y, LINE);
    nStop++;
    if (!uvText) continue;
    // 止まれ: the label cell is laid along the road, first glyph farthest from the driver, glyph tops pointing at the line
    const ot = dirn * (hw / 2 - 3);
    const du = (uvText.u1 - uvText.u0) * (16 / 512);
    const dv = (uvText.v1 - uvText.v0) * (10 / 128);
    const u0 = uvText.u0 + du;
    const u1 = uvText.u1 - du;
    const v0 = uvText.v0 + dv;
    const v1 = uvText.v1 - dv;
    const pt = (u: number, v: number): V3 => {
      const [x, z] = p.at(sAt(TEXT_AT + TEXT_LEN * u), ot - dirn * (v - 0.5) * TEXT_W);
      return [x, heightAt(x, z) + Y_MASK, z];
    };
    text.quad(pt(0, 0), pt(1, 0), pt(1, 1), pt(0, 1), WHITE, UP, [[u0, v0], [u1, v0], [u1, v1], [u0, v1]]);
  }

  // ---- per road and side ----------------------------------------------------------------------------------------------
  const tactileRoads = new Set(roadsW.filter((r) => r.width >= 80).map((r) => r.id));
  let nPetals = 0;
  let kerbLen = 0;
  let nKerbRuns = 0;
  let tacLen = 0;
  let nGut = 0;
  let edgeLen = 0;
  for (const p of paths) {
    const hw = p.hw;
    const id = p.road.id;
    const cutHere = cuts.get(p) ?? [];
    const pavingMasks = c.obstacles.map(r => pavingMask([{ x: r.minX - .3, z: r.minZ - .3 }, { x: r.maxX + .3, z: r.minZ - .3 }, { x: r.maxX + .3, z: r.maxZ + .3 }, { x: r.minX - .3, z: r.maxZ + .3 }]));
    for (const other of paths) if (other !== p) for (const seg of other.segs) {
      const half = other.hw + .2, length = seg.s1 - seg.s0;
      const ax = seg.ax - seg.dx * 2, az = seg.az - seg.dz * 2, bx = seg.ax + seg.dx * (length + 2), bz = seg.az + seg.dz * (length + 2);
      pavingMasks.push(pavingMask([{ x: ax + seg.nx * half, z: az + seg.nz * half }, { x: bx + seg.nx * half, z: bz + seg.nz * half }, { x: bx - seg.nx * half, z: bz - seg.nz * half }, { x: ax - seg.nx * half, z: az - seg.nz * half }]));
    }
    const offRoad = (margin: number) => (x: number, z: number): boolean => roadClearance(x, z, id).d < margin || inPlaza(x, z, 1.02) || steep(x, z);
    const yPave = Y_PAVE + 0.008 * rank.get(p)!;
    const offDecal = (x: number, z: number): boolean => inPlaza(x, z, 0.97) || steep(x, z);

    // textured asphalt over the flat base
    for (const run of freeRuns(p, 0, offDecal, 3)) {
      const ph = uvRnd();
      strip(asphalt, p, run[0], run[1], -hw, hw, Y_ASPH + 0.004 * rank.get(p)!, WHITE, (s, o) => [s / ASPH_U + ph, o / ASPH_V + 0.5]);
    }

    for (const side of [1, -1] as const) {
      // paved sidewalk band
      const phU = uvRnd();
      const phV = uvRnd();
      for (const run of freeRuns(p, side * (hw + 6), offDecal, 3)) {
        pavedStrip(pave, p, run[0], run[1], side, yPave, phU, phV, pavingMasks);
      }
      // kerb stones
      const kPhase = uvRnd();
      for (const run of ivMinus(freeRuns(p, side * (hw + KERB_W / 2), offRoad(1.5), 4), cutHere, 4)) {
        kerbRun(kerbs, p, side, run[0], run[1], kPhase);
        kerbLen += run[1] - run[0];
        nKerbRuns++;
      }
      // tactile guidance strip
      if (tactileRoads.has(id)) {
        const o0 = side * (hw + TAC_IN);
        const o1 = side * (hw + TAC_IN + TAC_W);
        for (const run of ivMinus(freeRuns(p, (o0 + o1) / 2, offRoad(7), 8), cutHere, 8)) {
          strip(tactile, p, run[0], run[1], o0, o1, Y_TAC, WHITE, (s, o) => [s / TAC_U, (Math.abs(o) - (hw + TAC_IN)) / TAC_W]);
          tacLen += run[1] - run[0];
        }
      }
      // white edge line (外側線)
      for (const run of ivMinus(freeRuns(p, side * (hw - 5.4), offRoad(3.5), 10), cutHere, 10)) {
        strip(c.dec3, p, run[0], run[1], side * (hw - EDGE_OUT), side * (hw - EDGE_IN), DEC3_Y, LINE);
        edgeLen += run[1] - run[0];
      }
      // gutter grates along some stretches of the kerb, and heaps of fallen petals against it
      const gfree = ivMinus(freeRuns(p, side * (hw - 1.7), offRoad(4), 20), [...cutHere, ...(zones.get(p) ?? [])], 20);
      for (const [fa, fb] of gfree) {
        let s = fa + 10 + c.rnd() * 90;
        while (s < fb - 20) {
          const len = Math.min(fb - s - 4, 24 + c.rnd() * 56);
          if (len >= 16) {
            strip(gutters, p, s, s + len, side * (hw - GUT_W - 0.1), side * (hw - 0.1), Y_GUT, WHITE, (ss, o) => [ss / GUT_U, (Math.abs(o) - (hw - GUT_W - 0.1)) / GUT_W]);
            nGut++;
          }
          s += len + 70 + c.rnd() * 150;
        }
      }
      const spacing = PETAL_SPACING[id] ?? 330;
      for (const [fa, fb] of gfree) {
        let s = fa + 6 + c.rnd() * spacing * 0.5;
        while (s < fb - 30) {
          const depth = 7 + c.rnd() * 3; // the texture is 4 : 1
          const len = Math.min(fb - s - 2, depth * (3.5 + c.rnd() * 1.2));
          if (len >= 22) {
            const heap = Math.floor(c.rnd() * 2);
            const sprinkle = 2 + Math.floor(c.rnd() * 2);
            const o0 = side * (hw - 0.3); // the kerb side: where the petals pile up
            const layer = (cell: number, y: number, col: RGB): void =>
              strip(petals, p, s, s + len, o0, o0 - side * depth, y, col, (ss, o) => [(cell + (ss - s) / len) / T.PETAL_CELLS, Math.abs(o - o0) / depth]);
            layer(heap, Y_PETAL, mix(hex(0xf2adc2), hex(0xf9cdda), c.rnd()));
            layer(sprinkle, Y_PETAL + 0.015, mix(hex(0xfbe0e8), WHITE, c.rnd()));
            nPetals++;
          }
          s += len + spacing * (0.5 + c.rnd());
        }
      }
    }
  }

  // ---- manhole covers ---------------------------------------------------------------------------------------------------
  let nHoles = 0;
  const HOLE_R = 5;
  const mu = T.MANHOLE_MASK;
  for (const p of paths) {
    const zs = ivMerge(zones.get(p) ?? []);
    let s = 90 + c.rnd() * 110;
    while (s < p.total - 40) {
      const side = c.rnd() < 0.5 ? 1 : -1;
      const o = side * p.hw * (0.42 + 0.14 * c.rnd());
      const rot = c.rnd() * Math.PI;
      const [x, z] = p.at(s, o);
      const free =
        roadClearance(x, z, p.road.id).d > 45 && !inPlaza(x, z, 1.03) && !steep(x, z) && !zs.some(([a, b]) => s > a - 14 && s < b + 14);
      if (free) {
        const q = HOLE_R * (128 / 120);
        const cs = Math.cos(rot) * q;
        const sn = Math.sin(rot) * q;
        const corner = (kx: number, kz: number, lift: number): V3 => [x + kx * cs - kz * sn, heightAt(x, z) + Y_MASK + lift, z + kx * sn + kz * cs];
        for (const [ua, ub, col, lift] of [[mu.disc.u0, mu.disc.u1, hex(0x3d3f45), 0], [mu.relief.u0, mu.relief.u1, hex(0x777a81), 0.03]] as const) {
          holes.quad(corner(-1, -1, lift), corner(1, -1, lift), corner(1, 1, lift), corner(-1, 1, lift), col, UP, [[ua, 0], [ub, 0], [ub, 1], [ua, 1]]);
        }
        nHoles++;
      }
      s += 150 + c.rnd() * 100;
    }
  }

  // ---- meshes -------------------------------------------------------------------------------------------------------------
  const paveMat = texMat(scene, 'streetPaveMat', T.paveTexture(scene), 1.3);
  const asphMat = texMat(scene, 'streetAsphaltMat', T.asphaltTexture(scene), 3.4);
  // Weathered grey asphalt keeps the sun/shade boundary readable without changing the lights.
  asphMat.diffuseColor.setAll(1.6);
  const kerbMat = texMat(scene, 'streetKerbMat', T.kerbTexture(scene), 0);
  const tacMat = texMat(scene, 'streetTactileMat', T.tactileLineTexture(scene), 1.6);
  const dotMat = texMat(scene, 'streetDotMat', T.tactileDotTexture(scene), 1.6);
  const gutMat = texMat(scene, 'streetGutterMat', T.gutterTexture(scene), 4);
  const holeMat = maskMat(scene, 'streetManholeMat', T.manholeMaskTexture(scene), 5);
  const petalMat = maskMat(scene, 'streetPetalMat', T.petalMaskTexture(scene), 5);
  const meshes: Mesh[] = [];
  const add = (b: MeshBatch, name: string, mat: Material): void => {
    if (!b.empty) meshes.push(b.toMesh(name, scene, mat));
  };
  add(pave, 'street_pave', paveMat);
  add(asphalt, 'street_asphalt', asphMat);
  meshes.push(...kerbs.toMeshes('town_kerb', scene, kerbMat)); // named town_*: the scene's sun-shadow setup lets these cast shadows
  add(tactile, 'street_tactile', tacMat);
  add(dots, 'street_dots', dotMat);
  add(gutters, 'street_gutter', gutMat);
  add(holes, 'street_manholes', holeMat);
  add(petals, 'street_petals', petalMat);
  add(text, 'street_stoptext', c.atlas.paintMaterial);
  for (const m of [paveMat, asphMat, kerbMat, tacMat, dotMat, gutMat, holeMat, petalMat]) m.freeze();
  c.atlas.paintMaterial.freeze();

  const vertices =
    pave.vertexCount + asphalt.vertexCount + kerbs.vertexCount + tactile.vertexCount + dots.vertexCount + gutters.vertexCount + holes.vertexCount + petals.vertexCount +
    text.vertexCount + (c.dec3.vertexCount - dec3Before);
  const metres = (units: number): number => Math.round(units * 0.08);
  c.report.push(
    `streetscape: kerb ${nKerbRuns} runs (${metres(kerbLen)} m), tactile paving ${metres(tacLen)} m, edge lines ${metres(edgeLen)} m, ` +
      `${arms.length} junction arms (${nZebra} zebra crossings, ${nStop} stop lines), ${nGut} gutter grates, ${nHoles} manholes, ${nPetals} petal heaps, ` +
      `${meshes.length} meshes, ${vertices} vertices, ${Math.round(performance.now() - t0)} ms`,
  );
  return { meshes, vertices };
}
