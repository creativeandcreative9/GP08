import { MeshBatch } from './batch';
import { makeRng, hex } from './util';

/** A scatter of low-poly cumulus clouds high above the town (one batch → one draw call). */
export function buildClouds(): MeshBatch {
  const b = new MeshBatch();
  const rnd = makeRng(4242);
  const white = hex(0xffffff);
  for (let i = 0; i < 22; i++) {
    const a = rnd() * Math.PI * 2;
    const r = 2500 + Math.pow(rnd(), 0.7) * 16000;
    const cx = 400 + Math.cos(a) * r;
    const cz = 100 + Math.sin(a) * r;
    const cy = 2300 + rnd() * 2600;
    const size = 500 + rnd() * 800;
    const n = 4 + Math.floor(rnd() * 3);
    for (let k = 0; k < n; k++) {
      const t = k / (n - 1) - 0.5;
      const rad = size * (0.3 + 0.22 * (1 - Math.abs(t) * 1.6) + rnd() * 0.08);
      b.blob(cx + t * size * 1.7, cy + (1 - Math.abs(t) * 2) * size * 0.12, cz + (rnd() - 0.5) * size * 0.4, rad * 1.15, rad * 0.55, rad * 0.9, white, 0.03, i * 10 + k);
    }
  }
  return b;
}
