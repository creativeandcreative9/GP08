import { reflectedTownFaces } from './atmosphere';
import { Constants } from '@babylonjs/core/Engines/constants.js';
import { FresnelParameters } from '@babylonjs/core/Materials/fresnelParameters.js';
import { RawCubeTexture } from '@babylonjs/core/Materials/Textures/rawCubeTexture.js';
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { Texture } from '@babylonjs/core/Materials/Textures/texture.js';
import { type Scene } from '@babylonjs/core/scene.js';

/**
 * The material for window panes: nearly clear glass with a light blue tint, a few soft diagonal reflection streaks
 * (tiled every ~140 world units along the pane, so neighbouring panes continue the same reflection) and a faint
 * sun glint. The final opacity is `material alpha x texture alpha x vertex alpha`; the vertex alpha lets a pane be a little more
 * mirror-like at the top (sky) than at the bottom.
 */
export function createGlassMaterial(scene: Scene): StandardMaterial {
  const N = 256;
  const tex = new DynamicTexture('glassTex', { width: N, height: N }, scene, true, Texture.TRILINEAR_SAMPLINGMODE);
  tex.hasAlpha = true;
  tex.wrapU = Texture.WRAP_ADDRESSMODE;
  tex.wrapV = Texture.WRAP_ADDRESSMODE;
  const g = tex.getContext() as CanvasRenderingContext2D;
  const img = g.createImageData(N, N);
  // streak bands: [position in the tile, half width, strength]; lines of constant (2x + y) mod N tile seamlessly
  const bands: [number, number, number][] = [
    [0.12, 0.034, 0.5],
    [0.19, 0.011, 0.9],
    [0.52, 0.06, 0.45],
    [0.6, 0.013, 0.8],
    [0.86, 0.03, 0.4],
  ];
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const t = ((2 * x + y) % N) / N;
      let a = 0.34;
      for (const [p, w, s] of bands) {
        let d = Math.abs(t - p);
        d = Math.min(d, 1 - d);
        a += (1 - 0.34) * s * Math.exp(-((d / w) * (d / w)));
      }
      const i = (y * N + x) * 4;
      img.data[i] = 255;
      img.data[i + 1] = 255;
      img.data[i + 2] = 255;
      img.data[i + 3] = Math.min(255, Math.round(a * 255));
    }
  }
  g.putImageData(img, 0, 0);
  tex.update(true);

  const m = new StandardMaterial('glassMat', scene);
  m.alpha = .75;
  m.diffuseTexture = tex;
  m.useAlphaFromDiffuseTexture = true;
  m.diffuseColor = Color3.White();
  m.specularColor = new Color3(0.85, 0.92, 1);
  m.specularPower = 110;
  m.emissiveColor = new Color3(0.06, 0.08, 0.1);
  const reflection = new RawCubeTexture(scene, reflectedTownFaces(), 128, Constants.TEXTUREFORMAT_RGBA, Constants.TEXTURETYPE_UNSIGNED_BYTE, true, false, Texture.TRILINEAR_SAMPLINGMODE);
  reflection.level = .28;
  m.reflectionTexture = reflection;
  const fresnel = new FresnelParameters(); fresnel.bias = .05; fresnel.power = 3;
  fresnel.leftColor = Color3.White(); fresnel.rightColor = new Color3(.08, .08, .08); m.reflectionFresnelParameters = fresnel;
  m.backFaceCulling = false;
  m.twoSidedLighting = true;
  return m;
}
