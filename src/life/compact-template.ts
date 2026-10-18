import type { MeshBatch } from '../town/batch';

/** Share only GPU-identical vertices after normal smoothing; keep every triangle and hard seam. */
export function compactLifeTemplate(batch: MeshBatch): void {
  const count = batch.vertexCount;
  const attributes = [
    { key: 'pos' as const, size: 3 }, { key: 'nor' as const, size: 3 },
    { key: 'col' as const, size: 4 }, { key: 'surf' as const, size: 1 },
    ...(batch.withUV ? [{ key: 'uvs' as const, size: 2 }] : []),
  ].map(attribute => {
    if (batch[attribute.key].length !== count * attribute.size) throw new Error(`Life template: unaligned ${attribute.key}`);
    const floats = new Float32Array(batch[attribute.key]);
    return { ...attribute, bits: new Uint32Array(floats.buffer) };
  });
  const remap = new Uint32Array(count), previous = new Int32Array(count);
  const retained: number[] = [], heads = new Map<number, number>();
  const same = (left: number, right: number): boolean => {
    for (const attribute of attributes) for (let k = 0; k < attribute.size; k++) {
      if (attribute.bits[left * attribute.size + k] !== attribute.bits[right * attribute.size + k]) return false;
    }
    return true;
  };
  for (let i = 0; i < count; i++) {
    let hash = 2166136261;
    for (const attribute of attributes) for (let k = 0; k < attribute.size; k++) {
      hash = Math.imul(hash ^ attribute.bits[i * attribute.size + k]!, 16777619);
    }
    const head = heads.get(hash) ?? -1;
    let found = head;
    while (found >= 0 && !same(i, retained[found]!)) found = previous[found]!;
    if (found >= 0) remap[i] = found;
    else {
      remap[i] = retained.length;
      previous[retained.length] = head;
      heads.set(hash, retained.length);
      retained.push(i);
    }
  }
  if (retained.length === count) return;
  for (const attribute of attributes) {
    const source = batch[attribute.key], values: number[] = [];
    for (const old of retained) for (let k = 0; k < attribute.size; k++) values.push(source[old * attribute.size + k]!);
    batch[attribute.key] = values;
  }
  batch.idx = batch.idx.map(index => remap[index]!);
}
