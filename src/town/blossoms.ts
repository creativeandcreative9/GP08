import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { BoundingInfo } from '@babylonjs/core/Culling/boundingInfo.js';
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { MaterialPluginBase } from '@babylonjs/core/Materials/materialPluginBase.js';
import { ShaderLanguage } from '@babylonjs/core/Materials/shaderLanguage.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js';
import '@babylonjs/core/Meshes/thinInstanceMesh.js';
import type { UniformBuffer } from '@babylonjs/core/Materials/uniformBuffer.js';
import type { Scene } from '@babylonjs/core/scene.js';
import { ChunkedBatch, MeshBatch } from './batch';
import { cellUv, type CellName } from './leafcells';

interface Crown { first: number; count: number; x: number; y: number; z: number; width: number; height: number; cell: CellName }

/** The main camera excludes this layer. Explicit shadow render lists still draw it. */
export const BLOSSOM_SHADOW_LAYER = 0x10000000;

/** Original petal silhouettes follow the camera; continuous sphere normals avoid crossed-card creases. */
class BlossomLighting extends MaterialPluginBase {
  constructor(material: StandardMaterial) { super(material, 'GP08BlossomLighting', 220, {}, true, true); }
  override getClassName(): string { return 'GP08BlossomLighting'; }
  override isCompatible(language: ShaderLanguage): boolean { return language === ShaderLanguage.GLSL; }
  override getUniforms(): { ubo: { name: string; size: number; type: string }[]; vertex: string; fragment: string } {
    const names = ['gpBlossomRight', 'gpBlossomUp', 'gpBlossomForward'];
    const declarations = names.map(name => `uniform vec3 ${name};`).join('\n');
    return { ubo: names.map(name => ({ name, size: 3, type: 'vec3' })), vertex: declarations, fragment: declarations };
  }
  override bindForSubMesh(buffer: UniformBuffer): void {
    const camera = this._material.getScene().activeCamera;
    if (!camera) return;
    const m = camera.getWorldMatrix().m;
    buffer.updateFloat3('gpBlossomRight', m[0]!, m[1]!, m[2]!);
    buffer.updateFloat3('gpBlossomUp', m[4]!, m[5]!, m[6]!);
    buffer.updateFloat3('gpBlossomForward', m[8]!, m[9]!, m[10]!);
  }
  override getCustomCode(type: string): { [point: string]: string } | null {
    if (type === 'vertex') return {
      CUSTOM_VERTEX_DEFINITIONS: 'varying vec2 vGpBlossom;',
      CUSTOM_VERTEX_UPDATE_WORLDPOS: `
vGpBlossom = positionUpdated.xy / vec2(1.5, 2.0);
float gpBlossomWidth = length(finalWorld[0].xyz);
float gpBlossomHeight = length(finalWorld[1].xyz);
// Project a broad ellipsoid: a crown seen from above fills out instead of keeping its street-side aspect.
float gpBlossomProjectedHeight = sqrt(gpBlossomWidth * gpBlossomWidth * dot(gpBlossomUp.xz, gpBlossomUp.xz)
  + gpBlossomHeight * gpBlossomHeight * gpBlossomUp.y * gpBlossomUp.y);
worldPos.xyz = finalWorld[3].xyz
  + gpBlossomRight * vGpBlossom.x * gpBlossomWidth
  + gpBlossomUp * vGpBlossom.y * gpBlossomProjectedHeight
  - gpBlossomForward * gpBlossomWidth * .35;`,
    };
    if (type === 'fragment') return {
      CUSTOM_FRAGMENT_DEFINITIONS: 'varying vec2 vGpBlossom;',
      CUSTOM_FRAGMENT_BEFORE_LIGHTS: `
float gpBlossomDepth = sqrt(max(0.0, 1.0 - dot(vGpBlossom, vGpBlossom)));
normalW = normalize(gpBlossomRight * vGpBlossom.x + gpBlossomUp * vGpBlossom.y - gpBlossomForward * gpBlossomDepth);`,
    };
    return null;
  }
}

/** Records emitted crowns without another random draw or a change to tree placement. */
export class BlossomClouds {
  private readonly crowns = new Map<MeshBatch, Crown[]>();

  record(batch: MeshBatch, first: number, x: number, y: number, z: number, radius: number, flat: number, cell: CellName): void {
    const width = radius * (flat > 1.2 ? .85 : 1.48), height = radius * Math.min(flat, .8);
    if (radius < 11.5 || height / width >= .65) return;
    let crowns = this.crowns.get(batch);
    if (!crowns) { crowns = []; this.crowns.set(batch, crowns); }
    crowns.push({ first, count: batch.vertexCount - first, x, y, z, width, height, cell });
  }

