// Run on the target PC/GPU: GP08_PORT=5181 node tools/benchmark.mjs --frames 180 --query '?model=public'
// Software-rendered cloud numbers are diagnostic only, never evidence of mobile/GPU performance.
import fs from 'node:fs';
import path from 'node:path';
import { createServer } from 'vite';
import { chromium } from '@playwright/test';
const arg = (name, fallback) => { const index = process.argv.indexOf(`--${name}`); return index < 0 ? fallback : process.argv[index + 1]; };
const frames = Number(arg('frames', '180'));
if (!Number.isInteger(frames) || frames < 10 || frames > 3600) throw new Error('--frames must be between 10 and 3600');
const query = arg('query', '?model=public'), out = arg('out', 'screenshots/performance.json');
// Automatic mode needs enough warm-up to exercise both stages of the quality controller.
const warmupFrames = Number(arg('warmup', new URLSearchParams(query.replace(/^\?/, '')).has('gfx') ? '30' : '480'));
if (!Number.isInteger(warmupFrames) || warmupFrames < 0 || warmupFrames > 3600) throw new Error('--warmup must be between 0 and 3600');
let server, browser;
try {
  server = await createServer({ server: { host: '127.0.0.1', port: Number(process.env.GP08_PORT ?? 5181), strictPort: true } }); await server.listen();
  browser = await chromium.launch({ headless: !process.argv.includes('--headed'), args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'].filter(() => process.argv.includes('--software')) });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } }); const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.config.server.port}/${query}`, { timeout: 300000 });
  await page.waitForFunction(() => window.__gp08?.ready, null, { timeout: 300000 });
  const result = await page.evaluate(async ({ frames, warmupFrames }) => {
    const scene = window.__gp08.scene, engine = scene.getEngine();
    const samples = []; let warmup = warmupFrames;
    await new Promise(resolve => {
      const observer = scene.onAfterRenderObservable.add(() => {
        if (document.hidden || warmup-- > 0) return;
        samples.push(engine.getDeltaTime());
        if (samples.length >= frames) { scene.onAfterRenderObservable.remove(observer); resolve(); }
      });
    });
    engine.stopRenderLoop();
    const sorted = [...samples].sort((a, b) => a - b), info = engine.getInfo();
    const active = scene.getActiveMeshes(); let vertices = 0;
    for (let i = 0; i < active.length; i++) {
      const mesh = active.data[i]; vertices += mesh.getTotalVertices() * (mesh.hasThinInstances ? mesh.thinInstanceCount : 1);
    }
    return {
      renderer: info.renderer, vendor: info.vendor, software: /swiftshader|llvmpipe|software/i.test(info.renderer),
      frames, warmupFrames, viewport: [engine.getRenderWidth(), engine.getRenderHeight()], scaling: engine.getHardwareScalingLevel(),
      meanFPS: 1000 / (samples.reduce((a, b) => a + b, 0) / frames), medianMs: sorted[Math.floor(frames / 2)], p95Ms: sorted[Math.min(frames - 1, Math.floor(frames * .95))],
      activeVertices: vertices, activeMeshes: active.length,
      vertexMetric: 'active mesh vertices times thin-instance count, excluding shadow and post passes',
      automaticQuality: scene.metadata.automaticQuality ?? 'unchanged', query: location.search,
    };
  }, { frames, warmupFrames });
  result.errors = errors; result.date = new Date().toISOString();
  fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
  if (errors.length) process.exitCode = 1;
} catch (e) { console.error(e); process.exitCode = 1; }
finally { await browser?.close(); await server?.close(); }
