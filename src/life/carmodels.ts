import type { MeshBatch } from '../town/batch';
import { hex, type RGB, type V3 } from '../town/util';
import { boxC, disc, faceQuad, fan, octBand, plate, prism, shadeRGB, taperBox } from './geom';
import { carWindow, numberPlate, roundedPanel } from './cardetail';

/**
 * Stylised low-poly Japanese cars. Local frame: +Z forward, +X right, +Y up, origin on the ground at the
 * centre of the car. Sizes are in world units (1 unit ~ 8 cm). Each kind builds a body mesh (with lights, plates,
 * bumpers and wheel arches) from a few lofted cross-sections; the wheels are a separate shared mesh so they can spin.
 */

export const GLASS: RGB = [0.28, 0.39, 0.43];
const TRIM: RGB = [0.16, 0.16, 0.18];
const BUMPER: RGB = [0.27, 0.27, 0.3];
const HEAD: RGB = [1, 0.97, 0.84];
const TAIL: RGB = [0.82, 0.1, 0.09];
const AMBER: RGB = [0.95, 0.6, 0.12];
const ARCH: RGB = [0.13, 0.12, 0.13];
const FLOOR: RGB = [0.1, 0.1, 0.11];
const CHROME: RGB = [0.8, 0.82, 0.86];

export interface CarPalette {
  body: RGB;
  /** Roof colour for two-tone cars. */
  roof?: RGB;
  /** Accent: stripes, lamp, bed. */
  accent?: RGB;
  /** Number plate background: white (private), yellow (kei), green (commercial). */
  plate?: 'white' | 'yellow' | 'green';
}

/** One lofted cross-section: half width and height of the sill (a), the shoulder / beltline (b) and the roof edge (c). */
interface Station {
  z: number;
  a: [number, number];
  b: [number, number];
  c: [number, number];
}

const S = (z: number, hwA: number, yA: number, hwB: number, yB: number, hwC?: number, yC?: number): Station => ({
  z,
  a: [hwA, yA],
  b: [hwB, yB],
  c: hwC === undefined || yC === undefined ? [hwB, yB] : [hwC, yC],
});

/** Colours of one span between two stations: lower side, window band, top. */
type Span = [RGB, RGB, RGB];

