import type { Rect } from '../town/util';

/**
 * A uniform grid over the solid footprints of the town (buildings, furniture, decks: `town.obstacles`), so that
 * "is there something solid here?" is answered by looking at one cell instead of walking through thousands of
 * rectangles. Used while the crowd is placed and by walkers looking ahead (pure logic, no Babylon).
 */
export class ObstacleGrid {
  private readonly cells = new Map<number, number[]>();
  private readonly size: number;
  private readonly rects: readonly Rect[];

  /**
   * `grow` is the largest margin `hit` will be asked for: a rectangle is listed in every cell its grown outline
   * touches, so the single cell holding a point knows every rectangle that could contain it.
   */
  constructor(rects: readonly Rect[], size = 48, readonly grow = 6) {
    this.rects = rects;
    this.size = size;
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i]!;
      const i0 = Math.floor((r.minX - grow) / size);
      const i1 = Math.floor((r.maxX + grow) / size);
      const j0 = Math.floor((r.minZ - grow) / size);
      const j1 = Math.floor((r.maxZ + grow) / size);
      for (let a = i0; a <= i1; a++) {
        for (let b = j0; b <= j1; b++) {
          const key = this.key(a, b);
          const list = this.cells.get(key);
          if (list) list.push(i);
          else this.cells.set(key, [i]);
        }
      }
    }
  }

  private key(i: number, j: number): number {
    return i * 100003 + j;
  }

  /** Is (x, z) inside a solid footprint grown by `m` (at most `grow`)? Same meaning as `insideAny` of the town. */
  hit(x: number, z: number, m: number): boolean {
    const list = this.cells.get(this.key(Math.floor(x / this.size), Math.floor(z / this.size)));
    if (!list) return false;
    const rects = this.rects;
    for (let i = 0; i < list.length; i++) {
      const r = rects[list[i]!]!;
      if (x > r.minX - m && x < r.maxX + m && z > r.minZ - m && z < r.maxZ + m) return true;
    }
    return false;
  }
}
