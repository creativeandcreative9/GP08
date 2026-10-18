import { SURF } from '../surface';
import { HB, Wall, tone, type L3, type Rng } from './housekit';
import { hex, lerp, type RGB } from './util';

/**
 * Facade kit for the mid-rise buildings, the plain shops and the public buildings. Everything is written against a
 * {@link Wall} (see housekit.ts), in wall coordinates: `a` along the wall, `y` up, `n` out of the wall plane (negative =
 * behind it), and made of indexed quads (4 vertices each).
 *
 * The central piece is {@link skinWall}: a wall with rectangular openings CUT OUT of it, so that a window sits back from the
 * wall face behind real reveals (jambs, head, sill). The sun then casts a shadow line under the head and across the
 * reveal, which gives the facade depth. The wall carries a surface tag (tile, panel, siding...) so
 * the shader draws the material on it (see surface.ts).
 */

/** The look of a stretch of wall: colour at the bottom and at the top (dirt and shade below, sun above), material tag, drift. */
export interface Skin {
  lo: RGB;
  hi: RGB;
  /** A SURF value (plain = 0). */
  tag?: number;
  /** Total spread of the random brightness drift at every corner (色むら). */
  amt?: number;
}

/** A rectangular opening in a wall, in wall coordinates. */
export interface Hole {
  a0: number;
  a1: number;
  y0: number;
  y1: number;
}

const lerpC = (a: RGB, b: RGB, t: number): RGB => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

/**
 * A wall surface between a0..a1 and y0..y1 at offset `n`, with the holes left open. The colour runs from `skin.lo` at y0 to
 * `skin.hi` at y1 across all pieces, so the gradient is continuous around the openings.
 */
export function skinWall(w: Wall, a0: number, a1: number, y0: number, y1: number, holes: readonly Hole[], skin: Skin, rnd: Rng, n = 0): void {
  const hs = holes
    .map((h) => ({ a0: Math.max(h.a0, a0), a1: Math.min(h.a1, a1), y0: Math.max(h.y0, y0), y1: Math.min(h.y1, y1) }))
    .filter((h) => h.a1 > h.a0 + 1e-6 && h.y1 > h.y0 + 1e-6);
  const ys = new Set<number>([y0, y1]);
  for (const h of hs) {
    ys.add(h.y0);
    ys.add(h.y1);
  }
  const yl = [...ys].sort((p, q) => p - q);
  const amt = skin.amt ?? 0.05;
  const col = (y: number): RGB => lerpC(skin.lo, skin.hi, (y - y0) / Math.max(1e-6, y1 - y0));
  w.h.surf(skin.tag ?? SURF.plain, () => {
    for (let i = 0; i + 1 < yl.length; i++) {
      const ya = yl[i]!;
      const yb = yl[i + 1]!;
      if (yb - ya < 1e-6) continue;
      const row = hs.filter((h) => h.y0 <= ya + 1e-6 && h.y1 >= yb - 1e-6).sort((p, q) => p.a0 - q.a0);
      let a = a0;
      const seg = (sa: number, sb: number): void => {
        if (sb - sa < 1e-6) return;
        w.qm(sa, sb, ya, yb, n, col(ya), col(yb), rnd, amt);
      };
      for (const h of row) {
        if (h.a0 > a + 1e-6) seg(a, h.a0);
        a = Math.max(a, h.a1);
      }
      if (a < a1 - 1e-6) seg(a, a1);
    }
  });
}

/** What a window is made of (see {@link windowAt}). */
export interface WinSpec {
  /** Centre along the wall, bottom height, width and height of the opening. */
  a: number;
  y: number;
  w: number;
  h: number;
  /** How far the glass stands back from the wall face (0 = flat on the wall). */
  depth: number;
  frame: RGB;
  /** Glass colour at the sill and at the head (the sky shows in the upper part). */
  glass: readonly [RGB, RGB];
  /** 1 = a single pane, 2 = two sliding sashes, 3 = three. */
  panes?: 1 | 2 | 3;
  /** A horizontal bar (transom) at this fraction of the height: the pane above it is a fanlight. */
  transom?: number;
  /** Colour of the reveals (jambs and head); defaults to a shade of the frame. */
  reveal?: RGB;
  /** A protruding sill: colour, and how far it sticks out. */
  sill?: RGB;
  sillOut?: number;
  /** A curtain gathered at one end (-1, 1) or both (0). */
  curtain?: RGB;
  curtainSide?: -1 | 0 | 1;
  /** A roller blind pulled down over the upper part (fraction of the height). */
  blind?: { col: RGB; drop: number };
  /** Optional hood over the window: colour and how far it sticks out. */
  hood?: RGB;
  hoodOut?: number;
  /** Security grille (面格子): vertical bars in front of the glass. */
  bars?: boolean;
}

