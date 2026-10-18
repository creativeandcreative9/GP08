import { CascadedShadowGenerator } from '@babylonjs/core/Lights/Shadows/cascadedShadowGenerator.js';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color.js';
import { ColorCurves } from '@babylonjs/core/Materials/colorCurves.js';
import { DefaultRenderingPipeline } from '@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline.js';
import { ImageProcessingConfiguration } from '@babylonjs/core/Materials/imageProcessingConfiguration.js';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator.js';
import { type AbstractEngine } from '@babylonjs/core/Engines/abstractEngine.js';
import { type AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh.js';
import { type Camera } from '@babylonjs/core/Cameras/camera.js';
import { type DirectionalLight } from '@babylonjs/core/Lights/directionalLight.js';
import { type Scene } from '@babylonjs/core/scene.js';

/**
 * `?gfx=low` turns off sun shadows and post-processing (for slow machines), `?gfx=high` forces them on.
 * Without the parameter, software renderers (no GPU, e.g. headless test browsers) get `low`.
 */
export type Quality = 'low' | 'high';

export function quality(engine: AbstractEngine): Quality {
  const p = new URLSearchParams(location.search).get('gfx');
  if (p === 'low' || p === 'high') return p;
  if (navigator.maxTouchPoints > 0 && matchMedia('(pointer: coarse)').matches) return 'low';
  const info = (engine as { getInfo?: () => { renderer: string } }).getInfo?.();
  return /swiftshader|llvmpipe|software/i.test(info?.renderer ?? '') ? 'low' : 'high';
}

export interface Rendering {
  quality: Quality;
  /** Lets a mesh (e.g. the player model) cast sun shadows. */
  addShadowCaster(mesh: AbstractMesh): void;
  downgrade?(): void;
}

/**
 * Afternoon light and the camera image: soft cascaded sun shadows near the viewer, neutral tone mapping,
 * a gentle bloom on bright surfaces and a light vignette. Colours of the town are base albedo; the warm sun
 * and the cool sky light give the warm-light / blue-shade contrast of the reference images.
 */
export function setupRendering(
  scene: Scene,
  camera: Camera,
  sun: DirectionalLight,
  casters: readonly AbstractMesh[],
  receivers: readonly AbstractMesh[],
): Rendering {
  const q = quality(scene.getEngine());

  // Tone mapping also applies without the pipeline (materials then apply it themselves).
  const ip = scene.imageProcessingConfiguration;
  ip.toneMappingEnabled = true;
  // Khronos PBR Neutral keeps hues and pastel saturation (ACES darkens and shifts them)
  ip.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_KHR_PBR_NEUTRAL;
  ip.exposure = 1.03;
  ip.contrast = 1.03;

  // The same restrained palette applies to the inexpensive material path on phones.
  const cc = new ColorCurves();
  cc.shadowsHue = 242;
  cc.shadowsDensity = 24;
  cc.shadowsSaturation = 8;
  cc.shadowsExposure = 7;
  cc.highlightsHue = 38;
  cc.highlightsDensity = 16;
  cc.highlightsSaturation = 4;
  cc.globalSaturation = -8;
  ip.colorCurves = cc;
  ip.colorCurvesEnabled = true;

  if (q === 'low') {
    scene.getEngine().setHardwareScalingLevel(navigator.maxTouchPoints > 0 && matchMedia('(pointer: coarse)').matches ? 1.25 : 1.5);
    return { quality: q, addShadowCaster: () => {} };
  }

  const csm = new CascadedShadowGenerator(2048, sun);
  csm.numCascades = 3;
  csm.shadowMaxZ = 1800; // concentrate texels on the shopfronts and trees within ~145 m
  csm.lambda = 0.92;
  csm.stabilizeCascades = true;
  csm.cascadeBlendPercentage = 0.1;
  csm.useContactHardeningShadow = true;
  csm.contactHardeningLightSizeUVRatio = .008;
  csm.filteringQuality = ShadowGenerator.QUALITY_MEDIUM;
  // Keep thin eaves and window frames attached to their shadows at street scale.
  csm.bias = 0.0006;
  csm.normalBias = 0.012;
  csm.depthClamp = true;
  csm.transparencyShadow = false;
  // Curved models need more normal offset than thin town beams and window frames.
  const movingCasters = new WeakSet<AbstractMesh>();
  let casterNormalBias: number | undefined;
  csm.onBeforeShadowMapRenderMeshObservable.add(mesh => {
    casterNormalBias = movingCasters.has(mesh) ? .14 : mesh.metadata?.shadowNormalBias;
  });
  csm.onBeforeShadowMapRenderObservable.add(effect => {
    if (typeof casterNormalBias === 'number') effect.setFloat3('biasAndScaleSM', csm.bias, casterNormalBias, csm.depthScale);
  });
  for (const m of casters) csm.addShadowCaster(m, false);
  for (const m of receivers) m.receiveShadows = true;

  // Sun shadows supply contact and architectural depth. Screen-space AO produced
  // false occlusion on smooth trunks and a repeating bright grid on terrace boards.

  const pipe = new DefaultRenderingPipeline('post', true, scene, [camera]);
  pipe.samples = 4;
  pipe.fxaaEnabled = true;
  pipe.bloomEnabled = true;
  pipe.bloomThreshold = 0.82;
  pipe.bloomWeight = 0.14;
  pipe.bloomKernel = 48;
  pipe.bloomScale = 0.5;
  pipe.imageProcessingEnabled = true;
  pipe.imageProcessing.vignetteEnabled = true;
  pipe.imageProcessing.vignetteWeight = 1.1;
  pipe.imageProcessing.vignetteStretch = 0.4;
  pipe.imageProcessing.vignetteColor = new Color4(0.22, 0.18, 0.3, 0);
  pipe.sharpenEnabled = true;
  pipe.sharpen.edgeAmount = 0.18;
  pipe.sharpen.colorAmount = 1;

  let active = true;
  return {
    get quality() { return active ? 'high' as const : 'low' as const; },
    downgrade: () => {
      if (!active) return;
      active = false; pipe.dispose(); csm.dispose();
      for (const m of receivers) m.receiveShadows = false;
      for (const m of casters) if (m.metadata?.blossomShadow) m.dispose(false, false);
    },
    addShadowCaster: (mesh) => {
      if (active) {
        movingCasters.add(mesh);
        csm.addShadowCaster(mesh, true);
        mesh.onDisposeObservable.addOnce(() => { if (active) csm.removeShadowCaster(mesh, false); });
      }
    },
  };
}

/** Light colours for a clear spring afternoon (used by the scene's sun and sky light). */
export const LIGHT = {
  sunColor: new Color3(1, 0.94, 0.85),
  sunIntensity: 1.35,
  skyColor: new Color3(0.76, 0.84, 1),
  groundColor: new Color3(0.48, 0.50, 0.58),
  skyIntensity: 0.76,
} as const;
