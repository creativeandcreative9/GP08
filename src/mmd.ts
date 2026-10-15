// Order matters: the default material builder must be registered before the PMX loader,
// because the loader captures it when it registers itself.
import 'babylon-mmd/esm/Loader/mmdModelLoader';
import 'babylon-mmd/esm/Loader/pmxLoader';
import { type AbstractEngine, LoadAssetContainerAsync, type Scene, Vector3 } from '@babylonjs/core';
import { SdefInjector } from 'babylon-mmd/esm/Loader/sdefInjector';
import { MmdRuntime } from 'babylon-mmd/esm/Runtime/mmdRuntime';
import type { MmdMesh } from 'babylon-mmd/esm/Runtime/mmdMesh';
import type { MmdModel } from 'babylon-mmd/esm/Runtime/mmdModel';
import { MmdStandardMaterialProxy } from 'babylon-mmd/esm/Runtime/mmdStandardMaterialProxy';
import { MmdWasmInstanceTypeSPR } from 'babylon-mmd/esm/Runtime/Optimized/InstanceType/singlePhysicsRelease';
import { GetMmdWasmInstance } from 'babylon-mmd/esm/Runtime/Optimized/mmdWasmInstance';
import { MultiPhysicsRuntime } from 'babylon-mmd/esm/Runtime/Optimized/Physics/Bind/Impl/multiPhysicsRuntime';
import { MmdBulletPhysics } from 'babylon-mmd/esm/Runtime/Optimized/Physics/mmdBulletPhysics';

/** Models in the private asset pack (private-assets/seisen). Never shipped in the public build. */
export const MODELS = {
  fubuki: 'seisen/清泉吹雪太眉LO.pmx',
  hatsuyuki: 'seisen/清泉初雪太眉LO.pmx',
  shirayuki: 'seisen/清泉白雪LO太眉.pmx',
  miyuki: 'seisen/清泉深雪太眉LO.pmx',
  uranami: 'seisen/清泉浦波太眉LO.pmx',
  mogami: 'seisen/清泉もがみん太眉LO.pmx',
  reiko: 'seisen/清泉玲子太眉LO.pmx',
} as const;

export type ModelKey = keyof typeof MODELS;

export function isModelKey(key: string): key is ModelKey {
  return Object.hasOwn(MODELS, key);
}

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
  physicsRuntime.register(scene);

  const runtime = new MmdRuntime(scene, new MmdBulletPhysics(physicsRuntime));
  runtime.register(scene);
  return runtime;
}

export async function loadMmdModel(scene: Scene, runtime: MmdRuntime, key: ModelKey): Promise<MmdModel> {
  const url = `/private/${MODELS[key].split('/').map(encodeURIComponent).join('/')}`;
  const container = await LoadAssetContainerAsync(url, scene, { pluginExtension: '.pmx' });
  container.addAllToScene();
  const mesh = container.meshes[0] as MmdMesh;
  return runtime.createMmdModel(mesh, { materialProxyConstructor: MmdStandardMaterialProxy });
}