/**
 * One window in the opening it is given (cut it out of the wall with {@link skinWall} first): reveals, frame, glass in one
 * to three panes, optional transom, curtain, blind, sill and hood. 24-40 vertices.
 */
export function windowAt(w: Wall, s: WinSpec): void {
  const hw = s.w / 2;
  const a0 = s.a - hw;
  const a1 = s.a + hw;
  const y0 = s.y;
  const y1 = s.y + s.h;
  const d = s.depth;
  const rev = s.reveal ?? tone(s.frame, 0.82);
  const fw = Math.min(1.3, s.w * 0.1);
  if (d > 0.05) {
    // jambs, head
    w.wq([a0, y0, 0], [a0, y0, -d], [a0, y1, -d], [a0, y1, 0], tone(rev, 0.9), tone(rev, 0.9), rev, rev, [1, 0, 0]);
    w.wq([a1, y0, 0], [a1, y0, -d], [a1, y1, -d], [a1, y1, 0], tone(rev, 0.8), tone(rev, 0.8), tone(rev, 0.92), tone(rev, 0.92), [-1, 0, 0]);
    w.wq([a0, y1, 0], [a1, y1, 0], [a1, y1, -d], [a0, y1, -d], tone(rev, 0.78), tone(rev, 0.78), tone(rev, 0.78), tone(rev, 0.78), [0, -1, 0]);
  }
  const nf = -d + 0.4; // frame plane
  const ng = -d + 0.8; // glass plane
  // frame (the mullions are what shows between the panes)
  w.q(a0, a1, y0, y1, nf, tone(s.frame, 0.88), s.frame);
  const [gl, gh] = s.glass;
  const tY = s.transom !== undefined ? y0 + s.h * s.transom : undefined;
  const panes = s.panes ?? 2;
  const pw = (s.w - fw * 2 - (panes - 1) * 0.9) / panes;
  for (let i = 0; i < panes; i++) {
    const pa0 = a0 + fw + i * (pw + 0.9);
    const k = 1 - i * 0.05;
    if (tY === undefined) {
      w.q(pa0, pa0 + pw, y0 + fw, y1 - fw, ng, tone(gl, k), tone(gh, k));
    } else {
      w.q(pa0, pa0 + pw, y0 + fw, tY - 0.5, ng, tone(gl, k), tone(lerpC(gl, gh, tY / (y1 - y0) - 0.1), k));
      w.q(pa0, pa0 + pw, tY + 0.5, y1 - fw, ng, tone(lerpC(gl, gh, 0.7), k), tone(gh, k));
    }
  }
  if (s.bars) {
    const n = Math.max(3, Math.round(s.w / 2.6));
    for (let i = 0; i <= n; i++) {
      const a = a0 + fw + ((s.w - fw * 2) * i) / n;
      w.q(a - 0.25, a + 0.25, y0 + fw, y1 - fw, ng + 0.35, hex(0x4a4c52));
    }
  }
  if (s.curtain) {
    const lo = tone(s.curtain, 0.86);
    const iw = s.w - fw * 2;
    const side = s.curtainSide ?? -1;
    const yy1 = y1 - fw;
    if (side === 0) {
      w.q(a0 + fw, a0 + fw + iw * 0.3, y0 + fw, yy1, ng + 0.25, lo, s.curtain);
      w.q(a1 - fw - iw * 0.3, a1 - fw, y0 + fw, yy1, ng + 0.25, lo, s.curtain);
    } else if (side < 0) {
      w.q(a0 + fw, a0 + fw + iw * 0.5, y0 + fw, yy1, ng + 0.25, lo, s.curtain);
    } else {
      w.q(a1 - fw - iw * 0.5, a1 - fw, y0 + fw, yy1, ng + 0.25, lo, s.curtain);
    }
  }
  if (s.blind) {
    const top = y1 - fw;
    const bot = top - (s.h - fw * 2) * s.blind.drop;
    w.q(a0 + fw, a1 - fw, bot, top, ng + 0.25, tone(s.blind.col, 0.9), s.blind.col);
    w.q(a0 + fw, a1 - fw, bot - 0.5, bot, ng + 0.3, tone(s.blind.col, 0.7));
  }
  if (s.sill) {
    const out = s.sillOut ?? 1.6;
    const sc = s.sill;
    // the top runs from the glass to the front edge, so it is also the bottom of the reveal
    w.wq([a0 - 1, y0, -d], [a1 + 1, y0, -d], [a1 + 1, y0, out], [a0 - 1, y0, out], tone(sc, 0.9), tone(sc, 0.9), tone(sc, 1.05), tone(sc, 1.05), [0, 1, 0]);
    w.wq([a0 - 1, y0 - 1.5, out], [a1 + 1, y0 - 1.5, out], [a1 + 1, y0, out], [a0 - 1, y0, out], tone(sc, 0.78), tone(sc, 0.78), sc, sc, [0, 0, 1]);
  } else if (d > 0.05) {
    // the bottom of the reveal
    const sc = tone(rev, 1.1);
    w.wq([a0, y0, 0], [a1, y0, 0], [a1, y0, -d], [a0, y0, -d], tone(sc, 1.06), tone(sc, 1.06), sc, sc, [0, 1, 0]);
  }
  if (s.hood) {
    const out = s.hoodOut ?? 5;
    const hc = s.hood;
    // a slanting awning: top face and the two triangular ends
    const yt = y1 + 1.2;
    w.wq([a0 - 1.5, yt, 0], [a1 + 1.5, yt, 0], [a1 + 1.5, yt - out * 0.45, out], [a0 - 1.5, yt - out * 0.45, out], hc, hc, tone(hc, 1.08), tone(hc, 1.08), [0, 1, 0.5]);
    w.wq([a0 - 1.5, yt - out * 0.45, out], [a1 + 1.5, yt - out * 0.45, out], [a1 + 1.5, yt - out * 0.45 - 1.4, out], [a0 - 1.5, yt - out * 0.45 - 1.4, out], tone(hc, 0.82), tone(hc, 0.82), tone(hc, 0.9), tone(hc, 0.9), [0, 0, 1]);
  }
}

