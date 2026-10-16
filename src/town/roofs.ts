import { HB, tone, type L3, type Rng } from './housekit';
import { hex, type RGB } from './util';

/**
 * Tiled roofs for the houses: gable (切妻) and hip (寄棟), made of horizontal courses of tiles. Each course is ONE quad
 * whose upper edge is darker than its lower edge (the shadow under the lip of the course above), which reads as rows of
 * tiles from eye level and from the air for the price of four vertices per row. The eaves have a fascia board (鼻隠し)
 * and a soffit, the gable ends a verge board (破風), and the ridge a ridge cap (棟).
 */

export interface RoofSpec {
  form: 'gable' | 'hip';
  /** Local axis the ridge runs along. */
  ridge: 'u' | 'v';
  /** Wall top height and the half sizes of the walls below. */
  yE: number;
  hu: number;
  hv: number;
  /** Eave overhang on the +v/+u (front) side and the -v/-u (back) side, and the overhang at the gable ends. */
  eaveF: number;
  eaveB: number;
  verge: number;
  /** Rise over run of the roof planes. */
  pitch: number;
  /** Base tile colour, fascia/verge colour, soffit colour, colour of the gable-end walls. */
  col: RGB;
  trim: RGB;
  soffit: RGB;
  gableWall: RGB;
  /** Number of tile courses on the front and the back plane (for a hip roof: rings, shared by all four planes). */
  nF: number;
  nB: number;
  /** Fascia depth. */
  fascia?: number;
  /** Richer edges: verge boards and hip caps. */
  rich?: boolean;
  /** Verge boards on the front gable end only (for a ridge running towards the street). */
  vergeFront?: boolean;
}

/** Handle on a built roof, for putting things on it (solar panels, an antenna). */
export interface RoofGeo {
  /** Height of the ridge line (below the ridge cap). */
  yR: number;
  /** Height of the top of the ridge cap. */
  yTop: number;
  /** Half length of the ridge (hip roofs) or of the whole roof along the ridge (gable roofs). */
  ridgeHalf: number;
  /** Local point on a roof plane: side +1 = front, -1 = back; a along the ridge; t = 0 at the eave .. 1 at the ridge. */
  at(side: 1 | -1, a: number, t: number, lift?: number): L3;
  alongU: boolean;
}

const FASCIA = 2.4;
const CAP_H = 1.9;
const CAP_W = 1.8;

/** Colours of a course: lower edge lit, upper edge in the shadow of the next course up. */
function courseColours(col: RGB, k: number): [RGB, RGB] {
  return [tone(col, 1.12 * k), tone(col, 0.8 * k)];
}

