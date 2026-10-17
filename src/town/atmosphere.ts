import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture.js';
import { Material } from '@babylonjs/core/Materials/material.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { type Scene } from '@babylonjs/core/scene.js';
import { type TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import type { Town } from './build';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer.js';
import { SURF_KIND } from '../surface';
import { quality } from '../render';
import { distantFoliageGeometry, distantGeometry } from './lod';
import { MeshBatch } from './batch';
import { Frame } from './frame';

/** Thin, softly fading shafts through shopfront glass, drawn from code rather than photographic assets. */
export function lightShafts(scene: Scene, town: Town): void {
  const tex = new DynamicTexture('light-shaft-profile', { width: 64, height: 128 }, scene, true);
  const g = tex.getContext() as CanvasRenderingContext2D;
  const gradient = g.createLinearGradient(0, 0, 64, 0);
  gradient.addColorStop(0, '#ffffff00'); gradient.addColorStop(.3, '#ffffff55'); gradient.addColorStop(.7, '#ffffff55'); gradient.addColorStop(1, '#ffffff00');
  g.fillStyle = gradient; g.fillRect(0, 0, 64, 128); g.globalCompositeOperation = 'destination-in';
  const fade = g.createLinearGradient(0, 0, 0, 128); fade.addColorStop(0, '#ffffff00'); fade.addColorStop(.3, '#ffffffff'); fade.addColorStop(1, '#ffffff00');
  g.fillStyle = fade; g.fillRect(0, 0, 64, 128); tex.update(); tex.hasAlpha = true;
  const material = new StandardMaterial('light-shafts', scene); material.diffuseTexture = tex; material.useAlphaFromDiffuseTexture = true;
  material.disableLighting = true; material.emissiveColor = new Color3(1, .94, .75); material.alpha = .18;
  material.backFaceCulling = false; material.disableDepthWrite = true; material.transparencyMode = Material.MATERIAL_ALPHABLEND;
  const batch = new MeshBatch(true);
  for (const id of ['e-wagashi', 'w-cafe', 'w-conbini']) {
    const s = town.spots[id]; if (!s) continue;
    const f = new Frame(s.x, s.z, s.fx, s.fz);
    for (const u of [-s.hu * .55, s.hu * .45]) {
      batch.quad(f.pt(u - 6, 32, s.hv - 4), f.pt(u + 5, 32, s.hv - 4), f.pt(u - 5, 4, s.hv - 38), f.pt(u - 21, 4, s.hv - 38), [1, 1, 1], undefined, [[0, 0], [1, 0], [1, 1], [0, 1]]);
    }
  }
  const mesh = batch.toMesh('window-light-shafts', scene, material); mesh.parent = town.root; mesh.isPickable = false;
}

/** Original environment map: sky, low-rise silhouettes and cherry crowns reflected in the shop windows. */
export function reflectedTownFaces(size = 128): Uint8Array[] {
  return Array.from({ length: 6 }, (_, face) => {
    const pixels = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const t = y / size, column = Math.floor(x / 15), buildingTop = .56 + .09 * Math.sin(column * 4.17 + face);
      let r = 115 + t * 100, g = 160 + t * 75, b = 209 + t * 35;
      if (t > buildingTop) { r = 154 + column % 3 * 12; g = 164 + column % 2 * 14; b = 155 + column % 4 * 9; }
      const crown = Math.sin(x / 13 + face * 2) * .08 + .59;
      if (t > crown - .08 && t < crown + .05 && column % 4 < 2) { r = 240; g = 193; b = 209; }
      if (face === 2) { r = 115; g = 166; b = 225; }
      if (face === 3 || t > .85) { r = 134; g = 132; b = 125; }
      const i = (y * size + x) * 4; pixels.set([r, g, b, 255], i);
    }
    return pixels;
  });
}

/** Spatial chunks retain the full silhouettes; small foliage/lettering uses cheaper distant geometry. */
export function addDistanceDetail(scene: Scene, root: TransformNode): void {
  let removed = 0, foliageRemoved = 0;
  for (const mesh of [...root.getChildMeshes()]) {
    if (!(mesh instanceof Mesh)) continue;
    if (mesh.name.startsWith('town_') && mesh.getTotalVertices() > 12000) {
      const geometry = distantGeometry({ positions: mesh.getVerticesData(VertexBuffer.PositionKind)!, normals: mesh.getVerticesData(VertexBuffer.NormalKind)!, colors: mesh.getVerticesData(VertexBuffer.ColorKind)!, indices: mesh.getIndices()!, surfaces: mesh.getVerticesData(SURF_KIND) ?? undefined });
      if (geometry.triangleCount < mesh.getTotalIndices() / 3 * .9) {
        const lod = geometry.toMesh(`${mesh.name}-distant`, scene, mesh.material!); lod.parent = root; lod.receiveShadows = true;
        mesh.addLODLevel(2500, lod); removed += mesh.getTotalIndices() / 3 - geometry.triangleCount;
      }
    }
    if (!mesh.name.startsWith('foliage_') || mesh.metadata?.blossomShadow) continue;
    const geometry = distantFoliageGeometry({ positions: mesh.getVerticesData(VertexBuffer.PositionKind)!, normals: mesh.getVerticesData(VertexBuffer.NormalKind)!, colors: mesh.getVerticesData(VertexBuffer.ColorKind)!, indices: mesh.getIndices()!, uvs: mesh.getVerticesData(VertexBuffer.UVKind)!, surfaces: mesh.getVerticesData(SURF_KIND) ?? undefined });
    if (geometry.triangleCount >= mesh.getTotalIndices() / 3) continue;
    const reduced = geometry.toMesh(`${mesh.name}-distant`, scene, mesh.material!);
    reduced.parent = root; reduced.receiveShadows = mesh.receiveShadows; reduced.isPickable = false;
    mesh.addLODLevel(quality(scene.getEngine()) === 'low' ? 850 : 1900, reduced);
    foliageRemoved += mesh.getTotalIndices() / 3 - geometry.triangleCount;
  }
  scene.metadata = { ...scene.metadata, detailLOD: true, distantTrianglesRemoved: removed, distantFoliageTrianglesRemoved: foliageRemoved };
  console.info(`[town] distant building LOD removes ${removed} subpixel triangles when selected`);
  console.info(`[town] distant foliage LOD removes ${foliageRemoved} triangles while retaining complete flower sheets`);
}
