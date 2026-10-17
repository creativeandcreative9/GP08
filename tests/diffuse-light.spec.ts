import fs from 'node:fs';
import { expect, test } from '@playwright/test';

test('a lit town surface retains visible differences above unit light intensity', async ({ page }) => {
  await page.route('**/src/main.ts*', route => route.fulfill({ contentType: 'application/javascript', body: '' }));
  await page.goto('/');
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  const result = await page.evaluate(async () => {
    const load = async (path: string): Promise<Record<string, any>> => import(/* @vite-ignore */ path);
    const { Engine } = await load('/node_modules/@babylonjs/core/Engines/engine.js');
    const { Scene } = await load('/node_modules/@babylonjs/core/scene.js');
    const { FreeCamera } = await load('/node_modules/@babylonjs/core/Cameras/freeCamera.js');
    const { Vector3 } = await load('/node_modules/@babylonjs/core/Maths/math.vector.js');
    const { DirectionalLight } = await load('/node_modules/@babylonjs/core/Lights/directionalLight.js');
    const { StandardMaterial } = await load('/node_modules/@babylonjs/core/Materials/standardMaterial.js');
    const { MeshBatch } = await load('/src/town/batch.ts');
    const { applySurfaceDetail, SURF } = await load('/src/surface.ts');
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128; document.body.append(canvas);
    const engine = new Engine(canvas, false, { preserveDrawingBuffer: true }), scene = new Scene(engine);
    const camera = new FreeCamera('camera', new Vector3(0, 4, -10), scene); camera.setTarget(new Vector3(0, 4, 0)); camera.minZ = .1;
    const sun = new DirectionalLight('sun', new Vector3(0, 0, 1), scene);
    const material = new StandardMaterial('townMat', scene); material.specularColor.set(0, 0, 0); material.backFaceCulling = false;
    const batch: import('../src/town/batch').MeshBatch = new MeshBatch(); batch.surface = SURF.paintedMetal;
    batch.card([[-4, 0, 0], [-4, 8, 0], [4, 8, 0], [4, 0, 0]], [.2, .2, .2], [0, 0, -1], [[0, 1], [0, 0], [1, 0], [1, 1]]);
    batch.toMesh('wall', scene, material); applySurfaceDetail(scene);
    const sample = async (intensity: number): Promise<{ rgba: number[]; image: string }> => {
      sun.intensity = intensity; scene.render(); await scene.whenReadyAsync(); scene.render();
      const rgba = new Uint8Array(4), gl = engine._gl; gl.readPixels(64, 64, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
      return { rgba: [...rgba], image: canvas.toDataURL('image/png') };
    };
    const dim = await sample(.4), medium = await sample(2), strong = await sample(4);
    scene.dispose(); engine.dispose(); canvas.remove(); return { dim, medium, strong };
  });
  fs.mkdirSync('screenshots', { recursive: true });
  for (const name of ['dim', 'medium', 'strong'] as const) fs.writeFileSync(`screenshots/diffuse-light-${name}.png`, Buffer.from(result[name].image.split(',')[1]!, 'base64'));
  const luma = (a: number[]): number => .2126 * a[0]! + .7152 * a[1]! + .0722 * a[2]!;
  const values = { dim: luma(result.dim.rgba), medium: luma(result.medium.rgba), strong: luma(result.strong.rgba), errors };
  console.log(JSON.stringify(values)); expect(errors).toEqual([]);
  expect(values.medium).toBeGreaterThan(values.dim * 1.2);
  expect(values.strong, JSON.stringify(values)).toBeGreaterThan(values.medium * 1.15);
});