function loft(b: MeshBatch, source: readonly Station[], spans: readonly Span[], rear: [RGB, RGB], front: [RGB, RGB]): void {
  // Tucked end corners, rolled sills and rounded shoulders give all six body styles real bevels.
  const st = source.map((s, i): Station => i === 0 || i === source.length - 1
    ? { ...s, a: [s.a[0] - .55, s.a[1]], b: [s.b[0] - .55, s.b[1]], c: [s.c[0] - .45, s.c[1]] } : s);
  const P = (x: number, y: number, z: number): V3 => [x, y, z];
  for (let i = 0; i + 1 < st.length; i++) {
    const s0 = st[i]!;
    const s1 = st[i + 1]!;
    const sp = spans[i]!;
    const cz = (s0.z + s1.z) / 2;
    const c: V3 = [0, (s0.a[1] + s0.c[1]) / 2, cz];
    for (const sd of [-1, 1]) {
      const a0 = P(sd * (s0.a[0] - .35), s0.a[1], s0.z);
      const a1 = P(sd * (s1.a[0] - .35), s1.a[1], s1.z);
      const b0 = P(sd * s0.b[0], s0.b[1], s0.z);
      const b1 = P(sd * s1.b[0], s1.b[1], s1.z);
      const sill0 = P(sd * s0.b[0], s0.a[1] + 1.4, s0.z), sill1 = P(sd * s1.b[0], s1.a[1] + 1.4, s1.z);
      const shoulder0 = P(sd * (s0.b[0] + .04), s0.b[1] - 1.1, s0.z);
      const shoulder1 = P(sd * (s1.b[0] + .04), s1.b[1] - 1.1, s1.z);
      const c0 = P(sd * s0.c[0], Math.max(s0.b[1], s0.c[1] - .75), s0.z);
      const c1 = P(sd * s1.c[0], Math.max(s1.b[1], s1.c[1] - .75), s1.z);
      faceQuad(b, a0, a1, sill1, sill0, shadeRGB(sp[0], .76), c);
      faceQuad(b, sill0, sill1, shoulder1, shoulder0, sp[0], c);
      faceQuad(b, shoulder0, shoulder1, b1, b0, shadeRGB(sp[0], 1.045), c);
      if (sp[1] === GLASS) carWindow(b, [b0, b1, c1, c0], [sd, .12, 0], sp[0]);
      else {
        // At bonnet/pillar transitions one end can collapse to a point; tri skips that zero-area half.
        b.tri(b0, b1, c1, sp[1], [sd, .1, 0]);
        b.tri(b0, c1, c0, sp[1], [sd, .1, 0]);
      }
      const edge0 = P(sd * (s0.c[0] - .8), s0.c[1], s0.z), edge1 = P(sd * (s1.c[0] - .8), s1.c[1], s1.z);
      faceQuad(b, c0, c1, edge1, edge0, sp[2] === GLASS ? sp[0] : sp[2], c);
    }
    if (sp[2] === GLASS) {
      const low = s0.c[1] < s1.c[1] ? s0 : s1, high = low === s0 ? s1 : s0;
      const dz = low.z - high.z, dy = high.c[1] - low.c[1], len = Math.hypot(dz, dy);
      carWindow(b, [P(-low.c[0] + .8, low.c[1], low.z), P(low.c[0] - .8, low.c[1], low.z),
        P(high.c[0] - .8, high.c[1], high.z), P(-high.c[0] + .8, high.c[1], high.z)], [0, Math.abs(dz) / len, Math.sign(dz) * dy / len], sp[0], true, dz < 0);
    } else {
      // A shallow crown across the roof/bonnet replaces the old single broad horizontal face.
      const profile = (s: Station, f: number): V3 => P((s.c[0] - .8) * f, s.c[1] + (Math.abs(f) < .99 ? .28 : 0), s.z);
      const bands = [-1, -.55, .55, 1];
      for (let j = 0; j < 3; j++) faceQuad(b, profile(s0, bands[j]!), profile(s1, bands[j]!), profile(s1, bands[j + 1]!), profile(s0, bands[j + 1]!), sp[2], c);
    }
    // floor
    faceQuad(b, P(s0.a[0], s0.a[1], s0.z), P(-s0.a[0], s0.a[1], s0.z), P(-s1.a[0], s1.a[1], s1.z), P(s1.a[0], s1.a[1], s1.z), FLOOR, [0, 5, cz]);
  }
  // end faces
  const endCap = (s: Station, cols: [RGB, RGB], inside: V3): void => {
    faceQuad(b, P(s.a[0] - .35, s.a[1], s.z), P(-s.a[0] + .35, s.a[1], s.z), P(-s.b[0], s.b[1] - 1.1, s.z), P(s.b[0], s.b[1] - 1.1, s.z), cols[0], inside);
    faceQuad(b, P(s.b[0], s.b[1] - 1.1, s.z), P(-s.b[0], s.b[1] - 1.1, s.z), P(-s.b[0], s.b[1], s.z), P(s.b[0], s.b[1], s.z), shadeRGB(cols[0], 1.045), inside);
    const normal: V3 = [0, 0, Math.sign(s.z - inside[2])];
    fan(b, [P(s.b[0], s.b[1], s.z), P(-s.b[0], s.b[1], s.z), P(-s.c[0], Math.max(s.b[1], s.c[1] - .75), s.z), P(-s.c[0] + .8, s.c[1], s.z), P(s.c[0] - .8, s.c[1], s.z), P(s.c[0], Math.max(s.b[1], s.c[1] - .75), s.z)], cols[1] === GLASS ? cols[0] : cols[1], normal);
    if (cols[1] === GLASS && s.c[1] - s.b[1] > 1) carWindow(b, [P(-s.b[0] + .4, s.b[1], s.z), P(s.b[0] - .4, s.b[1], s.z),
      P(s.c[0] - .8, s.c[1] - .3, s.z), P(-s.c[0] + .8, s.c[1] - .3, s.z)], normal, cols[0], true, true);
  };
  const first = st[0]!;
  const last = st[st.length - 1]!;
  endCap(first, rear, [0, (first.a[1] + first.c[1]) / 2, first.z + 6]);
  endCap(last, front, [0, (last.a[1] + last.c[1]) / 2, last.z - 6]);
}

interface Axle {
  front: number;
  rear: number;
}

interface Lights {
  /** Headlight centre (x, y), half sizes (w, h). */
  head: [number, number, number, number];
  tail: [number, number, number, number];
  /** Round headlights (retro). */
  round?: boolean;
}

