/** Convex pavement pieces retain their texture coordinates when clipped around a building or another road. */
export interface PavingVertex { x: number; z: number; u: number; v: number }
export interface ClipPoint { x: number; z: number }
const area = (p: readonly ClipPoint[]): number => p.reduce((sum, a, i) => { const b = p[(i + 1) % p.length]!; return sum + a.x * b.z - b.x * a.z; }, 0) / 2;

function halfPlane(poly: readonly PavingVertex[], a: ClipPoint, b: ClipPoint, orientation: number, inside: boolean): PavingVertex[] {
  if (!poly.length) return [];
  const side = orientation * (inside ? 1 : -1);
  const distance = (p: ClipPoint): number => side * ((b.x - a.x) * (p.z - a.z) - (b.z - a.z) * (p.x - a.x));
  const out: PavingVertex[] = [];
  let previous = poly[poly.length - 1]!, dp = distance(previous);
  for (const current of poly) {
    const dc = distance(current);
    if ((dp >= 0) !== (dc >= 0)) {
      const t = dp / (dp - dc);
      out.push({ x: previous.x + (current.x - previous.x) * t, z: previous.z + (current.z - previous.z) * t, u: previous.u + (current.u - previous.u) * t, v: previous.v + (current.v - previous.v) * t });
    }
    if (dc >= 0) out.push(current);
    previous = current; dp = dc;
  }
  const clean = out.filter((p, i) => i === 0 || Math.hypot(p.x - out[i - 1]!.x, p.z - out[i - 1]!.z) > 1e-7);
  if (clean.length > 1 && Math.hypot(clean[0]!.x - clean[clean.length - 1]!.x, clean[0]!.z - clean[clean.length - 1]!.z) < 1e-7) clean.pop();
  return clean;
}

/** Subtract a convex obstacle, partitioning the result into disjoint convex pieces. Accepts either winding. */
export function clipPaving(poly: readonly PavingVertex[], mask: readonly ClipPoint[]): PavingVertex[][] {
  if (poly.length < 3 || Math.abs(area(poly)) < 1e-7) return [];
  const maskArea = area(mask);
  if (mask.length < 3 || Math.abs(maskArea) < 1e-7) return [[...poly]];
  const px = poly.map(p => p.x), pz = poly.map(p => p.z), mx = mask.map(p => p.x), mz = mask.map(p => p.z);
  if (Math.max(...px) <= Math.min(...mx) || Math.min(...px) >= Math.max(...mx) || Math.max(...pz) <= Math.min(...mz) || Math.min(...pz) >= Math.max(...mz)) return [[...poly]];
  const orientation = maskArea > 0 ? 1 : -1, out: PavingVertex[][] = [];
  let remainder = [...poly];
  for (let i = 0; i < mask.length && remainder.length >= 3; i++) {
    const a = mask[i]!, b = mask[(i + 1) % mask.length]!;
    const outside = halfPlane(remainder, a, b, orientation, false);
    if (outside.length >= 3 && Math.abs(area(outside)) > 1e-7) out.push(outside);
    remainder = halfPlane(remainder, a, b, orientation, true);
  }
  return out;
}
