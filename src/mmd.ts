// Order matters: the default material builder must be registered before the PMX loader,
// because the loader captures it when it registers itself.
import 'babylon-mmd/esm/Loader/mmdModelLoader';
import 'babylon-mmd/esm/Loader/pmxLoader';
import { type AbstractEngine } from '@babylonjs/core/Engines/abstractEngine.js';
import { LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader.js';
import { type Scene } from '@babylonjs/core/scene.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { SdefInjector } from 'babylon-mmd/esm/Loader/sdefInjector';
import { MmdRuntime } from 'babylon-mmd/esm/Runtime/mmdRuntime';
import type { MmdMesh } from 'babylon-mmd/esm/Runtime/mmdMesh';
import type { MmdModel } from 'babylon-mmd/esm/Runtime/mmdModel';
import { MmdStandardMaterialProxy } from 'babylon-mmd/esm/Runtime/mmdStandardMaterialProxy';
import { MmdWasmInstanceTypeSPR } from 'babylon-mmd/esm/Runtime/Optimized/InstanceType/singlePhysicsRelease';
import { GetMmdWasmInstance } from 'babylon-mmd/esm/Runtime/Optimized/mmdWasmInstance';
import { MultiPhysicsRuntime } from 'babylon-mmd/esm/Runtime/Optimized/Physics/Bind/Impl/multiPhysicsRuntime';
import { MmdBulletPhysics } from 'babylon-mmd/esm/Runtime/Optimized/Physics/mmdBulletPhysics';

import { MODELS, modelUrl, type ModelKey } from './models';
export { MODELS, modelUrl, isModelKey } from './models';

/** Call once, right after creating the engine (enables SDEF skinning like MMD). */
export function prepareEngineForMmd(engine: AbstractEngine): void {
  SdefInjector.OverrideEngineCreateEffect(engine);
}

/**
 * Creates the MMD runtime with Bullet physics (single-thread wasm, so no COOP/COEP headers are needed).
 * The world uses MMD units: 1 unit ≈ 8 cm, gravity −98.
 */
export async function createMmdRuntime(scene: Scene): Promise<MmdRuntime> {
  const wasm = await GetMmdWasmInstance(new MmdWasmInstanceTypeSPR());
  const physicsRuntime = new MultiPhysicsRuntime(wasm);
  physicsRuntime.setGravity(new Vector3(0, -98, 0));
  // Keep hair and skirt stable when the frame rate drops (e.g. software rendering): more, fixed sub-steps.
  physicsRuntime.fixedTimeStep = 1 / 120;
  physicsRuntime.maxSubSteps = 12;
  physicsRuntime.register(scene);

  const runtime = new MmdRuntime(scene, new MmdBulletPhysics(physicsRuntime));
  runtime.register(scene);
  return runtime;
}

export async function loadMmdModel(scene: Scene, runtime: MmdRuntime, key: ModelKey): Promise<MmdModel> {
  const url = modelUrl(MODELS[key]);
  const container = await LoadAssetContainerAsync(url, scene, { pluginExtension: '.pmx' });
  container.addAllToScene();
  const mesh = container.meshes[0] as MmdMesh;
  return runtime.createMmdModel(mesh, { materialProxyConstructor: MmdStandardMaterialProxy });
}
