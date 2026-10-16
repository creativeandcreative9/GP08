import {
  CascadedShadowGenerator,
  Color3,
  Color4,
  DefaultRenderingPipeline,
  ImageProcessingConfiguration,
  SSAO2RenderingPipeline,
  ShadowGenerator,
  type AbstractEngine,
  type AbstractMesh,
  type Camera,
  type DirectionalLight,
  type Scene,
} from '@babylonjs/core';

/**
 * `?gfx=low` turns off sun shadows and post-processing (for slow machines), `?gfx=high` forces them on.
 * Without the parameter, software renderers (no GPU, e.g. headless test browsers) get `low`.
 */
export type Quality = 'low' | 'high';

export function quality(engine: AbstractEngine): Quality {
  const p = new URLSearchParams(location.search).get('gfx');
  if (p === 'low' || p === 'high') return p;
  const info = (engine as { getInfo?: () => { renderer: string } }).getInfo?.();
  return /swiftshader|llvmpipe|software/i.test(info?.renderer ?? '') ? 'low' : 'high';
}

export interface Rendering {
  quality: Quality;
  /** Lets a mesh (e.g. the player model) cast sun shadows. */
  addShadowCaster(mesh: AbstractMesh): void;
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
  ip.exposure = 1.05;
  ip.contrast = 1.05;

  if (q === 'low') return { quality: q, addShadowCaster: () => {} };

  const csm = new CascadedShadowGenerator(2048, sun);
  csm.numCascades = 3;
  csm.shadowMaxZ = 2400; // shadows within ~190 m of the viewer: the street-level scale that matters
  csm.lambda = 0.9;
  csm.stabilizeCascades = true;
  csm.cascadeBlendPercentage = 0.1;
  csm.usePercentageCloserFiltering = true;
  csm.filteringQuality = ShadowGenerator.QUALITY_MEDIUM;
  csm.bias = 0.0015;
  csm.normalBias = 0.012;
  csm.depthClamp = true;
  csm.transparencyShadow = false;
  for (const m of casters) csm.addShadowCaster(m, false);
  for (const m of receivers) m.receiveShadows = true;

  // contact shadows: darkening under eaves, in corners and at the foot of things
  if (SSAO2RenderingPipeline.IsSupported) {
    const ao = new SSAO2RenderingPipeline('ao', scene, { ssaoRatio: 0.5, blurRatio: 0.5 }, [camera], false);
    ao.radius = 9;
    ao.totalStrength = 1.1;
    ao.base = 0.12;
    ao.samples = 16;
    ao.maxZ = 2500;
    ao.minZAspect = 0.3;
    ao.expensiveBlur = true;
    ao.bilateralSamples = 12;
  }

  const pipe = new DefaultRenderingPipeline('post', true, scene, [camera]);
  pipe.samples = 4;
  pipe.fxaaEnabled = false;
  pipe.bloomEnabled = true;
  pipe.bloomThreshold = 0.82;
  pipe.bloomWeight = 0.22;
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

  return {
    quality: q,
    addShadowCaster: (mesh) => {
      csm.addShadowCaster(mesh, true);
    },
  };
}

/** Light colours for a clear spring afternoon (used by the scene's sun and sky light). */
export const LIGHT = {
  sunColor: new Color3(1, 0.91, 0.78),
  sunIntensity: 1.05,
  skyColor: new Color3(0.8, 0.86, 1),
  groundColor: new Color3(0.66, 0.6, 0.56),
  skyIntensity: 0.95,
} as const;
