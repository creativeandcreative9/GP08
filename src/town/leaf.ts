import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture.js';
import { Material } from '@babylonjs/core/Materials/material.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { Texture } from '@babylonjs/core/Materials/Textures/texture.js';
import { type Scene } from '@babylonjs/core/scene.js';
import { paintLeafAtlas } from './leafatlas';
import { cellUv, type CellName } from './leafcells';
import type { MeshBatch } from './batch';
import type { BlossomClouds } from './blossoms';
import type { RGB, V3 } from './util';

export function foliageMaterial(scene: Scene): StandardMaterial {
  const pixels = paintLeafAtlas();
  const texture = new DynamicTexture('foliage-atlas', { width: pixels.width, height: pixels.height }, scene, true, Texture.TRILINEAR_SAMPLINGMODE);
  const g = texture.getContext() as CanvasRenderingContext2D;
  g.putImageData(new ImageData(new Uint8ClampedArray(pixels.data), pixels.width, pixels.height), 0, 0); texture.update(false);
  texture.hasAlpha = true; texture.wrapU = texture.wrapV = Texture.CLAMP_ADDRESSMODE; texture.anisotropicFilteringLevel = 4;
  const material = new StandardMaterial('foliageMat', scene);
  material.diffuseTexture = texture; material.useAlphaFromDiffuseTexture = true;
  material.transparencyMode = Material.MATERIAL_ALPHATEST; material.alphaCutOff = .38;
  material.backFaceCulling = false; material.twoSidedLighting = false; material.specularColor = Color3.Black();
  // Thin petals transmit skylight; deep black backs make the crown read as separate hanging blocks.
  material.emissiveColor.set(.23, .18, .20);
  return material;
}

/** Crossed, gently tilted cards give a textured crown from every walking direction. */
export function foliageCluster(b: MeshBatch, x: number, y: number, z: number, radius: number, flat: number, cell: CellName, angle: number, blossoms?: BlossomClouds): void {
  const uv = cellUv(cell), uvs = [[uv.u0, uv.vb], [uv.u1, uv.vb], [uv.u1, uv.vt], [uv.u0, uv.vt]] as const;
  if (cell.startsWith('bloom')) {
    const first = b.vertexCount;
    blossomCrown(b, x, y, z, radius, flat, angle, uvs);
    blossoms?.record(b, first, x, y, z, radius, flat, cell);
    return;
  }
  const colors: readonly [RGB, RGB, RGB, RGB] = [[.72, .69, .72], [.77, .73, .77], [1, 1, 1], [.98, .98, .98]];
  for (let i = 0; i < 3; i++) {
    const a = angle + i * Math.PI / 3, dx = Math.cos(a) * radius * 1.16, dz = Math.sin(a) * radius * 1.16;
    const h = radius * flat * 1.18;
    const p: [V3, V3, V3, V3] = [[x - dx, y - h, z - dz], [x + dx, y - h, z + dz], [x + dx, y + h, z + dz], [x - dx, y + h, z - dz]];
    const normals: [V3, V3, V3, V3] = [[-Math.cos(a) * .5, -.25, -Math.sin(a) * .5], [Math.cos(a) * .5, -.25, Math.sin(a) * .5], [Math.cos(a) * .4, .9, Math.sin(a) * .4], [-Math.cos(a) * .4, .9, -Math.sin(a) * .4]];
    b.card(p, colors, normals, uvs);
  }
  // A sloping top card prevents the canopy opening up when viewed from above.
  b.card([[x - radius, y, z - radius], [x + radius, y, z - radius], [x + radius, y + radius * flat * .5, z + radius], [x - radius, y + radius * flat * .5, z + radius]], [1, 1, 1], [0, 1, 0], uvs);
}

/** Bowed petals with spherical lighting overlap into a broad canopy instead of intersecting flat flags. */
function blossomCrown(b: MeshBatch, x: number, y: number, z: number, r: number, flat: number, angle: number, uv: readonly (readonly [number, number])[]): void {
  const width = r * (flat > 1.2 ? .85 : 1.48), height = r * Math.min(flat, .8);
  for (let plane = 0; plane < 3; plane++) {
    const a = angle + plane * Math.PI / 3, dx = Math.cos(a), dz = Math.sin(a);
    const at = (u: number, v: number): V3 => {
      const bow = (1 - u * u) * (1 - v * v) * r * .35;
      return [x + dx * u * width - dz * bow, y + v * height, z + dz * u * width + dx * bow];
    };
    const normal = (u: number, v: number): V3 => {
      const nx = dx * u * .65 - dz * .48, ny = .65 + v * .35, nz = dz * u * .65 + dx * .48;
      const length = Math.hypot(nx, ny, nz);
      return [nx / length, ny / length, nz / length];
    };
    const tint = (v: number): RGB => [ .88 + .06 * (v + 1), .83 + .085 * (v + 1), .87 + .065 * (v + 1) ];
    const tex = (u: number, v: number): readonly [number, number] => [uv[0]![0]! + (uv[1]![0]! - uv[0]![0]!) * (u + 1) / 2, uv[0]![1]! + (uv[3]![1]! - uv[0]![1]!) * (v + 1) / 2];
    // A shared 3x3 grid has exactly the same four quads as separate cards, with 9 rather than 16 vertices.
    const first = b.vertexCount;
    for (let row = 0; row <= 2; row++) for (let col = 0; col <= 2; col++) {
      const u = col - 1, v = row - 1, p = at(u, v), n = normal(u, v), color = tint(v), t = tex(u, v);
      b.pos.push(...p); b.nor.push(...n); b.col.push(...color, 1);
      if (b.withUV) b.uvs.push(...t);
    }
    b.appendSurface(9);
    for (let row = 0; row < 2; row++) for (let col = 0; col < 2; col++) {
      const i = first + row * 3 + col;
      b.idx.push(i, i + 1, i + 4, i, i + 4, i + 3);
    }
  }
  b.card([[x - width, y, z - width], [x + width, y, z - width], [x + width, y + height * .45, z + width], [x - width, y + height * .45, z + width]], [1, 1, 1], [0, 1, 0], uv);
}
