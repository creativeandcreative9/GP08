import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { type Scene } from '@babylonjs/core/scene.js';
import { MeshBatch } from '../town/batch';
import type { Town } from '../town/build';
import { roadClearance, roadsW } from '../town/site';
import { makeRng, type V3 } from '../town/util';

/** Shallow rainwater at the road margins; one batched draw, no collision or layout changes. */
export function createPuddles(scene: Scene, town: Town) {
  const texture = new DynamicTexture('puddle-profile', { width: 128, height: 128 }, scene, true);
  const g = texture.getContext() as CanvasRenderingContext2D, pixels = g.createImageData(128, 128);
  for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
    const dx = (x - 64) / 60, dy = (y - 64) / 60, angle = Math.atan2(dy, dx);
    const radius = Math.hypot(dx, dy) / (1 + .06 * Math.sin(angle * 5) + .04 * Math.cos(angle * 9));
    const alpha = Math.max(0, Math.min(1, (1 - radius) * 9));
    const ripple = Math.pow(Math.max(0, Math.cos(Math.hypot(dx + .23, dy - .17) * 35)), 18) * .12;
    const i = (y * 128 + x) * 4;
    pixels.data.set([145 + ripple * 150, 163 + ripple * 150, 177 + ripple * 150, alpha * 180], i);
  }
  g.putImageData(pixels, 0, 0); texture.update(); texture.hasAlpha = true;
  const material = new StandardMaterial('wet-road-material', scene);
  material.diffuseTexture = texture; material.useAlphaFromDiffuseTexture = true;
  material.diffuseColor.set(.52, .62, .7); material.specularColor.set(.8, .87, .94); material.specularPower = 100;
  material.emissiveColor.set(.015, .02, .025); material.backFaceCulling = false;
  material.reflectionTexture = (scene.getMaterialByName('glassMat') as StandardMaterial | null)?.reflectionTexture ?? null;
  const rng = makeRng(6792), batch = new MeshBatch(true);
  for (const road of roadsW) for (let i = 0; i + 1 < road.pts.length; i++) {
    const a = road.pts[i]!, b = road.pts[i + 1]!, length = Math.hypot(b.x - a.x, b.z - a.z);
    const tx = (b.x - a.x) / length, tz = (b.z - a.z) / length;
    for (let t = 80; t < length - 30; t += 145 + rng() * 110) {
      const offset = (rng() < .5 ? -1 : 1) * (road.width / 2 - 5);
      const x = a.x + tx * t - tz * offset, z = a.z + tz * t + tx * offset;
      if (roadClearance(x, z, road.id).d < 18) continue;
      const long = 5 + rng() * 10, wide = 1.5 + rng() * 2.5, h = town.heightAt(x, z) + .66;
      const p = (u: number, v: number): V3 => [x + tx * u - tz * v, h, z + tz * u + tx * v];
      batch.quad(p(-long, -wide), p(long, -wide), p(long, wide), p(-long, wide), [1, 1, 1], [0, 1, 0], [[0, 0], [1, 0], [1, 1], [0, 1]]);
    }
  }
  const mesh = batch.toMesh('wet-road', scene, material); mesh.parent = town.root; mesh.isPickable = false; mesh.setEnabled(false);
  return mesh;
}