/** The reveal-less glass of a window on a plain wall (cheap: 8-12 vertices), for walls nobody looks at closely. */
export function flatWindow(w: Wall, a: number, y: number, ww: number, hh: number, frame: RGB, glass: readonly [RGB, RGB], panes: 1 | 2 = 2): void {
  const hw = ww / 2;
  const fw = 1.2;
  w.q(a - hw, a + hw, y, y + hh, 0.45, tone(frame, 0.88), frame);
  if (panes === 1) {
    w.q(a - hw + fw, a + hw - fw, y + fw, y + hh - fw, 0.85, glass[0], glass[1]);
  } else {
    w.q(a - hw + fw, a - 0.5, y + fw, y + hh - fw, 0.85, glass[0], glass[1]);
    w.q(a + 0.5, a + hw - fw, y + fw, y + hh - fw, 0.85, tone(glass[0], 0.94), tone(glass[1], 0.94));
  }
}

/**
 * A protruding band along a wall (a belt course, a slab edge, a cornice): front face, top and underside. `out` is how far it
 * sticks out. Colours: face at its lower and upper edge.
 */
export function ledge(w: Wall, a0: number, a1: number, y0: number, y1: number, out: number, col: RGB, o: { top?: boolean; under?: boolean; tag?: number } = {}): void {
  const lo = tone(col, 0.86);
  w.h.surf(o.tag ?? SURF.plain, () => {
    w.wq([a0, y0, out], [a1, y0, out], [a1, y1, out], [a0, y1, out], lo, lo, col, col, [0, 0, 1]);
    if (o.top !== false) w.wq([a0, y1, 0], [a1, y1, 0], [a1, y1, out], [a0, y1, out], tone(col, 1.04), tone(col, 1.04), tone(col, 1.12), tone(col, 1.12), [0, 1, 0]);
    if (o.under !== false) w.wq([a0, y0, 0], [a1, y0, 0], [a1, y0, out], [a0, y0, out], tone(col, 0.62), tone(col, 0.62), tone(col, 0.7), tone(col, 0.7), [0, -1, 0]);
  });
}

/**
 * A rooftop item kit. Each function draws one item standing on y at local (u, v) of the frame in `h`; sizes are the half
 * extents. They are what real flat roofs carry: a stair/lift head (塔屋), a water tank on legs, an air-conditioning block with
 * grilles, a pipe duct, a vent hood, a solar rack.
 */