function lights(b: MeshBatch, L: number, l: Lights, pal: CarPalette, plateY: [number, number], plateHw = 2.05): void {
  const zf = L / 2;
  for (const sd of [-1, 1]) {
    if (l.round) {
      disc(b, [sd * l.head[0], l.head[1], zf + .04], [1, 0, 0], [0, 1, 0], l.head[2] + .38, 16, TRIM, [0, 0, 1]);
      disc(b, [sd * l.head[0], l.head[1], zf + .07], [1, 0, 0], [0, 1, 0], l.head[2] + .23, 16, CHROME, [0, 0, 1]);
      disc(b, [sd * l.head[0], l.head[1], zf + .10], [1, 0, 0], [0, 1, 0], l.head[2], 16, HEAD, [0, 0, 1]);
      disc(b, [sd * l.head[0] - .22, l.head[1] + .24, zf + .125], [1, 0, 0], [0, 1, 0], l.head[2] * .44, 10, [1, 1, .97], [0, 0, 1]);
    } else {
      roundedPanel(b, [sd * l.head[0], l.head[1], zf + .04], [l.head[2] + .22, 0, 0], [0, l.head[3] + .2, 0], TRIM, [0, 0, 1]);
      roundedPanel(b, [sd * l.head[0], l.head[1], zf + .07], [l.head[2] + .08, 0, 0], [0, l.head[3] + .07, 0], CHROME, [0, 0, 1]);
      roundedPanel(b, [sd * l.head[0], l.head[1], zf + .10], [l.head[2], 0, 0], [0, l.head[3], 0], HEAD, [0, 0, 1]);
      plate(b, [sd * l.head[0], l.head[1] + l.head[3] * .4, zf + .125], [l.head[2] * .75, 0, 0], [0, .12, 0], [1, 1, .98], [0, 0, 1]);
      plate(b, [sd * (l.head[0] - .5), l.head[1], zf + .13], [.08, 0, 0], [0, l.head[3] * .85, 0], [.74, .79, .76], [0, 0, 1]);
    }
    roundedPanel(b, [sd * l.tail[0], l.tail[1], -zf - .04], [l.tail[2] + .15, 0, 0], [0, l.tail[3] + .17, 0], TRIM, [0, 0, -1]);
    roundedPanel(b, [sd * l.tail[0], l.tail[1], -zf - .08], [l.tail[2], 0, 0], [0, l.tail[3], 0], TAIL, [0, 0, -1]);
    plate(b, [sd * l.tail[0], l.tail[1] + l.tail[3] * .52, -zf - .10], [l.tail[2] * .8, 0, 0], [0, l.tail[3] * .17, 0], [.98, .37, .25], [0, 0, -1]);
    plate(b, [sd * l.tail[0], l.tail[1] - l.tail[3] * .55, -zf - .10], [l.tail[2] * .8, 0, 0], [0, l.tail[3] * .22, 0], [.87, .88, .79], [0, 0, -1]);
    // small amber indicators under / beside the headlights
    plate(b, [sd * (l.head[0] + l.head[2] + 0.1), l.head[1] - 1.5, zf + 0.05], [0.5, 0, 0], [0, 0.45, 0], AMBER, [0, 0, 1]);
  }
  const plateOffset = l.round ? 1.23 : .77;
  numberPlate(b, zf + plateOffset, plateY[0], plateHw, pal.plate === 'green', pal.plate === 'yellow');
  numberPlate(b, -zf - plateOffset, plateY[1], plateHw, pal.plate === 'green', pal.plate === 'yellow');
}

function bumpers(b: MeshBatch, L: number, hw: number, y0: number, y1: number, color: RGB = BUMPER): void {
  const zf = L / 2;
  for (const sd of [-1, 1]) {
    const cz = sd * (zf - .2);
    octBand(b, { y: y0, a: hw - .8, c: .62, k: .55, cz }, { y: y0 + .4, a: hw - .4, c: .9, k: .68, cz }, shadeRGB(color, .7));
    octBand(b, { y: y0 + .4, a: hw - .4, c: .9, k: .68, cz }, { y: y1 - .25, a: hw - .4, c: .9, k: .68, cz }, color);
    octBand(b, { y: y1 - .25, a: hw - .4, c: .9, k: .68, cz }, { y: y1, a: hw - .7, c: .65, k: .55, cz }, shadeRGB(color, 1.08), { top: shadeRGB(color, 1.1) });
    plate(b, [0, y0 + .45, sd * (zf + .72)], [hw - 1.3, 0, 0], [0, .14, 0], BUMPER, [0, 0, sd]);
  }
}

/** Dark wheel-arch "tombstones" on both sides so the wheels read as sitting in the body. */
function arches(b: MeshBatch, zs: number[], hwSide: number, yWheel: number, r: number, ySill: number): void {
  for (const sd of [-1, 1]) {
    for (const z of zs) {
      const pts: V3[] = [[sd * (hwSide + 0.07), ySill, z - r]];
      pts.push([sd * (hwSide + 0.07), yWheel, z - r]);
      const n = 12;
      for (let k = 1; k < n; k++) {
        const a = Math.PI - (k / n) * Math.PI;
        pts.push([sd * (hwSide + 0.07), yWheel + Math.sin(a) * r, z + Math.cos(a) * r]);
      }
      pts.push([sd * (hwSide + 0.07), yWheel, z + r]);
      pts.push([sd * (hwSide + 0.07), ySill, z + r]);
      fan(b, pts, ARCH, [sd, 0, 0]);
      for (let k = 0; k < n; k++) {
        const a0 = k / n * Math.PI, a1 = (k + 1) / n * Math.PI;
        const P = (a: number, rr: number): V3 => [sd * (hwSide + .10), yWheel + Math.sin(a) * rr, z + Math.cos(a) * rr];
        b.quad(P(a0, r), P(a1, r), P(a1, r + .2), P(a0, r + .2), [.28, .29, .29], [sd, 0, 0]);
      }
    }
  }
}

