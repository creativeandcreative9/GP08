import type { MeshBatch } from './batch';

/** Smooth only bevel joins. Right-angle seams and the geometry/colours remain intact. */
export function smoothBevels(b: MeshBatch): void {
  const groups = new Map<string, number[]>();
  for (let i = 0; i < b.vertexCount; i++) {
    const key = `${Math.round(b.pos[i * 3]! * 1000)},${Math.round(b.pos[i * 3 + 1]! * 1000)},${Math.round(b.pos[i * 3 + 2]! * 1000)}`;
    const group = groups.get(key); if (group) group.push(i); else groups.set(key, [i]);
  }
  const normals = [...b.nor];
  for (const indices of groups.values()) for (const i of indices) {
    const nx = normals[i * 3]!, ny = normals[i * 3 + 1]!, nz = normals[i * 3 + 2]!;
    let x = 0, y = 0, z = 0;
    for (const j of indices) if (nx * normals[j * 3]! + ny * normals[j * 3 + 1]! + nz * normals[j * 3 + 2]! > .48) { x += normals[j * 3]!; y += normals[j * 3 + 1]!; z += normals[j * 3 + 2]!; }
    const length = Math.hypot(x, y, z) || 1;
    b.nor[i * 3] = x / length; b.nor[i * 3 + 1] = y / length; b.nor[i * 3 + 2] = z / length;
  }
}
