import { MeshBatch } from './batch';

/** Merge subpixel details for distant building chunks, keeping face orientation, colour family and surface tags. */
export function distantGeometry(source: { positions: ArrayLike<number>; normals: ArrayLike<number>; colors: ArrayLike<number>; indices: ArrayLike<number>; surfaces?: ArrayLike<number> }, cell = 2): MeshBatch {
  const out = new MeshBatch(), groups = new Map<string, number>(), map: number[] = [], count: number[] = [];
  for (let i = 0; i < source.positions.length / 3; i++) {
    const p = i * 3, c = i * 4, tag = source.surfaces?.[i] ?? 0;
    const key = `${Math.round(source.positions[p]! / cell)},${Math.round(source.positions[p + 1]! / cell)},${Math.round(source.positions[p + 2]! / cell)}:${Math.round(source.normals[p]! * 2)},${Math.round(source.normals[p + 1]! * 2)},${Math.round(source.normals[p + 2]! * 2)}:${Math.round(source.colors[c]! * 8)},${Math.round(source.colors[c + 1]! * 8)},${Math.round(source.colors[c + 2]! * 8)}:${tag}`;
    let index = groups.get(key);
    if (index === undefined) {
      index = out.vertexCount; groups.set(key, index); out.pos.push(0, 0, 0); out.nor.push(0, 0, 0); out.col.push(0, 0, 0, 0);
      out.surface = tag; out.appendSurface(1); count.push(0);
    }
    count[index]!++; map[i] = index;
    for (let k = 0; k < 3; k++) { out.pos[index * 3 + k]! += source.positions[p + k]!; out.nor[index * 3 + k]! += source.normals[p + k]!; }
    for (let k = 0; k < 4; k++) out.col[index * 4 + k]! += source.colors[c + k]!;
  }
  for (let i = 0; i < count.length; i++) {
    const length = Math.hypot(out.nor[i * 3]!, out.nor[i * 3 + 1]!, out.nor[i * 3 + 2]!) || 1;
    for (let k = 0; k < 3; k++) { out.pos[i * 3 + k]! /= count[i]!; out.nor[i * 3 + k]! /= length; }
    for (let k = 0; k < 4; k++) out.col[i * 4 + k]! /= count[i]!;
  }
  for (let i = 0; i < source.indices.length; i += 3) {
    const a = map[source.indices[i]!]!, b = map[source.indices[i + 1]!]!, c = map[source.indices[i + 2]!]!;
    if (a !== b && b !== c && a !== c) out.idx.push(a, b, c);
  }
  return out;
}


/** Simplify each complete 3x3 flower sheet to its outer quad; keep every other textured face intact. */
export function distantFoliageGeometry(source: {
  positions: ArrayLike<number>; normals: ArrayLike<number>; colors: ArrayLike<number>;
  indices: ArrayLike<number>; uvs: ArrayLike<number>; surfaces?: ArrayLike<number>;
}): MeshBatch {
  const out = new MeshBatch(true), map = new Map<number, number>();
  const grid = [0, 1, 4, 0, 4, 3, 1, 2, 5, 1, 5, 4, 3, 4, 7, 3, 7, 6, 4, 5, 8, 4, 8, 7];
  const vertex = (i: number): number => {
    const found = map.get(i); if (found !== undefined) return found;
    const next = out.vertexCount; map.set(i, next);
    for (let k = 0; k < 3; k++) { out.pos.push(source.positions[i * 3 + k]!); out.nor.push(source.normals[i * 3 + k]!); }
    for (let k = 0; k < 4; k++) out.col.push(source.colors[i * 4 + k]!);
    out.uvs.push(source.uvs[i * 2]!, source.uvs[i * 2 + 1]!); out.surf.push(source.surfaces?.[i] ?? 0);
    return next;
  };
  const isGrid = (t: number, base: number): boolean => {
    if (t + grid.length > source.indices.length || !grid.every((n, j) => source.indices[t + j] === base + n)) return false;
    const u0 = source.uvs[base * 2]!, v0 = source.uvs[base * 2 + 1]!, du = source.uvs[(base + 2) * 2]! - u0, dv = source.uvs[(base + 6) * 2 + 1]! - v0;
    if (Math.abs(du) < 1e-8 || Math.abs(dv) < 1e-8) return false;
    for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) {
      const i = base + row * 3 + col;
      if (Math.abs(source.uvs[i * 2]! - u0 - du * col / 2) > 1e-7 || Math.abs(source.uvs[i * 2 + 1]! - v0 - dv * row / 2) > 1e-7) return false;
    }
    return true;
  };
  for (let t = 0; t < source.indices.length;) {
    const base = source.indices[t]!;
    if (isGrid(t, base)) {
      out.idx.push(vertex(base), vertex(base + 2), vertex(base + 8), vertex(base), vertex(base + 8), vertex(base + 6)); t += 24;
    } else { out.idx.push(vertex(base), vertex(source.indices[t + 1]!), vertex(source.indices[t + 2]!)); t += 3; }
  }
  return out;
}
