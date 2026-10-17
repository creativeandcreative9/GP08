import { SURF } from '../surface';
import type { MeshBatch } from './batch';
import type { RGB } from './util';

/** Closed, smooth foliage for a few clipped shrubs close to the player (62 vertices, 120 triangles). */
export function roundedFoliage(b: MeshBatch, x: number, y: number, z: number, rx: number, ry: number, rz: number, color: RGB): void {
  const first = b.vertexCount, segments = 12, rings = 6;
  const surface = b.surface, axis = b.axis; b.surface = SURF.roundedFoliage; b.axis = 0;
  const vertex = (nx: number, ny: number, nz: number): void => {
    b.pos.push(x + nx * rx, y + ny * ry, z + nz * rz);
    const a = nx / rx, c = ny / ry, d = nz / rz, length = Math.hypot(a, c, d);
    b.nor.push(a / length, c / length, d / length);
    const light = .925 + .075 * ny;
    b.col.push(color[0] * light, color[1] * light, color[2] * light, 1);
    if (b.withUV) b.uvs.push(0, 0);
  };
  vertex(0, 1, 0);
  for (let j = 1; j < rings; j++) for (let i = 0; i < segments; i++) {
    const theta = j * Math.PI / rings, phi = i * Math.PI * 2 / segments;
    vertex(Math.sin(theta) * Math.sin(phi), Math.cos(theta), Math.sin(theta) * Math.cos(phi));
  }
  vertex(0, -1, 0);
  const at = (j: number, i: number): number => first + 1 + (j - 1) * segments + (i % segments);
  for (let i = 0; i < segments; i++) b.idx.push(first, at(1, i + 1), at(1, i));
  for (let j = 1; j < rings - 1; j++) for (let i = 0; i < segments; i++) {
    b.idx.push(at(j, i), at(j, i + 1), at(j + 1, i + 1), at(j, i), at(j + 1, i + 1), at(j + 1, i));
  }
  const bottom = b.vertexCount - 1;
  for (let i = 0; i < segments; i++) b.idx.push(at(rings - 1, i), at(rings - 1, i + 1), bottom);
  b.appendSurface(b.vertexCount - first); b.surface = surface; b.axis = axis;
}