export function buildRoof(h: HB, s: RoofSpec, rnd: Rng): RoofGeo {
  const fh = s.fascia ?? FASCIA;
  // a hip roof always runs its ridge along the longer side
  const alongU = s.form === 'hip' ? s.hu >= s.hv : s.ridge === 'u';
  const hA = alongU ? s.hu : s.hv; // half size along the ridge
  const hB = alongU ? s.hv : s.hu; // half size across the ridge
  // (a, y, b) -> local; a runs along the ridge, b across it (+b = front side)
  const L = (a: number, y: number, b: number): L3 => (alongU ? [a, y, b] : [b, y, a]);
  const yR = s.yE + Math.min(hB * s.pitch, 36);
  const pitch = (yR - s.yE) / hB;
  const ridgeCol = tone(s.col, 1.1);

  if (s.form === 'gable') {
    const A = hA + s.verge;
    const yEdgeF = s.yE - s.eaveF * pitch;
    const yEdgeB = s.yE - s.eaveB * pitch;
    const BF = hB + s.eaveF;
    const BB = hB + s.eaveB;
    // tile courses on both planes
    for (const side of [1, -1] as const) {
      const n = side > 0 ? s.nF : s.nB;
      const B = side > 0 ? BF : BB;
      const yEdge = side > 0 ? yEdgeF : yEdgeB;
      const shadeK = side > 0 ? 1 : 0.97;
      for (let i = 0; i < n; i++) {
        const t0 = i / n;
        const t1 = (i + 1) / n;
        const b0 = side * B * (1 - t0);
        const b1 = side * B * (1 - t1);
        const y0 = yEdge + (yR - yEdge) * t0;
        const y1 = yEdge + (yR - yEdge) * t1;
        const [lo, hi] = courseColours(s.col, shadeK * (1 + (rnd() - 0.5) * 0.07));
        // the two ends of a course are a little different, like tiles of different batches
        const j = (): number => 1 + (rnd() - 0.5) * 0.06;
        h.quadL(L(-A, y0, b0), L(A, y0, b0), L(A, y1, b1), L(-A, y1, b1), tone(lo, j()), tone(lo, j()), tone(hi, j()), tone(hi, j()), L(0, 1, 0));
      }
    }
    // gable-end walls (a triangle each), a little darker towards the eave
    const gLo = tone(s.gableWall, 0.93);
    for (const e of [1, -1] as const) {
      h.triL(L(e * hA, s.yE, -hB), L(e * hA, s.yE, hB), L(e * hA, yR, 0), gLo, gLo, s.gableWall, L(e, 0, 0));
    }
    // fascia boards and soffits along the eaves
    for (const side of [1, -1] as const) {
      const B = side > 0 ? BF : BB;
      const yEdge = side > 0 ? yEdgeF : yEdgeB;
      h.quadL(L(-A, yEdge - fh, side * B), L(A, yEdge - fh, side * B), L(A, yEdge, side * B), L(-A, yEdge, side * B), tone(s.trim, 0.86), tone(s.trim, 0.86), s.trim, s.trim, L(0, 0, side));
      if (side > 0 || s.rich) {
        h.quadL(L(-A, yEdge - fh, side * hB), L(A, yEdge - fh, side * hB), L(A, yEdge - fh, side * B), L(-A, yEdge - fh, side * B), s.soffit, s.soffit, s.soffit, s.soffit, L(0, -1, 0));
      }
    }
    // verge boards along the sloping gable edges
    const vergeEnds: readonly (1 | -1)[] = s.rich ? [1, -1] : s.vergeFront && !alongU ? [1] : [];
    {
      for (const e of vergeEnds) {
        for (const side of [1, -1] as const) {
          const B = side > 0 ? BF : BB;
          const yEdge = side > 0 ? yEdgeF : yEdgeB;
          h.quadL(L(e * A, yEdge, side * B), L(e * A, yR, 0), L(e * A, yR - fh, 0), L(e * A, yEdge - fh, side * B), s.trim, s.trim, tone(s.trim, 0.86), tone(s.trim, 0.86), L(e, 0, 0));
        }
      }
    }
    // ridge cap: top and both sides
    const top = yR + CAP_H;
    const rl = tone(ridgeCol, 0.9);
    h.quadL(L(-A, top, -CAP_W), L(A, top, -CAP_W), L(A, top, CAP_W), L(-A, top, CAP_W), ridgeCol, ridgeCol, ridgeCol, ridgeCol, L(0, 1, 0));
    for (const side of [1, -1] as const) {
      h.quadL(L(-A, yR - CAP_W * pitch, side * CAP_W), L(A, yR - CAP_W * pitch, side * CAP_W), L(A, top, side * CAP_W), L(-A, top, side * CAP_W), rl, rl, ridgeCol, ridgeCol, L(0, 0, side));
    }
    return {
      yR,
      yTop: top,
      ridgeHalf: A,
      alongU,
      at: (side, a, t, lift = 0) => {
        const B = side > 0 ? BF : BB;
        const yEdge = side > 0 ? yEdgeF : yEdgeB;
        return L(a, yEdge + (yR - yEdge) * t + lift, side * B * (1 - t));
      },
    };
  }

  // ---- hip roof: four planes, shared rings ----
  // a hip roof overhangs equally on all four sides; a plain house must not reach into the ground of its neighbours
  const eave = s.rich ? (s.eaveF + s.eaveB) / 2 : Math.min(s.eaveF, s.eaveB) + 0.3;
  const AO = hA + eave;
  const BO = hB + eave;
  const yEdge = s.yE - eave * pitch;
  const n = Math.max(2, s.nF);
  const ring = (i: number): { a: number; b: number; y: number } => {
    const t = i / n;
    return { a: AO - t * BO, b: BO * (1 - t), y: yEdge + (yR - yEdge) * t };
  };
  for (let i = 0; i < n; i++) {
    const r0 = ring(i);
    const r1 = ring(i + 1);
    const jit = 1 + (rnd() - 0.5) * 0.07;
    for (const side of [1, -1] as const) {
      const [lo, hi] = courseColours(s.col, (side > 0 ? 1 : 0.97) * jit);
      h.quadL(L(-r0.a, r0.y, side * r0.b), L(r0.a, r0.y, side * r0.b), L(r1.a, r1.y, side * r1.b), L(-r1.a, r1.y, side * r1.b), lo, lo, hi, hi, L(0, 1, 0));
    }
    for (const e of [1, -1] as const) {
      const [lo, hi] = courseColours(s.col, (e > 0 ? 0.99 : 0.95) * jit);
      if (r1.b < 0.05) h.triL(L(e * r0.a, r0.y, -r0.b), L(e * r0.a, r0.y, r0.b), L(e * r1.a, r1.y, 0), lo, lo, hi, L(0, 1, 0));
      else h.quadL(L(e * r0.a, r0.y, -r0.b), L(e * r0.a, r0.y, r0.b), L(e * r1.a, r1.y, r1.b), L(e * r1.a, r1.y, -r1.b), lo, lo, hi, hi, L(0, 1, 0));
    }
  }
  // fascia + soffit on the four sides
  const tl = tone(s.trim, 0.86);
  for (const side of [1, -1] as const) {
    h.quadL(L(-AO, yEdge - fh, side * BO), L(AO, yEdge - fh, side * BO), L(AO, yEdge, side * BO), L(-AO, yEdge, side * BO), tl, tl, s.trim, s.trim, L(0, 0, side));
    h.quadL(L(side * AO, yEdge - fh, -BO), L(side * AO, yEdge - fh, BO), L(side * AO, yEdge, BO), L(side * AO, yEdge, -BO), tl, tl, s.trim, s.trim, L(side, 0, 0));
    if (side > 0 || s.rich) {
      h.quadL(L(-AO, yEdge - fh, side * hB), L(AO, yEdge - fh, side * hB), L(AO, yEdge - fh, side * BO), L(-AO, yEdge - fh, side * BO), s.soffit, s.soffit, s.soffit, s.soffit, L(0, -1, 0));
      h.quadL(L(side * hA, yEdge - fh, -hB), L(side * hA, yEdge - fh, hB), L(side * AO, yEdge - fh, hB), L(side * AO, yEdge - fh, -hB), s.soffit, s.soffit, s.soffit, s.soffit, L(0, -1, 0));
    }
  }
  // ridge cap and hip caps
  const ridgeHalf = AO - BO;
  const top = yR + CAP_H;
  const rl = tone(ridgeCol, 0.9);
  if (ridgeHalf > 3) {
    h.quadL(L(-ridgeHalf, top, -CAP_W), L(ridgeHalf, top, -CAP_W), L(ridgeHalf, top, CAP_W), L(-ridgeHalf, top, CAP_W), ridgeCol, ridgeCol, ridgeCol, ridgeCol, L(0, 1, 0));
    for (const side of [1, -1] as const) {
      h.quadL(L(-ridgeHalf, yR - CAP_W * pitch, side * CAP_W), L(ridgeHalf, yR - CAP_W * pitch, side * CAP_W), L(ridgeHalf, top, side * CAP_W), L(-ridgeHalf, top, side * CAP_W), rl, rl, ridgeCol, ridgeCol, L(0, 0, side));
    }
  } else {
    h.quadL(L(-CAP_W, top, -CAP_W), L(CAP_W, top, -CAP_W), L(CAP_W, top, CAP_W), L(-CAP_W, top, CAP_W), ridgeCol, ridgeCol, ridgeCol, ridgeCol, L(0, 1, 0));
  }
  if (s.rich) {
    // the four hips: a lighter strip lying on the roof from each corner to the ridge end
    const hipCol = tone(s.col, 1.25);
    const r = ridgeHalf > 3 ? ridgeHalf : 0;
    for (const e of [1, -1] as const) {
      for (const side of [1, -1] as const) {
        const x0 = e * AO;
        const z0 = side * BO;
        const x1 = e * r;
        const w = 1.1;
        h.quadL(L(x0 - e * w, yEdge + 0.9, z0), L(x0, yEdge + 0.9, z0 - side * w), L(x1, top - 0.6, side * 0.4), L(x1 - e * 0.4, top - 0.6, 0), hipCol, hipCol, hipCol, hipCol, L(0, 1, 0));
      }
    }
  }
  return {
    yR,
    yTop: top,
    ridgeHalf: Math.max(0, ridgeHalf),
    alongU,
    at: (side, a, t, lift = 0) => L(a, yEdge + (yR - yEdge) * t + lift, side * BO * (1 - t)),
  };
}

/** Palettes of roof tiles: old grey-blue kawara, and the coloured slate of newer houses. */
export const KAWARA: RGB[] = [0x57606c, 0x626c79, 0x4b535e, 0x69727e, 0x55617a, 0x53575f].map(hex);
export const SLATE: RGB[] = [0x62749a, 0xb9644c, 0x557a60, 0x7a5442, 0x5a5e69, 0x3f8a92, 0xa04e4e, 0x8a6a56].map(hex);
