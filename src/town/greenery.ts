import type { Ctx } from './ctx';
import { cellUv, type CellName } from './leafcells';
import { foliageCluster } from './leaf';
import { heightAt } from './heights';
import { roadsW, roadClearance } from './site';
import { makeRng } from './util';

export function plantCards(c: Ctx, x: number, y: number, z: number, size: number, name: CellName, angle = 0): void {
  if (!c.foliage) return;
  const b = c.foliage.at(x, z), uv = cellUv(name);
  const uvs = [[uv.u0, uv.vb], [uv.u1, uv.vb], [uv.u1, uv.vt], [uv.u0, uv.vt]] as const;
  for (let i = 0; i < 2; i++) {
    const a = angle + i * Math.PI / 2, dx = Math.cos(a) * size / 2, dz = Math.sin(a) * size / 2;
    b.card([[x - dx, y, z - dz], [x + dx, y, z + dz], [x + dx, y + size, z + dz], [x - dx, y + size, z - dz]], [1, 1, 1], [0, .8, 0], uvs);
  }
}

/** Position-seeded roadside growth; never advances the shared town layout generator. */
export function buildGreenery(c: Ctx): void {
  const rng = makeRng(19271);
  for (const road of roadsW) for (let i = 0; i + 1 < road.pts.length; i++) {
    const a = road.pts[i]!, b = road.pts[i + 1]!, length = Math.hypot(b.x - a.x, b.z - a.z);
    const dx = (b.x - a.x) / length, dz = (b.z - a.z) / length;
    for (let t = 20; t < length; t += 35 + rng() * 35) for (const side of [-1, 1]) {
      const offset = road.width / 2 + 15 + rng() * 6, x = a.x + dx * t - dz * offset * side, z = a.z + dz * t + dx * offset * side;
      if (roadClearance(x, z).d < 11 || c.obstacles.some(o => x > o.minX - 5 && x < o.maxX + 5 && z > o.minZ - 5 && z < o.maxZ + 5)) continue;
      plantCards(c, x, heightAt(x, z) + .6, z, 1.4 + rng() * 2.2, rng() < .14 ? 'dandelion' : rng() < .5 ? 'tuftA' : 'clover', rng() * Math.PI);
    }
  }
  for (const x of [-60, 60]) for (let z = -430; z < 490; z += 43) {
    foliageCluster(c.foliage!.at(x, z), x, heightAt(x, z) + 3.8, z, 5, .8, 'hedgeC', rng() * Math.PI);
    plantCards(c, x, heightAt(x, z), z + 12, 5, 'bedPansy', rng() * Math.PI);
  }
}
