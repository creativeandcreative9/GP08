import type { WorldXZ } from '../town/layout';
import type { Footprint } from '../player/player';
import { ObstacleGrid } from '../life/obstacles';

interface Node { x: number; z: number; g: number; f: number; parent?: Node }

export type WalkingSegmentCheck = (from: WorldXZ, to: WorldXZ) => boolean;

function walkingSpace(obstacles: readonly Footprint[], ground: (x: number, z: number) => number, land: (x: number, z: number) => boolean): {
  free(x: number, z: number): boolean;
  clear: WalkingSegmentCheck;
} {
  const grid = new ObstacleGrid(obstacles, 64, 4);
  const free = (x: number, z: number): boolean => Number.isFinite(x) && Number.isFinite(z) && land(x, z) && !grid.hit(x, z, 4);
  const clear = (a: WorldXZ, b: WorldXZ): boolean => {
    if (![a.x, a.z, b.x, b.z].every(Number.isFinite)) return false;
    const count = Math.max(1, Math.ceil(Math.hypot(a.x - b.x, a.z - b.z) / 3)); let y = ground(a.x, a.z);
    if (!Number.isFinite(y)) return false;
    for (let i = 0; i <= count; i++) {
      const x = a.x + (b.x - a.x) * i / count, z = a.z + (b.z - a.z) * i / count, next = ground(x, z);
      if (!free(x, z) || !Number.isFinite(next) || Math.abs(next - y) > 2) return false; y = next;
    }
    return true;
  };
  return { free, clear };
}

/**
 * Cache once per town. Guidance and A* share the player's radius, walkable land,
 * and step-height checks; reaching a corner alone does not make a shortcut safe.
 */
export function createWalkingSegmentCheck(obstacles: readonly Footprint[], ground: (x: number, z: number) => number, land: (x: number, z: number) => boolean = () => true): WalkingSegmentCheck {
  return walkingSpace(obstacles, ground, land).clear;
}

/** Small A* search on walkable ground. Every diagonal and final segment is checked against walls. */
export function walkingRoute(start: WorldXZ, end: WorldXZ, obstacles: readonly Footprint[], ground: (x: number, z: number) => number, land: (x: number, z: number) => boolean = () => true): WorldXZ[] {
  // Babylon Vector3 exposes x/z as prototype getters: object spread loses them.
  start = { x: start.x, z: start.z }; end = { x: end.x, z: end.z };
  const step = 14, heap: Node[] = [], best = new Map<string, number>();
  const key = (x: number, z: number): string => `${x},${z}`;
  const { free, clear } = walkingSpace(obstacles, ground, land);
  if (!free(start.x, start.z) || !free(end.x, end.z)) return [];
  if (clear(start, end)) return [{ ...start }, { ...end }];
  const snap = (p: WorldXZ): WorldXZ | undefined => {
    const x = Math.round(p.x / step) * step, z = Math.round(p.z / step) * step;
    for (let radius = 0; radius <= 3; radius++) for (let dx = -radius; dx <= radius; dx++) for (let dz = -radius; dz <= radius; dz++) {
      const q = { x: x + dx * step, z: z + dz * step }; if (clear(p, q)) return q;
    }
    return undefined;
  };
  const a = snap(start), b = snap(end); if (!a || !b) return [];
  const estimate = (x: number, z: number): number => Math.hypot(x - b.x, z - b.z);
  const push = (node: Node): void => { let i = heap.length; heap.push(node); while (i > 0) { const parent = (i - 1) >> 1; if (heap[parent]!.f <= node.f) break; heap[i] = heap[parent]!; i = parent; } heap[i] = node; };
  const pop = (): Node => { const top = heap[0]!, last = heap.pop()!; if (heap.length) { let i = 0; while (i * 2 + 1 < heap.length) { let child = i * 2 + 1; if (child + 1 < heap.length && heap[child + 1]!.f < heap[child]!.f) child++; if (heap[child]!.f >= last.f) break; heap[i] = heap[child]!; i = child; } heap[i] = last; } return top; };
  push({ ...a, g: 0, f: estimate(a.x, a.z) }); best.set(key(a.x, a.z), 0);
  for (let visited = 0; heap.length && visited < 50000; visited++) {
    const n = pop(); if (n.g !== best.get(key(n.x, n.z))) continue;
    if (n.x === b.x && n.z === b.z) {
      const raw: WorldXZ[] = [{ ...end }]; for (let p: Node | undefined = n; p; p = p.parent) raw.push({ x: p.x, z: p.z }); raw.push({ ...start }); raw.reverse();
      const out = [raw[0]!]; for (let i = 1; i < raw.length;) { let next = i; while (next + 1 < raw.length && clear(out.at(-1)!, raw[next + 1]!)) next++; out.push(raw[next]!); i = next + 1; } return out;
    }
    for (const dx of [-step, 0, step]) for (const dz of [-step, 0, step]) {
      if (!dx && !dz) continue;
      const x = n.x + dx, z = n.z + dz;
      if (Math.abs(x - start.x) > 10000 || Math.abs(z - start.z) > 10000 || !free(x, z)) continue;
      if (dx && dz && (!free(n.x + dx, n.z) || !free(n.x, n.z + dz))) continue;
      if (!clear(n, { x, z })) continue;
      const g = n.g + Math.hypot(dx, dz), k = key(x, z); if (g >= (best.get(k) ?? Infinity)) continue;
      best.set(k, g); push({ x, z, g, f: g + estimate(x, z), parent: n });
    }
  }
  return [];
}
