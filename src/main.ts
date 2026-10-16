import './style.css';
import { Engine, type Scene } from '@babylonjs/core';
import { createScene } from './scene';
import { createMmdRuntime, isModelKey, loadMmdModel, MODELS, modelUrl, prepareEngineForMmd } from './mmd';
import { Player, type Footprint } from './player/player';
import { SPAWN } from './town/layout';

declare global {
  interface Window {
    __gp08: { ready: boolean; frames: number; errors: string[]; scene?: Scene; player?: Player };
  }
}

window.__gp08 = { ready: false, frames: 0, errors: [] as string[] };

window.addEventListener('error', (e) => window.__gp08.errors.push(String(e.message)));
window.addEventListener('unhandledrejection', (e) => window.__gp08.errors.push(String(e.reason)));

function main(): void {
  const canvas = document.getElementById('renderCanvas') as HTMLCanvasElement | null;
  if (!canvas) throw new Error('canvas #renderCanvas not found');
  const fpsEl = document.getElementById('fps');

  const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
  prepareEngineForMmd(engine);
  const game = createScene(engine, canvas);
  const { scene, camera } = game;
  if (import.meta.env.DEV) window.__gp08.scene = scene; // for debugging from tests/tools
  const town = (game as { town?: { heightAt(x: number, z: number): number; obstacles: readonly Footprint[] } }).town;

  // The player character comes from the private asset pack (dev/preview only).
  // ?model=<key> picks a model (error if missing), ?model=none disables it,
  // no parameter = Fubuki when the pack is available, otherwise no character.
  const param = new URLSearchParams(location.search).get('model');
  let modelReady = param === 'none';
  void (async () => {
    if (param === 'none') return;
    const key = param ?? 'fubuki';
    if (!isModelKey(key)) throw new Error(`unknown model: ${key}`);
    if (param === null && !(await fetch(modelUrl(MODELS[key]), { method: 'HEAD' })).ok) {
      modelReady = true; // no private assets here: run without the character
      return;
    }
    const runtime = await createMmdRuntime(scene);
    const model = await loadMmdModel(scene, runtime, key);
    for (const m of [model.mesh, ...model.mesh.getChildMeshes()]) game.rendering.addShadowCaster(m);
    const player = new Player({
      scene,
      camera,
      model,
      spawn: SPAWN,
      heightAt: town ? (x, z) => town.heightAt(x, z) : undefined,
      obstacles: town?.obstacles,
    });
    if (import.meta.env.DEV) window.__gp08.player = player;
    scene.executeWhenReady(() => {
      modelReady = true;
    });
  })().catch((e: unknown) => {
    window.__gp08.errors.push(String(e));
    console.error(e);
  });

  let sceneReady = false;
  scene.executeWhenReady(() => {
    sceneReady = true;
  });

  engine.runRenderLoop(() => {
    scene.render();
    window.__gp08.frames++;
    if (fpsEl && window.__gp08.frames % 15 === 0) fpsEl.textContent = `FPS: ${engine.getFps().toFixed(0)}`;
    if (sceneReady && modelReady && window.__gp08.frames >= 10) window.__gp08.ready = true;
  });

  window.addEventListener('resize', () => engine.resize());
}

try {
  main();
} catch (e) {
  window.__gp08.errors.push(String(e));
  throw e;
}