/** Door seams, handles and side mirrors. */
function doorDetails(b: MeshBatch, hw: number, seams: number[], yLo: number, yHi: number, handleZ: number[], handleY: number, mirrorZ: number, mirrorY: number, body: RGB): void {
  for (const sd of [-1, 1]) {
    for (const z of seams) plate(b, [sd * (hw + .07), (yLo + yHi) / 2, z], [0, 0, .065], [0, (yHi - yLo) / 2, 0], shadeRGB(body, .6), [sd, 0, 0]);
    for (const z of handleZ) {
      roundedPanel(b, [sd * (hw + .09), handleY, z], [0, 0, 1.0], [0, .32, 0], shadeRGB(body, .65), [sd, 0, 0]);
      prism(b, [sd * (hw + .2), handleY + .06, z - .68], [sd * (hw + .2), handleY + .06, z + .68], .12, .12, 6, CHROME);
    }
    prism(b, [sd * hw, mirrorY - .45, mirrorZ + .3], [sd * (hw + .7), mirrorY - .25, mirrorZ], .16, .16, 5, TRIM);
    const cx = sd * (hw + .88);
    octBand(b, { y: mirrorY - .65, a: .60, c: .42, k: .24, cx, cz: mirrorZ },
      { y: mirrorY + .58, a: .75, c: .53, k: .25, cx, cz: mirrorZ }, body, { top: shadeRGB(body, 1.07) });
    roundedPanel(b, [cx, mirrorY - .02, mirrorZ - .55], [.55, 0, 0], [0, .42, 0], [.43, .56, .59], [0, 0, -1]);
  }
}

/** Every car uses the same wheel mesh (one draw call for all the wheels of the town) */
export const WHEEL_R = 3.7;
export const WHEEL_W = 2.1;

export interface CarKind {
  id: string;
  /** Overall size (length along z, width along x) for spacing and lanes. */
  length: number;
  width: number;
  wheelR: number;
  wheelW: number;
  /** Wheel centres relative to the car centre: x (half track), and the axle z positions. */
  wheelX: number;
  axle: Axle;
  /** Ready-made colourways. */
  palettes: CarPalette[];
  build(b: MeshBatch, pal: CarPalette): void;
}

const darkRoof = (c: RGB): RGB => shadeRGB(c, 0.92);

// -------------------------------------------------------------------------------------------------------------------

const compact: CarKind = {
  id: 'compact',
  length: 50,
  width: 20.5,
  wheelR: WHEEL_R,
  wheelW: WHEEL_W,
  wheelX: 9.4,
  axle: { front: 15.2, rear: -14.2 },
  palettes: [
    { body: hex(0xf2f2ee), plate: 'white' },
    { body: hex(0xb9bcc4), plate: 'white' },
    { body: hex(0xc7343b), plate: 'white' },
  ],
  build(b, p) {
    const st = [
      S(-25, 9.7, 2.8, 10.0, 11.6),
      S(-18.5, 10.25, 2.4, 10.25, 11.9, 8.3, 18.9),
      S(-4.5, 10.25, 2.4, 10.25, 11.9, 8.5, 19.0),
      S(-3.2, 10.25, 2.4, 10.25, 11.9, 8.5, 19.0),
      S(6.0, 10.25, 2.4, 10.25, 11.9, 8.5, 18.9),
      S(13.5, 10.25, 2.4, 10.25, 12.2),
      S(25, 9.8, 3.0, 9.9, 10.8),
    ];
    const B = p.body;
    const roof = p.roof ?? darkRoof(B);
    const spans: Span[] = [
      [B, B, GLASS],
      [B, GLASS, roof],
      [B, B, roof],
      [B, GLASS, roof],
      [B, B, GLASS],
      [B, B, B],
    ];
    loft(b, st, spans, [B, GLASS], [B, B]);
    arches(b, [this.axle.front, this.axle.rear], 10.25, this.wheelR, this.wheelR + 0.9, 2.4);
    bumpers(b, 50, 10, 2.5, 5.3, shadeRGB(B, .88));
    lights(b, 50, { head: [7.0, 9.0, 1.8, 0.8], tail: [8.2, 9.4, 1.1, 1.5] }, p, [5.6, 5.9]);
    doorDetails(b, 10.25, [-3.9, 6.0], 3.5, 11.5, [-1.2, 8.4], 10.4, 8.0, 12.2, B);
    // grille
    plate(b, [0, 7.6, 25.05], [4.4, 0, 0], [0, 0.8, 0], TRIM, [0, 0, 1]);
    for (const y of [7.25, 7.75]) plate(b, [0, y, 25.08], [4.05, 0, 0], [0, .07, 0], CHROME, [0, 0, 1]);
  },
};

