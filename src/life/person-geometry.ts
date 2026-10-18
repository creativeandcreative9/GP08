import type { MeshBatch } from '../town/batch';
import type { RGB, V3 } from '../town/util';
import { ellipsoid, fan, mixRGB, shadeRGB } from './geom';

/** Clothing profiles are shared by the instanced residents and the articulated public avatar. */
export interface GarmentRing {
  y: number;
  a: number;
  c: number;
  cx?: number;
  cz?: number;
}

/** Indexed rounded sections: continuous normals, closed edges, and no extra meshes per seam. */
export function softLoft(b: MeshBatch, rings: readonly GarmentRing[], color: RGB,
  options: { segments?: number; roundness?: number; caps?: boolean } = {}): void {
  if (rings.length < 2) return;
  const segments = options.segments ?? 12, power = 2 / (options.roundness ?? 2.5);
  const signed = (n: number): number => Math.sign(n) * Math.abs(n) ** power;
  const point = (ring: GarmentRing, angle: number): V3 => [
    (ring.cx ?? 0) + ring.a * signed(Math.sin(angle)), ring.y,
    (ring.cz ?? 0) + ring.c * signed(Math.cos(angle)),
  ];
  const first = b.vertexCount;
  for (let row = 0; row < rings.length; row++) {
    const ring = rings[row]!, before = rings[Math.max(0, row - 1)]!, after = rings[Math.min(rings.length - 1, row + 1)]!;
    for (let col = 0; col < segments; col++) {
      const angle = col / segments * Math.PI * 2, p = point(ring, angle);
      const l = point(ring, angle - .001), r = point(ring, angle + .001);
      const lo = point(before, angle), hi = point(after, angle), dy = after.y - before.y;
      const nx = -(r[2] - l[2]), nz = r[0] - l[0];
      const ny = Math.abs(dy) < 1e-6 ? 0 : -(nx * (hi[0] - lo[0]) + nz * (hi[2] - lo[2])) / dy;
      const length = Math.hypot(nx, ny, nz) || 1;
      b.pos.push(...p); b.nor.push(nx / length, ny / length, nz / length); b.col.push(...color, 1);
      if (b.withUV) b.uvs.push(col / segments, row / (rings.length - 1));
    }
  }
  b.appendSurface(rings.length * segments);
  const ascending = rings[1]!.y > rings[0]!.y;
  for (let row = 0; row < rings.length - 1; row++) for (let col = 0; col < segments; col++) {
    const a = first + row * segments + col, n = first + row * segments + (col + 1) % segments;
    if (ascending) b.idx.push(a, n + segments, n, a, a + segments, n + segments);
    else b.idx.push(a, n, n + segments, a, n + segments, a + segments);
  }
  if (options.caps !== false) {
    for (const index of [0, rings.length - 1]) {
      const ring = rings[index]!;
      fan(b, Array.from({ length: segments }, (_, col) => point(ring, col / segments * Math.PI * 2)), color,
        [0, (index === 0 ? -1 : 1) * (ascending ? 1 : -1), 0]);
    }
  }
}

/** Footwear has a rounded toe, raised instep, separate sole and subtle vamp seam. Front is +Z. */
export function personShoe(b: MeshBatch, x: number, floor: number, z: number, radius: number, height: number, color: RGB): void {
  const a = radius * .8;
  softLoft(b, [
    { y: floor, a: a * .88, c: 1.92, cx: x, cz: z + .78 },
    { y: floor + .16, a, c: 2.02, cx: x, cz: z + .78 },
    { y: floor + .29, a: a * .99, c: 2.00, cx: x, cz: z + .78 },
  ], mixRGB(color, [.12, .12, .13], .55), { roundness: 2.5 });
  softLoft(b, [
    { y: floor + .24, a: a * .98, c: 1.97, cx: x, cz: z + .78 },
    { y: floor + height * .59, a: a * .92, c: 1.79, cx: x, cz: z + .68 },
    { y: floor + height * .91, a: a * .76, c: 1.15, cx: x, cz: z + .22 },
    { y: floor + height, a: a * .69, c: .73, cx: x, cz: z - .08 },
  ], color, { roundness: 2.4 });
  // An inset at the ankle and a slim stitched band across the vamp survive at normal play distance.
  softLoft(b, [
    { y: floor + height - .11, a: a * .705, c: .75, cx: x, cz: z - .08 },
    { y: floor + height + .025, a: a * .70, c: .74, cx: x, cz: z - .08 },
  ], shadeRGB(color, .78), { segments: 10, caps: false });
  const y = floor + height * .73;
  b.quad([x - a * .65, y - .025, z + 1.05], [x + a * .65, y - .025, z + 1.05],
    [x + a * .62, y + .04, z + 1.0], [x - a * .62, y + .04, z + 1.0], shadeRGB(color, 1.16), [0, 1, 1]);
}

/** A relaxed palm and tucked thumb replace the old squared-off end of the forearm. */
export function personHand(b: MeshBatch, x: number, y: number, z: number, radius: number, color: RGB): void {
  ellipsoid(b, x, y, z + radius * .12, radius * .62, .69, radius * .52, color,
    { seg: 10, rings: 6, smooth: true, phase: 0 });
  ellipsoid(b, x + radius * .48, y + .22, z + radius * .35, radius * .23, .36, radius * .25, shadeRGB(color, .97),
    { seg: 6, rings: 4, smooth: true });
}

/** The same soft limb sections can follow the bent pose of a seated resident. */
export function seatedLimb(b: MeshBatch, from: V3, to: V3, startRadius: number, endRadius: number, color: RGB): void {
  const dx = to[0] - from[0], dy = to[1] - from[1], dz = to[2] - from[2], length = Math.hypot(dx, dy, dz);
  if (length < .001) return;
  const axis: V3 = [dx / length, dy / length, dz / length];
  const ux = Math.abs(axis[0]) < .9 ? 1 : 0, uy = ux ? 0 : 1;
  const projection = ux * axis[0] + uy * axis[1];
  const u0: V3 = [ux - projection * axis[0], uy - projection * axis[1], -projection * axis[2]], ul = Math.hypot(...u0);
  const u: V3 = [u0[0] / ul, u0[1] / ul, u0[2] / ul];
  const v: V3 = [u[1] * axis[2] - u[2] * axis[1], u[2] * axis[0] - u[0] * axis[2], u[0] * axis[1] - u[1] * axis[0]];
  const first = b.vertexCount;
  softLoft(b, [{ y: 0, a: startRadius, c: startRadius },
    { y: length * .45, a: (startRadius + endRadius) * .53, c: (startRadius + endRadius) * .53 },
    { y: length, a: endRadius, c: endRadius }], color, { segments: 10, roundness: 2.3 });
  for (let i = first; i < b.vertexCount; i++) {
    const p = b.pos.slice(i * 3, i * 3 + 3), n = b.nor.slice(i * 3, i * 3 + 3);
    for (let j = 0; j < 3; j++) {
      b.pos[i * 3 + j] = from[j]! + u[j]! * p[0]! + axis[j]! * p[1]! + v[j]! * p[2]!;
      b.nor[i * 3 + j] = u[j]! * n[0]! + axis[j]! * n[1]! + v[j]! * n[2]!;
    }
  }
}
