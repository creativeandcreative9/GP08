import type { MeshBatch } from './batch';
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

/**
 * A simple low-poly standing figure (about 20 units tall, like the player) built from boxes and facets.
 * `yaw` is the direction it faces: 0 = +z (north), pi/2 = +x (east).
 */
export function person(b: MeshBatch, x: number, y: number, z: number, yaw: number, st: PersonStyle, scale = 1): void {
  const s = scale;
  const c = Math.cos(yaw);
  const sn = Math.sin(yaw);
  const W = (lx: number, lz: number): [number, number] => [x + (lx * c + lz * sn) * s, z + (-lx * sn + lz * c) * s];
  const box = (lx: number, lz: number, y0: number, y1: number, hx: number, hz: number, col: RGB): void => {
    const [wx, wz] = W(lx, lz);
    obox(b, wx, wz, y + y0 * s, y + y1 * s, hx * s, hz * s, yaw, col);
  };
  // legs and shoes
  const dy = st.seated ? -3 : 0;
  const legTop = st.skirt ? 7.4 : 9.6;
  if (st.seated) {
    for (const sx of [-1.45, 1.45]) {
      box(sx, 3.2, 6.4, 8.4, 1.2, 3.4, st.skirt ? st.skin : st.trousers);
      box(sx, 6.4, 1.2, 6.4, 1.1, 1.2, st.skirt ? st.skin : st.trousers);
      box(sx, 7.1, 0, 1.2, 1.3, 2, hex(0x2a2a30));
    }
  } else {
    for (const sx of [-1.45, 1.45]) {
      box(sx, 0, 1.2, legTop, 1.2, 1.3, st.skirt ? st.skin : st.trousers);
      box(sx, 0.5, 0, 1.2, 1.3, 2, hex(0x2a2a30));
    }
  }
  if (st.skirt) box(0, 0, 6.4 + dy, 10.4 + dy, 3.5, 2.3, st.trousers);
  // torso, arms
  box(0, 0, 9.4 + dy, 16.8 + dy, 3.5, 1.9, st.jacket);
  const fwd = st.armsForward ? 2.2 : 0.3;
  for (const sx of [-1, 1]) {
    box(sx * 4.6, fwd * 0.5, 9.6 + dy, 16.4 + dy, 1.1, 1.2 + (st.armsForward ? 1.4 : 0), st.jacket);
    box(sx * 4.6, fwd, 8.2 + dy, 9.8 + dy, 0.95, 1.0, st.cap ? hex(0xffffff) : st.skin);
  }
  if (st.bag) box(-4.6, -0.8, 7.5 + dy, 12 + dy, 0.9, 2.4, st.bag);
  // head, hair
  const [hx, hz] = W(0, 0);
  b.blob(hx, y + (19.2 + dy) * s, hz, 2.7 * s, 3 * s, 2.7 * s, st.skin, 0.03, 1);
  const [bx, bz] = W(0, -0.55);
  b.blob(bx, y + (19.8 + dy) * s, bz, 2.95 * s, 2.9 * s, 2.95 * s, st.hair, 0.05, 2);
  if (st.cap) {
    const [cx2, cz2] = W(0, 0.1);
    b.cylinder(cx2, cz2, y + (21.4 + dy) * s, y + (23.2 + dy) * s, 3.1 * s, 2.9 * s, 8, st.cap);
    box(0, 2.9, 21.3 + dy, 21.9 + dy, 2.2, 1.7, st.cap);
    box(0, 0.1, 21.2 + dy, 21.7 + dy, 3.2, 3.2, hex(0xe0c060));
  }
}
