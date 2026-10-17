import { CascadedShadowGenerator } from '@babylonjs/core/Lights/Shadows/cascadedShadowGenerator.js';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color.js';
import { ColorCurves } from '@babylonjs/core/Materials/colorCurves.js';
import { DefaultRenderingPipeline } from '@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline.js';
import { ImageProcessingConfiguration } from '@babylonjs/core/Materials/imageProcessingConfiguration.js';
import { SSAO2RenderingPipeline } from '@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/ssao2RenderingPipeline.js';
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
  ip.exposure = 1.05;
  ip.contrast = 1.02;

  if (q === 'low') {
    scene.getEngine().setHardwareScalingLevel(1.5);
    return { quality: q, addShadowCaster: () => {} };
  }

  const csm = new CascadedShadowGenerator(2048, sun);
  csm.numCascades = 3;
  csm.shadowMaxZ = 2400; // shadows within ~190 m of the viewer: the street-level scale that matters
  csm.lambda = 0.9;
  csm.stabilizeCascades = true;
  csm.cascadeBlendPercentage = 0.1;
  csm.useContactHardeningShadow = true;
  csm.contactHardeningLightSizeUVRatio = .012;
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

  let ao: SSAO2RenderingPipeline | undefined;
  // contact shadows: darkening under eaves, in corners and at the foot of things
  if (SSAO2RenderingPipeline.IsSupported) {
    ao = new SSAO2RenderingPipeline('ao', scene, { ssaoRatio: 0.5, blurRatio: 0.5 }, [camera], false);
    ao.radius = 6;
    ao.totalStrength = 1.3;
    ao.base = 0.06;
    ao.samples = 16;
    ao.maxZ = 2500;
    ao.minZAspect = 0.3;
    ao.expensiveBlur = true;
    ao.bilateralSamples = 12;
  }

  // colour grading: cool violet-blue in the shade, warm gold in the light, shadows lifted a little (never black)
  const cc = new ColorCurves();
  cc.shadowsHue = 252;
  cc.shadowsDensity = 38;
  cc.shadowsSaturation = 12;
  cc.shadowsExposure = 8;
  cc.highlightsHue = 42;
  cc.highlightsDensity = 28;
  cc.highlightsSaturation = 6;
  cc.globalSaturation = -12;
  ip.colorCurves = cc;
  ip.colorCurvesEnabled = true;

  const pipe = new DefaultRenderingPipeline('post', true, scene, [camera]);
  pipe.samples = 4;
  pipe.fxaaEnabled = true;
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

  let active = true;
  return {
    get quality() { return active ? 'high' as const : 'low' as const; },
    downgrade: () => {
      if (!active) return;
      active = false; pipe.dispose(); ao?.dispose(); csm.dispose();
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
  sunColor: new Color3(1, 0.91, 0.78),
  sunIntensity: 1.15,
  skyColor: new Color3(0.8, 0.86, 1),
  groundColor: new Color3(0.66, 0.6, 0.56),
  skyIntensity: 0.9,
} as const;