const kei: CarKind = {
  id: 'kei',
  length: 42.5,
  width: 18.5,
  wheelR: WHEEL_R,
  wheelW: WHEEL_W,
  wheelX: 8.5,
  axle: { front: 13.6, rear: -12.8 },
  palettes: [
    { body: hex(0xf6f3ea), roof: hex(0xf9f4e9), accent: hex(0xd996a8), plate: 'yellow' },
    { body: hex(0x9fd0e8), plate: 'yellow' },
    { body: hex(0xa9c98a), plate: 'yellow' },
  ],
  build(b, p) {
    const st = [
      S(-21.25, 8.9, 2.8, 9.25, 12.4, 8.4, 20.2),
      S(-4.0, 9.25, 2.4, 9.25, 12.4, 8.5, 20.6),
      S(-2.8, 9.25, 2.4, 9.25, 12.4, 8.5, 20.6),
      S(7.5, 9.25, 2.4, 9.25, 12.4, 8.5, 20.6),
      S(14.0, 9.25, 2.4, 9.25, 12.7),
      S(21.25, 8.9, 3.0, 9.0, 11.8),
    ];
    const B = p.body;
    const roof = p.roof ?? B;
    const spans: Span[] = [
      [B, GLASS, roof],
      [B, B, roof],
      [B, GLASS, roof],
      [B, B, GLASS],
      [B, B, B],
    ];
    loft(b, st, spans, [B, GLASS], [B, B]);
    arches(b, [this.axle.front, this.axle.rear], 9.25, this.wheelR, this.wheelR + 0.85, 2.4);
    bumpers(b, 42.5, 8.9, 2.5, 5.2, p.accent ?? shadeRGB(B, .88));
    lights(b, 42.5, { head: [6.0, 8.6, 1.7, 0.95], tail: [7.4, 8.4, 1.0, 2.0] }, p, [5.6, 5.4], 1.9);
    doorDetails(b, 9.25, [-3.4, 7.0], 3.5, 11.8, [-1.0, 8.6], 10.6, 8.6, 12.6, B);
    plate(b, [0, 7.4, 21.3], [4.0, 0, 0], [0, 0.7, 0], TRIM, [0, 0, 1]);
    for (const y of [7.1, 7.6]) plate(b, [0, y, 21.33], [3.7, 0, 0], [0, .07, 0], CHROME, [0, 0, 1]);
    if (p.accent) for (const sd of [-1, 1]) {
      plate(b, [sd * 9.32, 5.8, .4], [0, 0, 8.9], [0, 1.5, 0], p.accent, [sd, 0, 0]);
      plate(b, [sd * 9.35, 7.38, .4], [0, 0, 9.0], [0, .08, 0], CHROME, [sd, 0, 0]);
    }
  },
};

const retro: CarKind = {
  id: 'retro',
  length: 47,
  width: 19.5,
  wheelR: WHEEL_R,
  wheelW: WHEEL_W,
  wheelX: 9.0,
  axle: { front: 14.2, rear: -13.2 },
  palettes: [
    { body: hex(0xf2a3b9), roof: hex(0xf6efdc), plate: 'white' }, // the pink two-tone classic
    { body: hex(0x9fd5c0), roof: hex(0xf6efdc), plate: 'white' },
  ],
  build(b, p) {
    const st = [
      S(-23.5, 8.0, 3.2, 8.5, 9.2),
      S(-21.0, 9.2, 2.6, 9.7, 10.0),
      S(-14.5, 9.75, 2.4, 9.75, 10.4, 7.6, 15.6),
      S(-8.0, 9.75, 2.4, 9.75, 10.6, 7.1, 17.0),
      S(-2.0, 9.75, 2.4, 9.75, 10.6, 7.1, 17.3),
      S(5.0, 9.75, 2.4, 9.75, 10.8, 7.3, 16.8),
      S(10.5, 9.8, 2.4, 9.8, 10.9),
      S(17.0, 9.9, 2.6, 9.9, 10.1),
      S(21.5, 9.3, 3.0, 9.3, 8.8),
      S(23.5, 8.2, 3.4, 8.2, 7.9),
    ];
    const B = p.body;
    const roof = p.roof ?? B;
    const spans: Span[] = [
      [B, B, B], // tail
      [B, B, GLASS], // rear window (the slope up to the roof)
      [B, GLASS, roof],
      [B, GLASS, roof],
      [B, GLASS, roof],
      [B, B, GLASS], // windshield
      [B, B, B], // bonnet
      [B, B, B],
      [B, B, B],
    ];
    loft(b, st, spans, [B, B], [B, B]);
    arches(b, [this.axle.front, this.axle.rear], 9.78, this.wheelR, this.wheelR + 0.85, 2.4);
    // chrome bumpers and trim: thin rounded bars
    for (const z of [-1, 1]) {
      prism(b, [-8.6, 4.4, z * 23.9], [8.6, 4.4, z * 23.9], 0.8, 0.8, 6, CHROME);
    }
    // round headlights set in the fenders, chrome rims
    lights(b, 47, { head: [6.4, 7.6, 1.45, 1.45], tail: [7.6, 8.0, 1.0, 1.0], round: true }, p, [4.2, 5.2], 2.0);
    // grille and chrome strip
    roundedPanel(b, [0, 5.9, 23.56], [3.2, 0, 0], [0, 1.1, 0], TRIM, [0, 0, 1], .12);
    for (const y of [5.3, 5.7, 6.1, 6.5]) plate(b, [0, y, 23.59], [2.9, 0, 0], [0, .075, 0], CHROME, [0, 0, 1]);
    plate(b, [0, 7.4, 23.61], [7.8, 0, 0], [0, 0.12, 0], CHROME, [0, 0, 1]);
    doorDetails(b, 9.78, [-3.0], 3.6, 10.4, [-1.6], 9.4, 6.8, 12.0, B);
    // body-colour fender bulges over the front and rear wheels
    for (const sd of [-1, 1]) {
      taperBox(b, 8.9, 10.7, { x0: sd > 0 ? 8.4 : -10.3, x1: sd > 0 ? 10.3 : -8.4, z0: 9.4, z1: 20.4 }, { x0: sd > 0 ? 8.6 : -10.1, x1: sd > 0 ? 10.1 : -8.6, z0: 10.4, z1: 19.4 }, B);
    }
  },
};

