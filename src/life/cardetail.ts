import type { MeshBatch } from '../town/batch';
import type { RGB, V3 } from '../town/util';
import { fan, mixRGB, plate } from './geom';

type Quad = readonly [V3, V3, V3, V3];
const RUBBER: RGB = [.09, .12, .13];
const CABIN: RGB = [.17, .23, .25];

/** Bilinear coordinates keep painted details on their own sloped panel, including windshields. */
function panelPoint(q: Quad, u: number, v: number, n: V3, lift = 0): V3 {
  const axis = (i: number): number => q[0][i]! * (1 - u) * (1 - v) + q[1][i]! * u * (1 - v)
    + q[2][i]! * u * v + q[3][i]! * (1 - u) * v + n[i]! * lift;
  return [axis(0), axis(1), axis(2)];
}

function panelPatch(b: MeshBatch, q: Quad, uv: readonly (readonly [number, number])[], color: RGB, n: V3, lift: number): void {
  fan(b, uv.map(([u, v]) => panelPoint(q, u, v, n, lift)), color, n);
}

const clippedRect = (u0: number, v0: number, u1: number, v1: number, cut = .035): [number, number][] => [
  [u0 + cut, v0], [u1 - cut, v0], [u1, v0 + cut], [u1, v1 - cut],
  [u1 - cut, v1], [u0 + cut, v1], [u0, v1 - cut], [u0, v0 + cut],
];

/** Opaque glazing with visible seals, reflected sky and the dark shapes of seats inside.
 * It stays in the car's single opaque instance batch: no transparency sorting or extra draw calls.
 * q runs bottom-left, bottom-right, top-right, top-left when looking at the window.
 */
export function carWindow(b: MeshBatch, q: Quad, n: V3, paint: RGB, windshield = false, rear = false): void {
  b.quad(q[0], q[1], q[2], q[3], paint, n);
  panelPatch(b, q, clippedRect(.045, .06, .955, .94), RUBBER, n, .025);
  const start = b.vertexCount;
  panelPatch(b, q, clippedRect(.07, .095, .93, .905), CABIN, n, .045);
  const y0 = (q[0][1] + q[1][1]) / 2, y1 = (q[2][1] + q[3][1]) / 2;
  for (let i = start; i < b.vertexCount; i++) {
    const t = Math.max(0, Math.min(1, (b.pos[i * 3 + 1]! - y0) / Math.max(.01, y1 - y0)));
    const c = mixRGB([.20, .28, .30], [.49, .61, .64], t);
    b.col[i * 4] = c[0]; b.col[i * 4 + 1] = c[1]; b.col[i * 4 + 2] = c[2];
  }
  // Dashboard/door edge, plus rounded headrests. These are silhouettes seen through tinted glass.
  panelPatch(b, q, [[.085, .12], [.915, .12], [.89, .25], [.11, .25]], [.14, .20, .22], n, .065);
  for (const u of windshield ? [.29, .71] : [.56]) {
    const w = windshield ? .13 : .18;
    panelPatch(b, q, clippedRect(u - w, .23, u + w, .43, .035), [.22, .29, .30], n, .07);
    panelPatch(b, q, clippedRect(u - w * .56, .40, u + w * .56, .58, .035), [.19, .26, .28], n, .075);
    panelPatch(b, q, [[u - w * .42, .53], [u + w * .42, .53], [u + w * .42, .57], [u - w * .42, .57]], [.36, .43, .43], n, .08);
  }
  // Restrained diagonal sky reflections leave the cabin readable.
  panelPatch(b, q, [[.13, .34], [.17, .34], [.35, .86], [.27, .86]], [.62, .72, .74], n, .09);
  panelPatch(b, q, [[.20, .34], [.218, .34], [.40, .86], [.374, .86]], [.49, .62, .65], n, .095);
  if (windshield) {
    const positions = rear ? [.50] : [.29, .70];
    for (const u of positions) {
      panelPatch(b, q, [[u - .11, .135], [u + .10, .17], [u + .10, .19], [u - .11, .155]], RUBBER, n, .11);
      panelPatch(b, q, [[u - .02, .12], [u, .12], [u + .07, .18], [u + .05, .18]], RUBBER, n, .115);
    }
  }
}

/** A bevelled rectangular panel; the eight-corner silhouette replaces a hard square. */
export function roundedPanel(b: MeshBatch, c: V3, u: V3, v: V3, color: RGB, n: V3, cut = .18): void {
  const q: Quad = [
    [c[0] - u[0] - v[0], c[1] - u[1] - v[1], c[2] - u[2] - v[2]],
    [c[0] + u[0] - v[0], c[1] + u[1] - v[1], c[2] + u[2] - v[2]],
    [c[0] + u[0] + v[0], c[1] + u[1] + v[1], c[2] + u[2] + v[2]],
    [c[0] - u[0] + v[0], c[1] - u[1] + v[1], c[2] - u[2] + v[2]],
  ];
  panelPatch(b, q, clippedRect(0, 0, 1, 1, cut), color, n, 0);
}

/** Small geometric digits remain sharp at any resolution without an image or font atlas. */
export function numberPlate(b: MeshBatch, z: number, y: number, hw: number, commercial: boolean, yellow: boolean): void {
  const sd = Math.sign(z), n: V3 = [0, 0, sd];
  // Seen from +Z, the viewer's right is -X; seen from -Z it is +X.
  const facing = -sd;
  const base: RGB = commercial ? [.08, .31, .22] : yellow ? [.98, .79, .18] : [.93, .94, .88];
  const ink: RGB = commercial ? [.94, .94, .85] : [.13, .25, .20];
  roundedPanel(b, [0, y, z], [hw + .16, 0, 0], [0, 1.16, 0], [.30, .34, .33], n, .1);
  roundedPanel(b, [0, y, z + sd * .025], [hw, 0, 0], [0, 1.02, 0], base, n, .1);
  for (const x of [-hw + .32, hw - .32]) plate(b, [x, y + .67, z + sd * .05], [.07, 0, 0], [0, .07, 0], ink, n);
  // An invented local registration, 20–08; four characters instead of the old solid ink bar.
  const segments = [0b1011011, 0b0111111, 0b0111111, 0b1111111];
  const digitW = hw * .22;
  const bars: [number, number, number, number][] = [[0, .48, .34, .065], [.34, .25, .065, .22], [.34, -.25, .065, .22],
    [0, -.48, .34, .065], [-.34, -.25, .065, .22], [-.34, .25, .065, .22], [0, 0, .34, .065]];
  for (let i = 0; i < 4; i++) for (let j = 0; j < 7; j++) if (segments[i]! & (1 << j)) {
    const [x, yy, w, h] = bars[j]!;
    const cx = (i - 1.5) * digitW * 1.7 + (i < 2 ? -.13 : .13);
    plate(b, [facing * (cx + x * digitW * 1.35), y - .13 + yy, z + sd * .065], [w * digitW * 1.35, 0, 0], [0, h, 0], ink, n);
  }
  plate(b, [0, y - .13, z + sd * .065], [.09, 0, 0], [0, .045, 0], ink, n);
  for (const x of [-.48, 0, .48]) plate(b, [x, y + .69, z + sd * .065], [.14, 0, 0], [0, .055, 0], ink, n);
}
