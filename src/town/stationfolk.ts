import { MeshBatch } from './batch';
import { buildPerson, buildSeated, type Outfit } from '../life/people';
import { mergeInto } from '../life/geom';
import { smoothBevels } from './smooth';
import { hex, type RGB, type V3 } from './util';

/** Axis-aligned-in-local-space box rotated by `yaw` (radians, about +y) around (cx, cz). */
export function obox(
  b: MeshBatch, cx: number, cz: number, y0: number, y1: number, hx: number, hz: number, yaw: number, color: RGB,
  o: { top?: RGB; bottom?: boolean } = {},
): void {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const P = (lx: number, y: number, lz: number): V3 => [cx + lx * c + lz * s, y, cz - lx * s + lz * c];
  const N = (lx: number, ly: number, lz: number): V3 => [lx * c + lz * s, ly, -lx * s + lz * c];
  b.quad(P(-hx, y1, -hz), P(-hx, y1, hz), P(hx, y1, hz), P(hx, y1, -hz), o.top ?? color, [0, 1, 0]);
  if (o.bottom) b.quad(P(-hx, y0, -hz), P(hx, y0, -hz), P(hx, y0, hz), P(-hx, y0, hz), color, [0, -1, 0]);
  b.quad(P(-hx, y0, hz), P(hx, y0, hz), P(hx, y1, hz), P(-hx, y1, hz), color, N(0, 0, 1));
  b.quad(P(-hx, y0, -hz), P(-hx, y1, -hz), P(hx, y1, -hz), P(hx, y0, -hz), color, N(0, 0, -1));
  b.quad(P(hx, y0, -hz), P(hx, y1, -hz), P(hx, y1, hz), P(hx, y0, hz), color, N(1, 0, 0));
  b.quad(P(-hx, y0, -hz), P(-hx, y0, hz), P(-hx, y1, hz), P(-hx, y1, -hz), color, N(-1, 0, 0));
}

export interface PersonStyle {
  jacket: RGB;
  trousers: RGB;
  skin: RGB;
  hair: RGB;
  /** Station attendant: uniform cap and white gloves. */
  cap?: RGB;
  skirt?: boolean;
  bag?: RGB;
  /** Arms raised in front (reading a sign, using a machine). */
  armsForward?: boolean;
  /** Sitting (the figure is placed on the seat height). */
  seated?: boolean;
}

export const SKIN = hex(0xf6d3b8);

/** Detailed original figures share the town cast's faces, collars, sleeves and bags. */
export function person(b: MeshBatch, x: number, y: number, z: number, yaw: number, st: PersonStyle, scale = 1): void {
  const outfit: Outfit = {
    id: 'station-visitor', build: st.skirt ? 'woman' : 'man', skin: st.skin,
    hair: { style: st.skirt ? 'bob' : 'short', color: st.hair },
    top: { color: st.jacket, length: 'short', sleeves: 'long', ...(st.cap ? { shirt: hex(0xf3f2e7), collar: st.cap, tie: hex(0x52688a), trim: hex(0xd9c99b) } : {}) },
    bottom: { kind: st.skirt ? 'skirt' : 'trousers', color: st.trousers }, shoes: hex(0x343339),
    ...(st.cap ? { hat: { kind: 'peaked', color: st.cap, band: hex(0xd8bd66) }, gloves: hex(0xf6f5ef) } : {}),
    ...(st.bag ? { bag: { kind: 'shoulder', color: st.bag } } : {}),
  };
  let part: MeshBatch;
  let lift = 0;
  if (st.seated) { part = buildSeated(outfit, 7); lift = 7; }
  else {
    const p = buildPerson(outfit); part = new MeshBatch(); mergeInto(part, p.body, 0, 0, 0);
    if (st.armsForward) {
      const angle = -.85, c = Math.cos(angle), sn = Math.sin(angle);
      for (let i = 0; i < p.arm.pos.length; i += 3) {
        const yy = p.arm.pos[i + 1]!, zz = p.arm.pos[i + 2]!;
        p.arm.pos[i + 1] = yy * c - zz * sn; p.arm.pos[i + 2] = yy * sn + zz * c;
        const ny = p.arm.nor[i + 1]!, nz = p.arm.nor[i + 2]!;
        p.arm.nor[i + 1] = ny * c - nz * sn; p.arm.nor[i + 2] = ny * sn + nz * c;
      }
    }
    for (const side of [-1, 1]) {
      mergeInto(part, p.leg, side * p.dims.hipX, p.hipY, 0);
      mergeInto(part, p.arm, side * p.shoulderX, p.shoulderY, .1);
    }
  }
  smoothBevels(part);
  const c = Math.cos(yaw), sn = Math.sin(yaw);
  for (let i = 0; i < part.pos.length; i += 3) {
    const xx = part.pos[i]!, zz = part.pos[i + 2]!;
    part.pos[i] = (xx * c + zz * sn) * scale; part.pos[i + 1] = (part.pos[i + 1]! + lift) * scale; part.pos[i + 2] = (-xx * sn + zz * c) * scale;
    const nx = part.nor[i]!, nz = part.nor[i + 2]!;
    part.nor[i] = nx * c + nz * sn; part.nor[i + 2] = -nx * sn + nz * c;
  }
  mergeInto(b, part, x, y, z);
}