const van: CarKind = {
  id: 'van',
  length: 57,
  width: 20.8,
  wheelR: WHEEL_R,
  wheelW: WHEEL_W,
  wheelX: 9.5,
  axle: { front: 18.0, rear: -17.0 },
  palettes: [
    { body: hex(0xf3f3f0), accent: hex(0x2f8f5a), plate: 'green' },
    { body: hex(0xf3f3f0), accent: hex(0x2a5db0), plate: 'green' },
  ],
  build(b, p) {
    const st = [
      S(-28.5, 9.9, 2.8, 10.3, 14.0, 9.7, 23.2),
      S(5.0, 10.4, 2.4, 10.4, 14.0, 9.8, 23.2),
      S(17.5, 10.4, 2.4, 10.4, 14.0, 9.8, 23.2),
      S(23.0, 10.4, 2.4, 10.4, 14.4),
      S(28.5, 9.9, 3.0, 10.0, 12.4),
    ];
    const B = p.body;
    const spans: Span[] = [
      [B, B, B],
      [B, GLASS, B],
      [B, B, GLASS],
      [B, B, B],
    ];
    loft(b, st, spans, [B, B], [B, B]);
    arches(b, [this.axle.front, this.axle.rear], 10.4, this.wheelR, this.wheelR + 0.9, 2.4);
    bumpers(b, 57, 10.2, 2.5, 5.6, shadeRGB(B, .86));
    lights(b, 57, { head: [7.2, 9.4, 1.9, 0.9], tail: [8.6, 10.4, 1.1, 2.2] }, p, [5.9, 6.2]);
    // rear door window, sliding door seam and a colour band along the sides
    for (const sd of [-1, 1]) {
      const x0 = sd < 0 ? -7.5 : .2, x1 = sd < 0 ? -.2 : 7.5;
      carWindow(b, [[x0, 15.0, -28.56], [x1, 15.0, -28.56], [x1 - .25, 21.4, -28.56], [x0 + .25, 21.4, -28.56]], [0, 0, -1], B, true, true);
      roundedPanel(b, [sd * 1.55, 12.1, -28.63], [.95, 0, 0], [0, .3, 0], TRIM, [0, 0, -1]);
      for (const y of [8.7, 20.4]) boxC(b, sd * 8.1, y, -28.63, .25, .62, .13, CHROME);
    }
    plate(b, [0, 14.8, -28.55], [0.1, 0, 0], [0, 5.0, 0], TRIM, [0, 0, -1]);
    const acc = p.accent ?? hex(0x2f8f5a);
    for (const sd of [-1, 1]) {
      plate(b, [sd * 10.46, 9.6, -11], [0, 0, 17.4], [0, 1.1, 0], acc, [sd, 0, 0]);
      plate(b, [sd * 10.46, 9.6, 20.2], [0, 0, 4.4], [0, 1.1, 0], acc, [sd, 0, 0]);
    }
    doorDetails(b, 10.4, [-6.5, 5.0, 17.3], 3.6, 13.8, [-4.0, 8.0], 9.6, 21.6, 14.8, B);
    plate(b, [0, 7.6, 28.55], [5.0, 0, 0], [0, 0.9, 0], TRIM, [0, 0, 1]);
  },
};