  build(scene: Scene, batches: ChunkedBatch, material: StandardMaterial, shadows: boolean): Mesh[] {
    const meshes: Mesh[] = [], groups = new Map<CellName, Crown[]>();
    let originalTriangles = 0, crownCount = 0;
    for (const [key, batch] of batches.all()) {
      if (batch.empty) continue;
      const crowns = this.crowns.get(batch);
      if (!crowns?.length) { meshes.push(batch.toMesh(`foliage_${key}`, scene, material)); continue; }
      const flowerVertices = new Uint8Array(batch.vertexCount);
      for (const crown of crowns) {
        flowerVertices.fill(1, crown.first, crown.first + crown.count);
        let group = groups.get(crown.cell);
        if (!group) { group = []; groups.set(crown.cell, group); }
        group.push(crown); crownCount++;
      }
      // Preserve the original canopy's stationary, alpha-tested shadows, with the same chunk count.
      // On low quality this geometry is never uploaded to the GPU.
      if (shadows) {
        const proxy = batch.toMesh(`foliage_${key}`, scene, material);
        proxy.layerMask = BLOSSOM_SHADOW_LAYER; proxy.metadata = { blossomShadow: true };
        meshes.push(proxy);
      }
      const visible = new MeshBatch(true), remap = new Int32Array(batch.vertexCount).fill(-1);
      const retained: number[] = [], used = new Uint8Array(batch.vertexCount);
      for (let i = 0; i < batch.idx.length; i += 3) {
        const triangle = batch.idx.slice(i, i + 3);
        if (triangle.every(index => flowerVertices[index])) { originalTriangles++; continue; }
        for (const index of triangle) { retained.push(index); used[index] = 1; }
      }
      // Keep each remaining flower's row-major grid: distantFoliageGeometry recognizes that topology.
      for (let index = 0; index < batch.vertexCount; index++) {
        if (!used[index]) continue;
        remap[index] = visible.vertexCount;
        visible.pos.push(...batch.pos.slice(index * 3, index * 3 + 3));
        visible.nor.push(...batch.nor.slice(index * 3, index * 3 + 3));
        visible.col.push(...batch.col.slice(index * 4, index * 4 + 4));
        visible.uvs.push(...batch.uvs.slice(index * 2, index * 2 + 2));
        visible.surface = batch.surf[index] ?? 0; visible.appendSurface(1);
      }
      for (const index of retained) visible.idx.push(remap[index]!);
      if (!visible.empty) {
        const mesh = visible.toMesh(shadows ? `foliage_visible_${key}` : `foliage_${key}`, scene, material);
        mesh.metadata = { blossomVisible: shadows }; meshes.push(mesh);
      }
    }
    for (const [cell, crowns] of groups) meshes.push(this.cloudMesh(scene, material, cell, crowns));
    scene.metadata = { ...scene.metadata, blossomClouds: { crowns: crownCount, groups: groups.size, originalTriangles, visibleTriangles: crownCount * 2, shadowGeometry: shadows } };
    this.crowns.clear();
    return meshes;
  }

  private cloudMesh(scene: Scene, source: StandardMaterial, cell: CellName, crowns: readonly Crown[]): Mesh {
    const material = new StandardMaterial(`blossomMat-${cell}`, scene);
    material.diffuseTexture = source.diffuseTexture; material.useAlphaFromDiffuseTexture = true;
    material.transparencyMode = source.transparencyMode; material.alphaCutOff = source.alphaCutOff;
    material.emissiveColor.copyFrom(source.emissiveColor); material.specularColor = Color3.Black();
    material.backFaceCulling = false; new BlossomLighting(material);
    const mesh = new Mesh(`blossom-cloud-${cell}`, scene), data = new VertexData(), uv = cellUv(cell);
    // Conservative CPU bounds enclose the GPU-oriented card, including its forward offset.
    data.positions = [-1.5, -2, -1.5, 1.5, -2, 1.5, 1.5, 2, -1.5, -1.5, 2, 1.5];
    data.normals = [0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1];
    data.uvs = [uv.u0, uv.vb, uv.u1, uv.vb, uv.u1, uv.vt, uv.u0, uv.vt];
    data.colors = [.88, .83, .87, 1, .88, .83, .87, 1, 1, 1, 1, 1, 1, 1, 1, 1];
    data.indices = [0, 1, 2, 0, 2, 3]; data.applyToMesh(mesh);
    mesh.material = material; mesh.isPickable = false;
    const matrices = new Float32Array(crowns.length * 16);
    const minimum = new Vector3(Infinity, Infinity, Infinity), maximum = new Vector3(-Infinity, -Infinity, -Infinity);
    for (let i = 0; i < crowns.length; i++) {
      const c = crowns[i]!;
      Matrix.Compose(new Vector3(c.width, c.height, c.width), Quaternion.Identity(), new Vector3(c.x, c.y, c.z)).copyToArray(matrices, i * 16);
      const extent = c.width * 1.35 + c.height;
      minimum.minimizeInPlaceFromFloats(c.x - extent, c.y - extent, c.z - extent);
      maximum.maximizeInPlaceFromFloats(c.x + extent, c.y + extent, c.z + extent);
    }
    mesh.thinInstanceSetBuffer('matrix', matrices, 16, true); mesh.thinInstanceRefreshBoundingInfo(true);
    mesh.setBoundingInfo(new BoundingInfo(minimum, maximum));
    return mesh;
  }
}
