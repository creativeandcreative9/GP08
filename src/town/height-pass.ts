import type { MeshBatch } from './batch';
import type { Ctx } from './ctx';

/** Brings the featured doors to roughly two metres, without scaling people or usable seats. */
export const SHOP_HEIGHT_SCALE = .82;

/** Resizes only geometry appended since the preceding pass; existing floors stay at their authored level. */
export class HeightPass {
  private readonly offsets = new Map<MeshBatch, number>();
  constructor(private readonly c: Ctx) { this.remember(); }

  private batches(): MeshBatch[] {
    return [...this.c.main.all(), ...this.c.signs.all(), ...this.c.glass.all(), ...(this.c.foliage?.all() ?? []), ...(this.c.topiary?.all() ?? []), ...(this.c.cloth?.batches.all() ?? [])].map(([, b]) => b);
  }

  private remember(): void { for (const b of this.batches()) this.offsets.set(b, b.vertexCount); }

  /** Compress the band up to ceiling; translate higher storeys without changing their height. */
  applyAbove(floor: number, scale: number, ceiling = Infinity): void {
    for (const b of this.batches()) {
      for (let i = this.offsets.get(b) ?? 0; i < b.vertexCount; i++) {
        const p = i * 3;
        const height = b.pos[p + 1]!;
        if (height > floor) b.pos[p + 1] = height + (scale - 1) * Math.min(height - floor, ceiling - floor);
        const x = b.nor[p]!, y = b.nor[p + 1]! / (height >= floor && height <= ceiling ? scale : 1), z = b.nor[p + 2]!, length = Math.hypot(x, y, z) || 1;
        b.nor[p] = x / length; b.nor[p + 1] = y / length; b.nor[p + 2] = z / length;
      }
    }
    this.remember();
  }
}
