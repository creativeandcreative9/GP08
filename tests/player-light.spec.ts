import fs from 'node:fs';
import { expect, test } from '@playwright/test';

test('a roof darkens the public player in sunlight and removing it restores the shirt', async ({ page }) => {
  await page.route('**/src/main.ts*', route => route.fulfill({ contentType: 'application/javascript', body: '' }));
  await page.goto('/');
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  const result = await page.evaluate(async () => {
    const load = async (path: string): Promise<Record<string, any>> => import(/* @vite-ignore */ path);
    const { Engine } = await load('/node_modules/@babylonjs/core/Engines/engine.js');
    const { Scene } = await load('/node_modules/@babylonjs/core/scene.js');
    const { FreeCamera } = await load('/node_modules/@babylonjs/core/Cameras/freeCamera.js');
    const { Vector3 } = await load('/node_modules/@babylonjs/core/Maths/math.vector.js');
    const { HemisphericLight } = await load('/node_modules/@babylonjs/core/Lights/hemisphericLight.js');
    const { DirectionalLight } = await load('/node_modules/@babylonjs/core/Lights/directionalLight.js');
    const { ShadowGenerator } = await load('/node_modules/@babylonjs/core/Lights/Shadows/shadowGenerator.js');
    await load('/node_modules/@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent.js');
    const { MeshBuilder } = await load('/node_modules/@babylonjs/core/Meshes/meshBuilder.js');
    const { createPublicAvatar } = await load('/src/player/avatar.ts');
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 192; document.body.append(canvas);
    const engine = new Engine(canvas, false, { preserveDrawingBuffer: true }), scene = new Scene(engine);
    const camera = new FreeCamera('camera', new Vector3(0, 13, -45), scene); camera.setTarget(new Vector3(0, 13, 0)); camera.fov = .6; camera.minZ = 1; camera.maxZ = 150;
    const ambient = new HemisphericLight('ambient', new Vector3(0, 1, 0), scene); ambient.intensity = .2;
    const sun = new DirectionalLight('sun', new Vector3(0, -1, .7).normalize(), scene); sun.position.set(0, 40, -28); sun.intensity = 1.3; sun.shadowMinZ = .1; sun.shadowMaxZ = 100;
    const avatar = createPublicAvatar(scene), roof = MeshBuilder.CreateBox('roof', { width: 24, height: 1, depth: 30 }, scene); roof.position.set(0, 26, -8);
    const shadow = new ShadowGenerator(256, sun); shadow.bias = .0006; shadow.normalBias = .012; shadow.addShadowCaster(roof);
    scene.render(); await scene.whenReadyAsync(); scene.render();
    const luma = async (): Promise<number> => {
      scene.render(); const pixels = await engine.readPixels(95, 95, 2, 2); let sum = 0;
      for (let i = 0; i < pixels.length; i += 4) sum += pixels[i] + pixels[i + 1] + pixels[i + 2]; return sum / 12;
    };
    const shaded = await luma(), shadedImage = canvas.toDataURL(); roof.setEnabled(false); const open = await luma(), openImage = canvas.toDataURL();
    const receivers = avatar.root.getChildMeshes().filter((m: any) => m.receiveShadows).length;
    scene.dispose(); engine.dispose(); canvas.remove(); return { shaded, open, receivers, shadedImage, openImage };
  });
  fs.mkdirSync('screenshots/player-shadow', { recursive: true });
  fs.writeFileSync('screenshots/player-shadow/roof.png', Buffer.from(result.shadedImage.split(',')[1]!, 'base64'));
  fs.writeFileSync('screenshots/player-shadow/open.png', Buffer.from(result.openImage.split(',')[1]!, 'base64'));
  expect(errors).toEqual([]); expect(result.open).toBeGreaterThan(150);
  expect(result.open - result.shaded, JSON.stringify({ shaded: result.shaded, open: result.open, receivers: result.receivers })).toBeGreaterThan(25);
});
