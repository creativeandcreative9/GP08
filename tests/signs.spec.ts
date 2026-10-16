import { expect, test } from '@playwright/test';
import { CELL_H, CELL_W, signStrips, type SignStrip, type UvRect } from '../src/town/signs';

// Pure-function checks (no browser): a signboard wider than a sign cell shows the lettering undistorted.
const cell: UvRect = { u0: 0.25, u1: 0.5, v0: 0.75, v1: 0.8125 };
/** Atlas u -> pixel column of the cell. */
const px = (u: number): number => ((u - cell.u0) / (cell.u1 - cell.u0)) * CELL_W;

/** A strip plus the cell pixels c0..c1 it shows, the board pixels it covers and its scale (board px per cell px). */
interface Measured extends SignStrip {
  c0: number;
  c1: number;
  board: number;
  scale: number;
}

/** Strips of a board `aspect` times as wide as it is tall, measured as if the board were CELL_H pixels tall. */
function measure(inkL: number, inkR: number, aspect: number): Measured[] {
  return signStrips(cell, inkL, inkR, aspect).map((s) => {
    const [c0, c1] = [px(s.u0), px(s.u1)];
    const board = (s.x1 - s.x0) * aspect * CELL_H;
    return { ...s, c0, c1, board, scale: board / (c1 - c0) };
  });
}

test('a board no wider than a cell shows the whole cell in one strip', () => {
  for (const aspect of [CELL_W / CELL_H, 3]) {
    expect(signStrips(cell, 212, 300, aspect)).toEqual([{ x0: 0, x1: 1, u0: cell.u0, u1: cell.u1 }]);
  }
});

// the station building's board (8:1, one centred glyph) and a board shaped like the platform pole's (4.4:1) whose
// ink sits off-centre, as on a sign with an icon at its left
const wide = [
  { name: 'station board, centred glyph', inkL: 212, inkR: 300, aspect: 8 },
  { name: 'pole-shaped board, off-centre ink', inkL: 30, inkR: 386, aspect: 4.4 },
];

for (const { name, inkL, inkR, aspect } of wide) {
  test(`${name}: only plain background is widened`, () => {
    const strips = measure(inkL, inkR, aspect);
    // contiguous over the whole board, reading the whole cell from left to right
    expect(strips[0]!.x0).toBe(0);
    expect(strips.at(-1)!.x1).toBe(1);
    strips.slice(1).forEach((s, i) => expect(s.x0).toBe(strips[i]!.x1));
    const us = strips.flatMap((s) => [s.u0, s.u1]);
    expect(us).toEqual([...us].sort((a, b) => a - b));
    expect(us[0]).toBeCloseTo(cell.u0, 9);
    expect(us.at(-1)).toBeCloseTo(cell.u1, 9);

    // regression guard: a strip showing a single column (u0 === u1) has a degenerate texture footprint and sparkled
    // under anisotropic filtering, so every strip must show a real range of the cell
    for (const s of strips) expect(s.c1 - s.c0).toBeGreaterThan(0);

    // three strips keep the cell's own scale; the other two are widened and lie in plain background: outside the
    // ink and clear of the inner frame lines (x = 12 and 500)
    const widened = strips.filter((s) => s.scale > 1.001);
    const unscaled = strips.filter((s) => s.scale <= 1.001);
    expect(widened).toHaveLength(2);
    expect(unscaled).toHaveLength(3);
    for (const s of unscaled) expect(s.scale).toBeCloseTo(1, 6);
    for (const s of widened) {
      expect(s.c1 <= inkL || s.c0 >= inkR).toBe(true);
      expect(s.c0).toBeGreaterThanOrEqual(14);
      expect(s.c1).toBeLessThanOrEqual(CELL_W - 14);
    }

    // both gain the same board width, so the ink keeps its place on the board; the ink is inside one unscaled strip
    const [gainL, gainR] = widened.map((s) => s.board - (s.c1 - s.c0));
    expect(gainL).toBeCloseTo(gainR!, 6);
    expect(unscaled.some((s) => s.c0 <= inkL && s.c1 >= inkR)).toBe(true);
  });
}

test('the station board is widened only moderately', () => {
  for (const s of measure(212, 300, 8)) expect(s.scale).toBeLessThan(3);
});

test('a centred glyph stays in the middle of the station board', () => {
  // cell pixel 256 is the glyph's centre: find where the unscaled strip that shows it puts it on the board
  const s = measure(212, 300, 8).find((q) => Math.abs(q.scale - 1) < 1e-6 && q.c0 <= 256 && q.c1 >= 256)!;
  expect(s.x0 + ((256 - s.c0) / (s.c1 - s.c0)) * (s.x1 - s.x0)).toBeCloseTo(0.5, 6);
});
