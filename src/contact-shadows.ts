import { Constants } from '@babylonjs/core/Engines/constants.js';
import { Material } from '@babylonjs/core/Materials/material.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture.js';
import { Texture } from '@babylonjs/core/Materials/Textures/texture.js';
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { type Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { type Scene } from '@babylonjs/core/scene.js';
import { hideInstance, Instances, setPose } from './life/inst';
import type { Rendering } from './render';
import { MeshBatch } from './town/batch';

const materials = new WeakMap<Scene, StandardMaterial>();

function shadowMaterial(scene: Scene): StandardMaterial {
  const existing = materials.get(scene);
  if (existing) return existing;
  const width = 64, pixels = new Uint8Array(width * width * 4);
  for (let y = 0; y < width; y++) for (let x = 0; x < width; x++) {
    const d = ((x + .5) / width * 2 - 1) ** 2 + ((y + .5) / width * 2 - 1) ** 2;
    const fade = Math.max(0, Math.min(1, (1 - d) / .35));
    const i = (y * width + x) * 4;
    pixels[i] = pixels[i + 1] = pixels[i + 2] = 255;
    pixels[i + 3] = Math.round(215 * Math.exp(-3 * d) * fade * fade * (3 - 2 * fade));
  }
  const texture = new RawTexture(pixels, width, width, Constants.TEXTUREFORMAT_RGBA, scene, true, false, Texture.TRILINEAR_SAMPLINGMODE);
  texture.hasAlpha = true; texture.wrapU = texture.wrapV = Texture.CLAMP_ADDRESSMODE;
  const material = new StandardMaterial('contact-shadow-material', scene);
  material.diffuseTexture = texture; material.useAlphaFromDiffuseTexture = true;
  material.diffuseColor = Color3.Black(); material.emissiveColor.set(.07, .085, .12);
  material.disableLighting = true; material.specularColor = Color3.Black();
  material.alpha = .28; material.backFaceCulling = false; material.disableDepthWrite = true;
  material.transparencyMode = Material.MATERIAL_ALPHABLEND;
  // Draw after the ground decals (bias 1..4) and street paint/manholes (5).
  // Raising the quad alone is insufficient: the paint's depth bias otherwise covers it.
  material.zOffset = -6; material.zOffsetUnits = -12;
  materials.set(scene, material);
  return material;
}

/** One instanced quad per actor: a small grounding shadow, with no extra shadow-map pass. */
export class ContactShadows {
  readonly mesh: Mesh;
  private readonly instances: Instances;

  constructor(name: string, scene: Scene, capacity: number, private readonly rendering: Rendering) {
    const quad = new MeshBatch(true);
    quad.quad([-1, 0, -1], [-1, 0, 1], [1, 0, 1], [1, 0, -1], [1, 1, 1], [0, 1, 0], [[0, 0], [0, 1], [1, 1], [1, 0]]);
    this.instances = new Instances(name, quad, shadowMaterial(scene), scene, capacity);
    this.mesh = this.instances.mesh;
    this.mesh.receiveShadows = false; this.mesh.isPickable = false; this.mesh.alphaIndex = -10;
  }

  set(slot: number, x: number, floorY: number, z: number, yaw: number, halfWidth: number, halfLength: number): void {
    const d = this.instances.data, o = slot * 16;
    setPose(d, o, x, floorY + .025, z, yaw);
    d[o]! *= halfWidth; d[o + 2]! *= halfWidth;
    d[o + 8]! *= halfLength; d[o + 10]! *= halfLength;
  }

  hide(slot: number): void { hideInstance(this.instances.data, slot * 16); }

  upload(fade = 1): void {
    // Full light mode has no sun shadow; high quality only needs a subtle contact supplement.
    this.mesh.visibility = (this.rendering.quality === 'low' ? 1 : .45) * fade;
    this.instances.upload();
  }
}