const taxi: CarKind = {
  id: 'taxi',
  length: 58.5,
  width: 21,
  wheelR: WHEEL_R,
  wheelW: WHEEL_W,
  wheelX: 9.65,
  axle: { front: 18.2, rear: -17.4 },
  palettes: [
    { body: hex(0xf2c230), accent: hex(0xf6f3e6), plate: 'green' },
    { body: hex(0x232630), accent: hex(0xf6f3e6), plate: 'green' },
  ],
  build(b, p) {
    const st = [
      S(-29.25, 9.9, 2.8, 10.3, 13.0),
      S(-21.0, 10.5, 2.4, 10.5, 13.0),
      S(-14.0, 10.5, 2.4, 10.5, 13.0, 9.0, 19.4),
      S(-3.0, 10.5, 2.4, 10.5, 13.0, 9.0, 19.6),
      S(-1.6, 10.5, 2.4, 10.5, 13.0, 9.0, 19.6),
      S(8.5, 10.5, 2.4, 10.5, 13.0, 9.1, 19.4),
      S(14.5, 10.5, 2.4, 10.5, 12.8),
      S(29.25, 9.9, 3.0, 10.0, 11.6),
    ];
    const B = p.body;
    const roof = shadeRGB(B, 0.97);
    const spans: Span[] = [
      [B, B, B],
      [B, B, GLASS],
      [B, GLASS, roof],
      [B, B, roof],
      [B, GLASS, roof],
      [B, B, GLASS],
      [B, B, B],
    ];
    loft(b, st, spans, [B, B], [B, B]);
    arches(b, [this.axle.front, this.axle.rear], 10.5, this.wheelR, this.wheelR + 0.9, 2.4);
    bumpers(b, 58.5, 10.2, 2.5, 5.6, shadeRGB(B, .85));
    lights(b, 58.5, { head: [7.3, 9.2, 2.0, 0.85], tail: [8.4, 10.6, 1.2, 1.1] }, p, [5.9, 6.4]);
    // roof lamp (andon) and a stripe along the doors
    const acc = p.accent ?? hex(0xf6f3e6);
    taperBox(b, 19.5, 22.6, { x0: -3.2, x1: 3.2, z0: -3.4, z1: 2.4 }, { x0: -2.9, x1: 2.9, z0: -3.1, z1: 2.1 }, [0.97, 0.96, 0.9], { top: [1, 1, 0.95] });
    for (const z of [-3.43, 2.43]) plate(b, [0, 21, z], [2.8, 0, 0], [0, 1.0, 0], [0.9, 0.55, 0.15], [0, 0, z > 0 ? 1 : -1]);
    for (const sd of [-1, 1]) plate(b, [sd * 10.56, 9.0, -1.2], [0, 0, 12.5], [0, 0.9, 0], acc, [sd, 0, 0]);
    doorDetails(b, 10.5, [-8.0, -1.6, 8.6], 3.6, 12.8, [-5.0, 2.0], 10.0, 9.4, 13.4, B);
    plate(b, [0, 7.8, 29.3], [4.6, 0, 0], [0, 0.8, 0], TRIM, [0, 0, 1]);
    for (const y of [7.35, 7.8, 8.25]) plate(b, [0, y, 29.33], [4.3, 0, 0], [0, .065, 0], CHROME, [0, 0, 1]);
  },
};