export function stairHead(h: HB, u: number, v: number, hu: number, hv: number, y: number, hgt: number, wallCol: RGB, rnd: Rng): void {
  const top = y + hgt;
  const base = tone(wallCol, 0.9);
  h.box(u - hu, u + hu, y, top, v - hv, v + hv, base, 'fblr', { lo: tone(base, 0.8) });
  h.flat(u - hu - 0.8, u + hu + 0.8, v - hv - 0.8, v + hv + 0.8, top + 0.8, tone(wallCol, 1.06));
  h.box(u - hu - 0.8, u + hu + 0.8, top, top + 0.8, v - hv - 0.8, v + hv + 0.8, tone(wallCol, 0.95), 'fblr');
  // the door on the front, with a little hood
  const dw = Math.min(4, hu * 0.5);
  h.wallV(u - dw, u + dw, y, y + Math.min(14, hgt - 3), v + hv + 0.3, 1, hex(0x6a7078), hex(0x8a9098));
  h.box(u - dw - 0.8, u + dw + 0.8, y + Math.min(14, hgt - 3), y + Math.min(14, hgt - 3) + 0.9, v + hv, v + hv + 3, tone(wallCol, 0.8), 'ft');
  void rnd;
}

export function waterTank(h: HB, u: number, v: number, y: number, r: number, hgt: number, rnd: Rng): void {
  const p = h.f.pt(u, 0, v);
  const col = tone(hex(0xc9d3dc), 0.94 + rnd() * 0.1);
  // four legs and a frame, then an eight-sided tank with a lid and a ladder
  for (const [du, dv] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
    h.box(u + du * (r - 0.9) - 0.5, u + du * (r - 0.9) + 0.5, y, y + 4, v + dv * (r - 0.9) - 0.5, v + dv * (r - 0.9) + 0.5, hex(0x7e868e), 'fblr');
  }
  h.box(u - r, u + r, y + 3.6, y + 4.4, v - r, v + r, hex(0x6a727a), 'fblrt');
  h.prism(p[0], p[2], y + 4.4, y + 4.4 + hgt, r * 0.95, r * 0.95, 8, col, false);
  h.prism(p[0], p[2], y + 4.4 + hgt, y + 4.4 + hgt + 1.2, r * 0.7, r * 0.5, 8, tone(col, 0.8), true);
  h.wallV(u + r * 0.2, u + r * 0.2 + 0.6, y + 4.4, y + 4.4 + hgt, v + r + 0.3, 1, hex(0x58606a));
}

/** An air-conditioning block: a box with fan grilles on its front. */
export function hvacUnit(h: HB, u: number, v: number, y: number, hu: number, hv: number, hgt: number, rnd: Rng): void {
  const col = rnd() < 0.5 ? hex(0xd7dbdd) : hex(0xe6e8e4);
  h.box(u - hu, u + hu, y + 1, y + 1 + hgt, v - hv, v + hv, col, 'fblrt', { lo: tone(col, 0.86), top: tone(col, 1.05) });
  h.box(u - hu + 0.5, u + hu - 0.5, y, y + 1, v - hv + 0.5, v + hv - 0.5, hex(0x6e747a), 'fblr');
  const n = Math.max(1, Math.round(hu / 4));
  for (let i = 0; i < n; i++) {
    const cu = u - hu + ((i + 0.5) * hu * 2) / n;
    h.wallV(cu - 2, cu + 2, y + 1.6, y + hgt, v + hv + 0.15, 1, hex(0x4c5158), hex(0x5d636a));
  }
}

/** A rail along a rooftop edge or a stair: posts every ~10 units and two rails, on the local line from (a0, v) to (a1, v). */
export function railing(h: HB, a0: number, a1: number, v: number, y: number, hgt: number, col: RGB, post = 10): void {
  const n = Math.max(1, Math.round(Math.abs(a1 - a0) / post));
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    h.box(a - 0.3, a + 0.3, y, y + hgt, v - 0.3, v + 0.3, col, 'fblr');
  }
  h.box(Math.min(a0, a1), Math.max(a0, a1), y + hgt - 0.5, y + hgt + 0.3, v - 0.3, v + 0.3, col, 'ft');
  h.box(Math.min(a0, a1), Math.max(a0, a1), y + hgt * 0.45, y + hgt * 0.45 + 0.5, v - 0.2, v + 0.2, col, 'f');
}

export type { L3 };
