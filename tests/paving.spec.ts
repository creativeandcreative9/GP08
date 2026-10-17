import { expect, test } from '@playwright/test';
import { clipPaving, type ClipPoint, type PavingVertex } from '../src/town/paving';

test('pavement is cut around plots and angled roads without changing texture scale or covering their interior', () => {
  const source: PavingVertex[] = [{ x: -20, z: -20, u: -2, v: -2 }, { x: 20, z: -20, u: 2, v: -2 }, { x: 20, z: 20, u: 2, v: 2 }, { x: -20, z: 20, u: -2, v: 2 }];
  const area = (p: readonly ClipPoint[]): number => Math.abs(p.reduce((s, a, i) => { const b = p[(i + 1) % p.length]!; return s + a.x * b.z - b.x * a.z; }, 0) / 2);
  for (const angle of [0, .35, 1.1, Math.PI / 2]) for (const reversed of [false, true]) {
    const ca = Math.cos(angle), sa = Math.sin(angle);
    const mask = [[-3, -7], [3, -7], [3, 7], [-3, 7]].map(([x, z]) => ({ x: x! * ca - z! * sa + 2, z: x! * sa + z! * ca - 1 }));
    if (reversed) mask.reverse();
    const pieces = clipPaving(source, mask);
    expect(pieces.reduce((n, p) => n + area(p), 0)).toBeCloseTo(1600 - 84, 5);
    for (const polygon of pieces) {
      expect(area(polygon)).toBeGreaterThan(0);
      for (const v of polygon) { expect(v.u).toBeCloseTo(v.x / 10, 6); expect(v.v).toBeCloseTo(v.z / 10, 6); }
      // Every output triangle lies outside the reserved plot, including the middle of its edges.
      for (let i = 1; i + 1 < polygon.length; i++) {
        const triangle = [polygon[0]!, polygon[i]!, polygon[i + 1]!];
        for (const weights of [[1 / 3, 1 / 3, 1 / 3], [.5, .5, 0], [0, .5, .5], [.5, 0, .5]]) {
          const x = triangle.reduce((n, p, k) => n + p.x * weights[k]!, 0) - 2, z = triangle.reduce((n, p, k) => n + p.z * weights[k]!, 0) + 1;
          const a = x * ca + z * sa, b = -x * sa + z * ca;
          expect(Math.abs(a) >= 3 - 1e-6 || Math.abs(b) >= 7 - 1e-6).toBe(true);
        }
      }
    }
  }
  expect(clipPaving(source, [{ x: 25, z: -2 }, { x: 30, z: -2 }, { x: 30, z: 2 }, { x: 25, z: 2 }])).toEqual([source]);
  expect(clipPaving(source, [{ x: -30, z: -30 }, { x: 30, z: -30 }, { x: 30, z: 30 }, { x: -30, z: 30 }])).toEqual([]);
});