const truck: CarKind = {
  id: 'truck',
  length: 42.5,
  width: 18.5,
  wheelR: WHEEL_R,
  wheelW: WHEEL_W,
  wheelX: 8.5,
  axle: { front: 14.5, rear: -13.5 },
  palettes: [
    { body: hex(0xf3f1e8), accent: hex(0xc6b79a), plate: 'yellow' },
    { body: hex(0x9fc6a6), accent: hex(0xc6b79a), plate: 'yellow' },
  ],
  build(b, p) {
    const st = [
      S(2.0, 9.0, 2.6, 9.25, 12.8, 8.4, 20.8),
      S(17.0, 9.0, 2.6, 9.25, 12.8, 8.4, 20.8),
      S(20.3, 9.0, 2.6, 9.25, 12.4),
      S(21.25, 8.8, 3.0, 8.9, 11.4),
    ];
    const B = p.body;
    const spans: Span[] = [
      [B, GLASS, B],
      [B, B, GLASS],
      [B, B, B],
    ];
    loft(b, st, spans, [B, GLASS], [B, B]);
    // flatbed: dark deck, body-colour side boards and tailgate, a few crates as cargo
    const deck = shadeRGB(p.accent ?? [0.7, 0.65, 0.55], 0.9);
    taperBox(b, 6.0, 8.0, { x0: -9.0, x1: 9.0, z0: -21.25, z1: 1.8 }, { x0: -9.0, x1: 9.0, z0: -21.25, z1: 1.8 }, [0.2, 0.2, 0.22], { top: deck });
    for (const sd of [-1, 1]) boxC(b, sd * 8.7, 9.9, -9.7, 0.35, 1.9, 11.5, B);
    boxC(b, 0, 9.9, -20.9, 8.7, 1.9, 0.35, B);
    boxC(b, 0, 9.9, 1.5, 8.7, 1.9, 0.35, shadeRGB(B, 0.9));
    boxC(b, -3.2, 11.2, -13.5, 4.2, 3.0, 3.5, [0.78, 0.62, 0.42], { top: [0.86, 0.72, 0.52] });
    boxC(b, 3.6, 10.6, -8.0, 3.8, 2.3, 3.2, [0.74, 0.58, 0.4], { top: [0.84, 0.7, 0.5] });
    for (const [x, y, z, hw, hh, hd] of [[-3.2, 11.2, -13.5, 4.2, 3.0, 3.5], [3.6, 10.6, -8, 3.8, 2.3, 3.2]]) {
      for (const offset of [-1, 1]) {
        plate(b, [x!, y! + offset * hh! * .4, z! - hd! - .03], [hw!, 0, 0], [0, .07, 0], [.49, .36, .23], [0, 0, -1]);
        plate(b, [x! + hw! + .03, y! + offset * hh! * .4, z!], [0, 0, hd!], [0, .07, 0], [.49, .36, .23], [1, 0, 0]);
      }
      for (const offset of [-1, 1]) plate(b, [x! + offset * hw! * .76, y!, z! - hd! - .05], [.18, 0, 0], [0, hh!, 0], [.65, .49, .31], [0, 0, -1]);
    }
    for (const x of [-5.9, 5.9]) boxC(b, x, 8.7, -21.3, .65, .22, .16, CHROME);
    for (const sd of [-1, 1]) for (const z of [-18, -2]) roundedPanel(b, [sd * 9.08, 10.2, z], [0, 0, .36], [0, .6, 0], CHROME, [sd, 0, 0]);
    arches(b, [this.axle.front], 9.25, this.wheelR, this.wheelR + 0.85, 2.6);
    bumpers(b, 42.5, 8.8, 2.5, 5.2, shadeRGB(B, .88));
    lights(b, 42.5, { head: [5.8, 8.0, 1.7, 0.9], tail: [7.6, 6.0, 1.0, 0.9] }, p, [5.2, 4.6], 1.9);
    doorDetails(b, 9.25, [9.0], 3.5, 11.8, [11.0], 10.6, 15.6, 12.6, B);
    plate(b, [0, 7.0, 21.3], [3.6, 0, 0], [0, 0.6, 0], TRIM, [0, 0, 1]);
  },
};

export const CAR_KINDS: readonly CarKind[] = [compact, kei, retro, van, taxi, truck];

/** Wheel with tyre, a hub that shows the rotation (alternating spokes) and a centre cap; axle along X, centred on the origin. */
export function buildWheel(b: MeshBatch, r: number = WHEEL_R, w: number = WHEEL_W): void {
  const tyre: RGB = [.075, .085, .09];
  // A round shoulder/tread profile retains the exact radius, axle and width of the traffic model.
  const rings: [number, number][] = [[-.5, .84], [-.36, .97], [0, 1], [.36, .97], [.5, .84]];
  for (let i = 0; i + 1 < rings.length; i++) {
    const [x0, r0] = rings[i]!, [x1, r1] = rings[i + 1]!;
    prism(b, [x0 * w, 0, 0], [x1 * w, 0, 0], r0 * r, r1 * r, 16, tyre, { cap0: false, cap1: false });
  }
  for (const sd of [-1, 1]) {
    const x = sd * (w / 2 + .025), n: V3 = [sd, 0, 0];
    disc(b, [x, 0, 0], [0, 1, 0], [0, 0, 1], r * .84, 16, [.12, .13, .14], n);
    disc(b, [x + sd * .015, 0, 0], [0, 1, 0], [0, 0, 1], r * .68, 16, [.25, .28, .30], n);
    for (let k = 0; k < 16; k++) {
      const a0 = k / 16 * Math.PI * 2, a1 = (k + 1) / 16 * Math.PI * 2;
      const P = (a: number, rr: number): V3 => [x + sd * .025, Math.cos(a) * rr, Math.sin(a) * rr];
      b.quad(P(a0, r * .60), P(a1, r * .60), P(a1, r * .70), P(a0, r * .70), CHROME, n);
    }
    for (let k = 0; k < 5; k++) {
      const a = k / 5 * Math.PI * 2;
      const P = (a1: number, rr: number): V3 => [x + sd * .04, Math.cos(a1) * rr, Math.sin(a1) * rr];
      b.quad(P(a - .18, r * .20), P(a + .18, r * .20), P(a + .11, r * .61), P(a - .11, r * .61), [.76, .79, .81], n);
      disc(b, [x + sd * .055, Math.cos(a) * r * .24, Math.sin(a) * r * .24], [0, 1, 0], [0, 0, 1], r * .035, 5, [.16, .18, .19], n);
    }
    disc(b, [x + sd * .045, 0, 0], [0, 1, 0], [0, 0, 1], r * .17, 12, [.70, .74, .77], n);
  }
}
