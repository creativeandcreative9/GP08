import './style.css';
import { Engine } from '@babylonjs/core/Engines/engine.js';
import { type Scene } from '@babylonjs/core/scene.js';
import { createScene } from './scene';
import { isModelKey, MODELS, modelUrl } from './models';
import { createPublicAvatar } from './player/avatar';
import { Player, type Footprint } from './player/player';
import { SPAWN } from './town/layout';
import { Gameplay } from './gameplay';
import { ContactShadows } from './contact-shadows';
import { DEC3_Y } from './town/ctx';

declare global {
  interface Window {
    __gp08: { ready: boolean; frames: number; errors: string[]; scene?: Scene; player?: Player; gameplay?: Gameplay };
  }
}

window.__gp08 = { ready: false, frames: 0, errors: [] as string[] };

window.addEventListener('error', (e) => window.__gp08.errors.push(String(e.message)));
window.addEventListener('unhandledrejection', (e) => window.__gp08.errors.push(String(e.reason)));

function main(): void {
  const canvas = document.getElementById('renderCanvas') as HTMLCanvasElement | null;
  if (!canvas) throw new Error('canvas #renderCanvas not found');
  const fpsEl = document.getElementById('fps');
  if (!import.meta.env.DEV) document.getElementById('hud')?.setAttribute('hidden', '');

  const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
  const game = createScene(engine, canvas);
  const { scene, camera } = game;
  if (import.meta.env.DEV) window.__gp08.scene = scene; // for debugging from tests/tools
  const town = (game as { town?: { heightAt(x: number, z: number): number; obstacles: readonly Footprint[] } }).town;

  // The player character comes from the private asset pack (dev/preview only).
  // ?model=<key> picks a model (error if missing), ?model=none disables it,
  // no parameter = Fubuki in development with the pack, otherwise the original public avatar.
  const params = new URLSearchParams(location.search);
  const param = params.get('model');
  let modelReady = param === 'none';
  void (async () => {
    if (param === 'none') return;
    const key = param ?? 'fubuki';
    const usePublic = key === 'public' || (param === null && (!import.meta.env.DEV || !(await fetch(modelUrl(MODELS.fubuki), { method: 'HEAD' })).ok));
    if (!usePublic && !isModelKey(key)) throw new Error(`unknown model: ${key}`);
    const mmd = usePublic ? undefined : await import('./mmd');
    mmd?.prepareEngineForMmd(engine);
    const runtime = mmd ? await mmd.createMmdRuntime(scene) : undefined;
    const model = runtime && mmd && isModelKey(key) ? await mmd.loadMmdModel(scene, runtime, key) : undefined;
    const avatar = model ? undefined : createPublicAvatar(scene);
    for (const m of [model?.mesh ?? avatar!.root, ...(model?.mesh ?? avatar!.root).getChildMeshes()]) {
      m.receiveShadows = game.rendering.quality === 'high';
      game.rendering.addShadowCaster(m);
    }
    const player = new Player({
      scene, camera, model, avatar, spawn: SPAWN,
      heightAt: town ? (x, z) => town.heightAt(x, z) : undefined,
      obstacles: town?.obstacles,
    });
    const contact = new ContactShadows('player-contact', scene, 1, game.rendering);
    const contactFrame = scene.onBeforeRenderObservable.add(() => {
      const p = player.position, indoor = scene.metadata?.climate?.indoor === true;
      contact.set(0, p.x, p.y + (indoor ? .025 : DEC3_Y + .03), p.z, player.root.rotation.y, 4.8, 3.6);
      contact.upload(player.root.visibility);
    });
    player.root.onDisposeObservable.addOnce(() => { scene.onBeforeRenderObservable.remove(contactFrame); contact.mesh.dispose(); });
    if (import.meta.env.DEV) window.__gp08.player = player;
    // Reference/comparison views retain their original composition and do not touch saved progress.
    if (!params.has('view') && !params.has('lifeshow')) {
      const gameplay = new Gameplay(game, player, canvas);
      if (import.meta.env.DEV) window.__gp08.gameplay = gameplay;
    }
    scene.executeWhenReady(() => {
      modelReady = true;
    });
  })().catch((e: unknown) => {
    window.__gp08.errors.push(String(e));
    console.error(e);
  });

  // Explicit gfx choices are respected. Automatic mode measures sustained performance after warm-up.
  let performanceSamples = 0, frameTime = 16, adaptation = 0;
  const automaticQuality = !params.has('gfx') && !params.has('view') && !params.has('lifeshow');
  let sceneReady = false;
  scene.executeWhenReady(() => {
    sceneReady = true;
  });

  engine.runRenderLoop(() => {
    scene.render();
    window.__gp08.frames++;
    if (automaticQuality && modelReady && sceneReady && !document.hidden && !document.querySelector('dialog[open]')) {
      frameTime = frameTime * .98 + Math.min(500, engine.getDeltaTime()) * .02;
      performanceSamples++;
      if (performanceSamples >= 240 && frameTime > 38 && adaptation === 0) {
        engine.setHardwareScalingLevel(Math.max(engine.getHardwareScalingLevel(), game.rendering.quality === 'low' ? 1.8 : 1.35));
        adaptation = 1; performanceSamples = 0;
      } else if (performanceSamples >= 180 && frameTime > 48 && adaptation === 1 && game.rendering.quality === 'high') {
        game.rendering.downgrade?.(); adaptation = 2;
        scene.metadata.automaticQuality = 'low';
      }
    }
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
