import type { Ctx } from './ctx';
import { Frame } from './frame';
import { HB, Wall, houseRng, tone } from './housekit';
import { ledge, skinWall, windowAt, type Hole } from './facade';
import { hex, type RGB } from './util';
import { SURF } from '../surface';

/** Hollow facade with actual recessed window openings, without changing the original collision footprint. */
export function detailedBlock(c: Ctx, frame: Frame, u0: number, u1: number, v0: number, v1: number, y0: number, floors: number, floorH: number, color: RGB, tag: number, skipFrontGround = false): void {
  const p = frame.pt((u0 + u1) / 2, 0, (v0 + v1) / 2);
  const f = new Frame(p[0], p[2], frame.fx, frame.fz), hu = (u1 - u0) / 2, hv = (v1 - v0) / 2;
  const b = c.main.at(f.cx, f.cz), h = new HB(b, f), random = houseRng([floors, floorH, tag], p[0], p[2]);
  const top = y0 + floors * floorH;
  const details = houseRng([floors, floorH, tag, 2351], p[0], p[2]);
  for (const face of ['f', 'b', 'l', 'r'] as const) {
    const w = new Wall(h, face, hu, hv), n = Math.max(1, Math.floor((w.half * 2 - 16) / 36));
    const holes: Hole[] = [];
    for (let fl = 0; fl < floors; fl++) for (let i = 0; i < n; i++) {
      if (skipFrontGround && fl === 0 && face === 'f') continue;
      const a = -w.half + (i + .5) * w.half * 2 / n, ww = Math.min(18, w.half * 2 / n - 8), yy = y0 + fl * floorH + 8;
      holes.push({ a0: a - ww / 2, a1: a + ww / 2, y0: yy, y1: yy + 20 });
    }
    skinWall(w, -w.half, w.half, y0, top, holes, { lo: tone(color, .84), hi: color, tag, amt: .045 }, random);
    for (const hole of holes) {
      const a = (hole.a0 + hole.a1) / 2, shaded = details() < .26;
      windowAt(w, { a, y: hole.y0, w: hole.a1 - hole.a0, h: hole.y1 - hole.y0, depth: 2.2, frame: hex(0xd5d9d6), glass: [hex(0x668ca7), hex(0xc2dce8)], sill: tone(color, .78), sillOut: 2.2, panes: 2,
        ...(random() < .22 ? { blind: { col: hex(0xe2d8bf), drop: .4 + random() * .35 } } : {}),
        ...(shaded ? { hood: hex(tag === SURF.panel ? 0x9caab0 : 0x7c8b83), hoodOut: 3.2 } : {}),
        ...(details() < .16 ? { curtain: hex(details() < .5 ? 0xe4dac5 : 0xd1ddd0), curtainSide: details() < .5 ? -1 as const : 1 as const } : {}),
      });
      if (details() < .12 && hole.a1 - hole.a0 >= 14) h.surf(SURF.paintedMetal, () => serviceUnit(w, a, Math.max(.4, hole.y0 - 9.3)));
    }
    // Nearby residential windows get shallow guards without consuming shared random draws.
    if (Math.hypot(f.cx, f.cz) < 1600 && (tag === SURF.siding || tag === SURF.tile)) {
      for (let i = 0; i < holes.length; i++) {
        const hole = holes[i]!, a = (hole.a0 + hole.a1) / 2;
        const hardware = hex(0x657172);
        if ((i + (face === 'f' ? 0 : 1)) % 3 !== 0) continue;
        h.surf(SURF.paintedMetal, () => {
          w.box(hole.a0 - .8, hole.a1 + .8, hole.y0 + 6.2, hole.y0 + 6.65, 2.8, 3.35, hardware, 'ot');
          w.box(hole.a0 - .8, hole.a1 + .8, hole.y0 - 1, hole.y0 - .55, 2.8, 3.35, hardware, 'ot');
          for (let u = hole.a0; u <= hole.a1 + .01; u += 3.2) {
            w.q(u - .18, u + .18, hole.y0 - .7, hole.y0 + 6.4, 3.12, tone(hardware, .85), hardware);
          }
          for (const side of [-1, 1]) w.part(a + side * ((hole.a1 - hole.a0) / 2 + .5), hole.y0 - .6, hole.y0 + 6.4, .5, 3.12, hardware);
        });
      }
    }
    if (face === 'f' || face === 'b') for (const side of [-1, 1]) {
      const a = side * (w.half - 1.8), pipe = hex(0xadaea8);
      w.box(a - .45, a + .45, .6, top - .6, .5, 1.4, pipe, 'oazt', { lo: tone(pipe, .86) });
      for (let y = 5; y < top - 2; y += 30) w.q(a - .7, a + .7, y, y + .38, 1.46, tone(pipe, .75));
    }
    for (let fl = 1; fl <= floors; fl++) ledge(w, -w.half, w.half, y0 + fl * floorH - 1.3, y0 + fl * floorH, 1.7, tone(color, .91));
  }
  h.surf(tag, () => h.flat(-hu, hu, -hv, hv, top, tone(color, .8)));
}


/** Compact wall-mounted condenser, round fan, slotted grille, brackets and insulated pipe. */
function serviceUnit(w: Wall, a: number, y: number): void {
  const body = hex(0xe3e1d8), dark = hex(0x596268), grille = hex(0xbfc3bf);
  w.box(a - 5.2, a + 5.2, y + .6, y + 8.4, .5, 4.4, body, 'oazt', { lo: tone(body, .85) });
  const cx = a - 1.3, cy = y + 4.5, radius = 2.4;
  for (let i = 0; i < 8; i++) {
    const t0 = i * Math.PI / 4, t1 = (i + 1) * Math.PI / 4;
    w.h.triL(w.pt(cx, cy, 4.46), w.pt(cx + Math.cos(t0) * radius, cy + Math.sin(t0) * radius, 4.46), w.pt(cx + Math.cos(t1) * radius, cy + Math.sin(t1) * radius, 4.46), dark, dark, dark, w.dir(0, 0, 1));
  }
  for (const dy of [-1.4, -.45, .45, 1.4]) {
    const half = Math.sqrt(radius * radius - dy * dy);
    w.q(cx - half, cx + half, cy + dy, cy + dy + .18, 4.49, grille);
  }
  for (let i = 0; i < 5; i++) w.q(a + 2.1, a + 4.2, y + 2 + i * .9, y + 2.24 + i * .9, 4.46, tone(body, .64));
  for (const side of [-1, 1]) w.box(a + side * 3.6 - .23, a + side * 3.6 + .23, y + .1, y + .65, .6, 4.7, hex(0x8c9495));
  w.q(a + 5, a + 9.3, y + 4.8, y + 5.15, .8, hex(0xd9d4c4));
  w.q(a + 8.9, a + 9.3, y + 4.8, y + 13, .8, hex(0xd9d4c4));
}
