import './style.css';
import { Engine, type Scene } from '@babylonjs/core';
import { createScene } from './scene';
import { createMmdRuntime, isModelKey, loadMmdModel, prepareEngineForMmd } from './mmd';

declare global {
  interface Window {
    __gp08: { ready: boolean; frames: number; errors: string[]; scene?: Scene };
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
  const { scene, camera } = createScene(engine, canvas);
  if (import.meta.env.DEV) window.__gp08.scene = scene; // for debugging from tests/tools

  // ?model=fubuki loads a model from the private asset pack (dev/preview only).
  const modelKey = new URLSearchParams(location.search).get('model');
  let modelReady = modelKey === null;
  if (modelKey !== null) {
    if (!isModelKey(modelKey)) throw new Error(`unknown model: ${modelKey}`);
    void (async () => {
      const runtime = await createMmdRuntime(scene);
      await loadMmdModel(scene, runtime, modelKey);
      camera.target.set(0, 10, 0);
      camera.radius = 32;
      scene.executeWhenReady(() => {
        modelReady = true;
      });
    })().catch((e: unknown) => {
      window.__gp08.errors.push(String(e));
      console.error(e);
    });
  }

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
