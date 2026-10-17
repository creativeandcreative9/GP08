import { BoundingInfo } from '@babylonjs/core/Culling/boundingInfo.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { MaterialPluginBase } from '@babylonjs/core/Materials/materialPluginBase.js';
import { ShaderLanguage } from '@babylonjs/core/Materials/shaderLanguage.js';
import type { MaterialDefines } from '@babylonjs/core/Materials/materialDefines.js';
import type { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import type { UniformBuffer } from '@babylonjs/core/Materials/uniformBuffer.js';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh.js';
import type { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import type { Scene } from '@babylonjs/core/scene.js';
import { ChunkedBatch, type MeshBatch } from './batch';
import { quadUV, type UvRect } from './signs';
import type { V3 } from './util';

const ATTRIBUTE = 'gp08Cloth';

/** Only the cloth meshes carry this attribute; every rigid sign keeps its original shader path. */
class ClothWind extends MaterialPluginBase {
  time = 0;
  constructor(material: StandardMaterial) { super(material, 'GP08ClothWind', 230, { GP08CLOTH: false }, true, true); }
  override getClassName(): string { return 'GP08ClothWind'; }
  override isCompatible(language: ShaderLanguage): boolean { return language === ShaderLanguage.GLSL; }
  override prepareDefines(defines: MaterialDefines, _scene: Scene, mesh: AbstractMesh): void {
    defines['GP08CLOTH'] = mesh.isVerticesDataPresent(ATTRIBUTE);
  }
  override getAttributes(attributes: string[], _scene: Scene, mesh: AbstractMesh): void {
    if (mesh.isVerticesDataPresent(ATTRIBUTE)) attributes.push(ATTRIBUTE);
  }
  override getUniforms(): { ubo: { name: string; size: number; type: string }[]; vertex: string } {
    return { ubo: [{ name: 'gpClothTime', size: 1, type: 'float' }], vertex: 'uniform float gpClothTime;' };
  }
  override bindForSubMesh(buffer: UniformBuffer): void { buffer.updateFloat('gpClothTime', this.time); }
  override getCustomCode(type: string): { [point: string]: string } | null {
    if (type === 'fragment') return {
      CUSTOM_FRAGMENT_DEFINITIONS: '#ifdef GP08CLOTH\nvarying float vGpClothFold;\n#endif',
      CUSTOM_FRAGMENT_UPDATE_DIFFUSE: '#ifdef GP08CLOTH\nbaseColor.rgb *= vGpClothFold;\n#endif',
    };
    if (type !== 'vertex') return null;
    return {
      CUSTOM_VERTEX_DEFINITIONS: '#ifdef GP08CLOTH\nattribute vec4 gp08Cloth;\nvarying float vGpClothFold;\n#endif',
      CUSTOM_VERTEX_UPDATE_WORLDPOS: `
#ifdef GP08CLOTH
float gpClothWave = .72 * sin(gpClothTime * 1.8 + gp08Cloth.w)
  + .28 * sin(gpClothTime * 3.1 + gp08Cloth.w * 1.7);
worldPos.xz += gp08Cloth.xy * gp08Cloth.z * gpClothWave;
vGpClothFold = 1.0 - gp08Cloth.z * .08 * (.5 + .5 * cos(gpClothTime * 1.8 + gp08Cloth.w));
#endif`,
    };
  }
}

/** Small subdivided banners share the existing sign atlas, with their upper edge fixed to the arm. */
export class ClothBanners {
  readonly batches = new ChunkedBatch(900, true);
  private readonly weights = new Map<MeshBatch, number[]>();
  private panels = 0;

  /** Corners and UVs are ordered bottom-left, bottom-right, top-right, top-left. */
  panel(corners: readonly [V3, V3, V3, V3], normal: V3, uv: UvRect, pinnedSide: -1 | 0 | 1 = 0): void {
    const b = this.batches.at(corners[0][0], corners[0][2]);
    let weights = this.weights.get(b);
    if (!weights) { weights = []; this.weights.set(b, weights); }
    const picture = quadUV(uv), cols = 2, rows = 4;
    const point = (x: number, y: number): V3 => [0, 1, 2].map(k =>
      (corners[0][k]! * (1 - x) + corners[1][k]! * x) * (1 - y)
      + (corners[3][k]! * (1 - x) + corners[2][k]! * x) * y) as unknown as V3;
    const tex = (x: number, y: number): [number, number] => [0, 1].map(k =>
      (picture[0]![k]! * (1 - x) + picture[1]![k]! * x) * (1 - y)
      + (picture[3]![k]! * (1 - x) + picture[2]![k]! * x) * y) as [number, number];
    // Both faces use the same position phase so their sheets never peel apart.
    const along = (p: V3): number => Math.abs(normal[0]) > Math.abs(normal[2]) ? p[2] : p[0];
    const origin = corners.reduce((sum, p) => sum + along(p), 0) * .00525;
    for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
      const xy = [[col / cols, row / rows], [(col + 1) / cols, row / rows], [(col + 1) / cols, (row + 1) / rows], [col / cols, (row + 1) / rows]] as const;
      b.quad(point(...xy[0]), point(...xy[1]), point(...xy[2]), point(...xy[3]), [1, 1, 1], normal, xy.map(p => tex(...p)));
      for (const [x, y] of xy) {
        const pin = pinnedSide < 0 ? x : pinnedSide > 0 ? 1 - x : 1;
        const p = point(x, y), amplitude = .9 * (1 - y) * pin;
        // One common world wind direction keeps the two printable sides coincident.
        weights.push(.8, .6, amplitude, origin + p[1] * .19 + along(p) * .08);
      }
    }
    this.panels++;
  }

  build(scene: Scene, material: StandardMaterial): Mesh[] {
    const plugin = new ClothWind(material);
    scene.onBeforeRenderObservable.add(() => { plugin.time += Math.min(100, scene.getEngine().getDeltaTime()) / 1000; });
    const meshes: Mesh[] = [];
    for (const [key, batch] of this.batches.all()) {
      if (batch.empty) continue;
      const mesh = batch.toMesh(`cloth_${key}`, scene, material);
      mesh.setVerticesData(ATTRIBUTE, new Float32Array(this.weights.get(batch)!), false, 4);
      const bounds = mesh.getBoundingInfo().boundingBox;
      const extra = new Vector3(1.1, 0, 1.1);
      mesh.setBoundingInfo(new BoundingInfo(bounds.minimum.subtract(extra), bounds.maximum.add(extra)));
      mesh.isPickable = false; meshes.push(mesh);
    }
    scene.metadata = { ...scene.metadata, clothBanners: { panels: this.panels, meshes: meshes.length, vertices: this.batches.vertexCount } };
    return meshes;
  }
}
