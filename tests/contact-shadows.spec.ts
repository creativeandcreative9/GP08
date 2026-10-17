import { expect, test } from '@playwright/test';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { Scene } from '@babylonjs/core/scene.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { ContactShadows } from '../src/contact-shadows';
import type { Quality } from '../src/render';

test('contact shadows follow actor footprints, hide with the town and respect quality and camera fading', () => {
  const engine = new NullEngine(), scene = new Scene(engine), town = new TransformNode('town', scene);
  let quality: Quality = 'low';
  const rendering = { get quality() { return quality; }, addShadowCaster: () => {} };
  const contacts = new ContactShadows('life_contact_test', scene, 2, rendering); contacts.mesh.parent = town;
  contacts.set(0, 20, 7, -50, Math.PI / 2, 3, 5); contacts.set(1, -10, 0, 60, 0, 2, 4); contacts.upload();
  const world = contacts.mesh.thinInstanceGetWorldMatrices(), p = world[0]!.getTranslation();
  expect(p.x).toBe(20); expect(p.z).toBe(-50); expect(p.y).toBeCloseTo(7.025);
  expect(Math.hypot(world[0]!.m[0]!, world[0]!.m[2]!)).toBeCloseTo(3);
  expect(Math.hypot(world[0]!.m[8]!, world[0]!.m[10]!)).toBeCloseTo(5);
  expect(contacts.mesh.visibility).toBe(1); expect(contacts.mesh.isPickable).toBe(false); expect(contacts.mesh.receiveShadows).toBe(false);
  town.setEnabled(false); expect(contacts.mesh.isEnabled()).toBe(false); town.setEnabled(true); expect(contacts.mesh.isEnabled()).toBe(true);
  quality = 'high'; contacts.upload(.5); expect(contacts.mesh.visibility).toBeCloseTo(.225);
  contacts.hide(1); contacts.upload();
  // GetWorldMatrices caches its first CPU snapshot; inspect the buffer that upload actually submits.
  const data = (contacts.mesh as unknown as { _thinInstanceDataStorage: { matrixData: Float32Array } })._thinInstanceDataStorage.matrixData;
  expect(Array.from(data.slice(16, 32))).toEqual(Array(16).fill(0));
  scene.dispose(); engine.dispose();
});

test('contact darkening remains visible above depth-biased ground paint', async ({ page }) => {
  await page.route('**/src/main.ts*', route => route.fulfill({ contentType: 'application/javascript', body: '' }));
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const load = async (path: string): Promise<Record<string, any>> => import(/* @vite-ignore */ path);
    const { Engine } = await load('/node_modules/@babylonjs/core/Engines/engine.js');
    const { Scene } = await load('/node_modules/@babylonjs/core/scene.js');
    const { ArcRotateCamera } = await load('/node_modules/@babylonjs/core/Cameras/arcRotateCamera.js');
    const { Vector3 } = await load('/node_modules/@babylonjs/core/Maths/math.vector.js');
    const { MeshBuilder } = await load('/node_modules/@babylonjs/core/Meshes/meshBuilder.js');
    const { StandardMaterial } = await load('/node_modules/@babylonjs/core/Materials/standardMaterial.js');
    const { ContactShadows } = await load('/src/contact-shadows.ts');
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128; document.body.append(canvas);
    const engine = new Engine(canvas, false, { preserveDrawingBuffer: true }), scene = new Scene(engine);
    const camera = new ArcRotateCamera('camera', -Math.PI / 2, 1, 40, new Vector3(0, .65, 0), scene);
    camera.minZ = 1; camera.maxZ = 40000;
    const ground = MeshBuilder.CreateGround('painted-ground', { width: 80, height: 80 }, scene); ground.position.y = .6;
    const paint = new StandardMaterial('ground-paint', scene); paint.disableLighting = true; paint.emissiveColor.set(.8, .8, .8);
    // The top street paint/manhole layer uses this bias; geometry height alone does not put a shadow above it.
    paint.zOffset = -5; paint.zOffsetUnits = -10; ground.material = paint;
    const contacts = new ContactShadows('contacts', scene, 1, { quality: 'low', addShadowCaster() {} });
    contacts.set(0, 0, .63, 0, 0, 4.8, 3.6); contacts.upload();
    await scene.whenReadyAsync();
    const luma = async (): Promise<number> => {
      scene.render(); const rgba = await engine.readPixels(63, 63, 2, 2); let total = 0;
      for (let i = 0; i < rgba.length; i += 4) total += rgba[i] + rgba[i + 1] + rgba[i + 2];
      return total / 12;
    };
    const shaded = await luma(); contacts.mesh.setEnabled(false); const plain = await luma();
    scene.dispose(); engine.dispose(); canvas.remove(); return { shaded, plain };
  });
  expect(result.plain).toBeGreaterThan(150);
  expect(result.plain - result.shaded, 'the contact texture must visibly darken the painted ground').toBeGreaterThan(12);
});
