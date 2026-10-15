import type { Ctx } from './ctx';
import { DEC1_Y, DEC3_Y } from './ctx';
import type { Frame } from './frame';
import { hex, pick } from './util';

const CAR_COLS = [0xf2f2f2, 0xd8d8dc, 0x2a2d35, 0xc03434, 0x3f6fb0, 0x8a8e96, 0xe8d8a8, 0x4f8f5f].map(hex);

/** Coin parking lot: asphalt, painted stalls, a few cars and a sign on a pole. */
export function addParking(c: Ctx, f: Frame, hu: number, hv: number): void {
  const b = c.main.at(f.cx, f.cz);
  const r = c.rnd;
  const asph = hex(0x6d7078);
  const y1 = DEC1_Y;
  c.dec1.quad(f.pt(-hu, y1, -hv), f.pt(hu, y1, -hv), f.pt(hu, y1, hv), f.pt(-hu, y1, hv), asph, [0, 1, 0]);
  const stallW = 28;
  const stallD = 62;
  const n = Math.max(1, Math.floor((hu * 2 - 10) / stallW));
  const rows = hv * 2 > 150 ? 2 : 1;
  const line = hex(0xf4f4ee);
  for (let row = 0; row < rows; row++) {
    const v0 = row === 0 ? -hv + 6 : hv - 6 - stallD;
    const v1 = v0 + stallD;
    for (let i = 0; i <= n; i++) {
      const u = -n * stallW / 2 + i * stallW;
      c.dec3.quad(f.pt(u - 0.6, DEC3_Y, v0), f.pt(u + 0.6, DEC3_Y, v0), f.pt(u + 0.6, DEC3_Y, v1), f.pt(u - 0.6, DEC3_Y, v1), line, [0, 1, 0]);
    }
    for (let i = 0; i < n; i++) {
      if (r() < 0.45) continue;
      const u = -n * stallW / 2 + (i + 0.5) * stallW;
      const vc = (v0 + v1) / 2;
      const col = pick(CAR_COLS, r);
      f.box(b, u - 9.5, u + 9.5, 2.5, 12.5, vc - 26, vc + 26, col);
      f.box(b, u - 8.5, u + 8.5, 12.5, 20, vc - 13, vc + 11, col, { top: hex(0x9fd0ee) });
    }
  }
  // sign post at the front-left corner
  const p = f.pt(-hu + 6, 0, hv - 4);
  b.cylinder(p[0], p[2], 0, 36, 1.2, 1.2, 5, hex(0x555a62));
  b.box(p[0] - 7, p[0] + 7, 36, 48, p[2] - 1, p[2] + 1, hex(0x1b5fb0));
}
