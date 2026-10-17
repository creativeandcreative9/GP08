import fs from 'node:fs';
import { expect, test } from '@playwright/test';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { Scene } from '@babylonjs/core/scene.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { BlossomClouds, BLOSSOM_SHADOW_LAYER } from '../src/town/blossoms';
import { ChunkedBatch } from '../src/town/batch';
import { foliageCluster } from '../src/town/leaf';
import { distantFoliageGeometry } from '../src/town/lod';

test('low quality uploads compact foliage while high quality preserves stationary canopy shadows', () => {
  const engine = new NullEngine(), scene = new Scene(engine), material = new StandardMaterial('test-foliage', scene);
  try {
    for (const shadows of [false, true]) {
      const batches = new ChunkedBatch(900, true), clouds = new BlossomClouds(), batch = batches.at(0, 0);
      foliageCluster(batch, 0, 50, 0, 15, .7, 'bloomA', .3, clouds);
      const first = batch.vertexCount;
      foliageCluster(batch, 50, 20, 0, 5, .8, 'hedgeC', .8, clouds);
      foliageCluster(batch, -30, 10, 20, 3, 1.3, 'bloomB', .1, clouds);
      const positions = [...batch.pos], indices = [...batch.idx];
      const meshes = clouds.build(scene, batches, material, shadows), root = new TransformNode(`root-${shadows}`, scene);
      for (const mesh of meshes) mesh.parent = root;
      const proxy = meshes.find(m => m.metadata?.blossomShadow), visible = meshes.find(m => m.name.startsWith('foliage_') && !m.metadata?.blossomShadow)!;
      expect(batch.pos).toEqual(positions); expect(batch.idx).toEqual(indices);
      expect(visible.getTotalVertices()).toBe(batch.vertexCount - first);
      // Compare triangle attributes after Float32 upload; the LOD check below also guards grid ordering.
      const expected = indices.filter(index => index >= first).flatMap(index => [...new Float32Array(positions.slice(index * 3, index * 3 + 3))]);
      const actual = [...visible.getIndices()!].flatMap(index => [...visible.getVerticesData('position')!.slice(index * 3, index * 3 + 3)]);
      expect(actual).toEqual(expected);
      expect(visible.getVerticesData('normal')!.length).toBe(visible.getTotalVertices() * 3);
      expect(visible.getVerticesData('uv')!.length).toBe(visible.getTotalVertices() * 2);
      expect(new Set(visible.getIndices()!).size).toBe(visible.getTotalVertices());
      const far = distantFoliageGeometry({ positions: visible.getVerticesData('position')!, normals: visible.getVerticesData('normal')!,
        colors: visible.getVerticesData('color')!, uvs: visible.getVerticesData('uv')!, indices: visible.getIndices()! });
      expect(visible.getTotalIndices() / 3).toBe(34); expect(far.triangleCount).toBe(16);
      if (shadows) { expect(proxy!.layerMask).toBe(BLOSSOM_SHADOW_LAYER); expect([...proxy!.getIndices()!]).toEqual(indices); }
      else expect(proxy).toBeUndefined();
      const cloud = meshes.find(m => m.name.startsWith('blossom-cloud-'))!;
      expect(cloud.thinInstanceCount).toBe(1); expect(cloud.getTotalIndices()).toBe(6);
      expect(scene.metadata.blossomClouds).toMatchObject({ crowns: 1, originalTriangles: 26, visibleTriangles: 2, shadowGeometry: shadows });
      root.setEnabled(false); expect(meshes.every(m => !m.isEnabled())).toBe(true); root.dispose(false, false);
    }
  } finally { scene.dispose(); engine.dispose(); }
});

test('a blossom retains its painted silhouette from the street, side and overhead', async ({ page }) => {
  await page.route('**/src/main.ts*', route => route.fulfill({ contentType: 'application/javascript', body: '' }));
  await page.goto('/?gfx=low'); const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  const results = await page.evaluate(async () => {
    const load = async (path: string): Promise<Record<string, any>> => import(/* @vite-ignore */path);
    const { Engine } = await load('/node_modules/@babylonjs/core/Engines/engine.js'), { Scene } = await load('/node_modules/@babylonjs/core/scene.js');
    const { FreeCamera } = await load('/node_modules/@babylonjs/core/Cameras/freeCamera.js'), { Camera } = await load('/node_modules/@babylonjs/core/Cameras/camera.js');
    const { Vector3 } = await load('/node_modules/@babylonjs/core/Maths/math.vector.js'), { Color4 } = await load('/node_modules/@babylonjs/core/Maths/math.color.js');
    const { BlossomClouds } = await load('/src/town/blossoms.ts'), { ChunkedBatch } = await load('/src/town/batch.ts'), { foliageCluster, foliageMaterial } = await load('/src/town/leaf.ts');
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128; canvas.style.cssText = 'width:128px;height:128px'; document.body.append(canvas);
    const engine = new Engine(canvas, false, { preserveDrawingBuffer: true }), scene = new Scene(engine); engine.setSize(128, 128); scene.clearColor = new Color4(0, 0, 0, 1);
    const camera = new FreeCamera('test-camera', new Vector3(0, 50, -100), scene); camera.mode = Camera.ORTHOGRAPHIC_CAMERA;
    camera.orthoLeft = camera.orthoBottom = -28; camera.orthoRight = camera.orthoTop = 28; camera.minZ = .1; camera.maxZ = 500;
    const batch = new ChunkedBatch(900, true), clouds = new BlossomClouds(); foliageCluster(batch.at(0, 0), 0, 50, 0, 15, .7, 'bloomA', .3, clouds);
    const material = foliageMaterial(scene); material.emissiveColor.set(1, 1, 1); const meshes = clouds.build(scene, batch, material, false), result = [];
    for (const [name, position] of [['front', [0, 50, -100]], ['side', [100, 50, 0]], ['above', [0, 150, -.01]]] as const) {
      camera.position.set(...position); camera.setTarget(new Vector3(0, 50, 0)); camera.getViewMatrix(true); camera.getProjectionMatrix(true);
      scene.render(); await scene.whenReadyAsync(); scene.render(); const pixels = await engine.readPixels(0, 0, 128, 128); let covered = 0;
      for (let i = 0; i < pixels.length; i += 4) if (pixels[i] + pixels[i + 1] + pixels[i + 2] > 50) covered++;
      result.push({ name, covered, active: scene.getActiveMeshes().length, image: canvas.toDataURL() });
    }
    const textureShared = meshes.every((m: any) => m.material.diffuseTexture === material.diffuseTexture); scene.dispose(); engine.dispose(); return { result, textureShared };
  });
  fs.mkdirSync('screenshots', { recursive: true });
  for (const r of results.result) fs.writeFileSync(`screenshots/blossom-facing-${r.name}.png`, Buffer.from(r.image.split(',')[1]!, 'base64'));
  console.log(JSON.stringify(results.result.map(({ name, covered, active }) => ({ name, covered, active }))));
  expect(errors).toEqual([]); expect(results.textureShared).toBe(true);
  const front = results.result.find(r => r.name === 'front')!.covered, side = results.result.find(r => r.name === 'side')!.covered, above = results.result.find(r => r.name === 'above')!.covered;
  expect(front).toBeGreaterThan(1000); expect(side / front).toBeGreaterThan(.97); expect(side / front).toBeLessThan(1.03);
  // A flattened crown's top projection has radius rather than its shallow vertical half-height.
  const topToSide = 1.48 / .7;
  expect(above / front).toBeGreaterThan(topToSide * .96); expect(above / front).toBeLessThan(topToSide * 1.04);
  expect(results.result.every(r => r.active > 0)).toBe(true);
});

test('canopy geometry hidden from the camera still casts its original alpha-tested shadow', async ({ page }) => {
  await page.route('**/src/main.ts*', route => route.fulfill({ contentType: 'application/javascript', body: '' }));
  await page.goto('/?gfx=high'); const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  const result = await page.evaluate(async () => {
    const load = async (path: string): Promise<Record<string, any>> => import(/* @vite-ignore */path);
    const { Engine } = await load('/node_modules/@babylonjs/core/Engines/engine.js'), { Scene } = await load('/node_modules/@babylonjs/core/scene.js');
    const { FreeCamera } = await load('/node_modules/@babylonjs/core/Cameras/freeCamera.js'), { Camera } = await load('/node_modules/@babylonjs/core/Cameras/camera.js');
    const { Vector3 } = await load('/node_modules/@babylonjs/core/Maths/math.vector.js'), { Color3, Color4 } = await load('/node_modules/@babylonjs/core/Maths/math.color.js');
    const { DirectionalLight } = await load('/node_modules/@babylonjs/core/Lights/directionalLight.js');
    const { BlossomClouds } = await load('/src/town/blossoms.ts'), { ChunkedBatch, MeshBatch } = await load('/src/town/batch.ts'), { foliageCluster, foliageMaterial } = await load('/src/town/leaf.ts');
    const { StandardMaterial } = await load('/node_modules/@babylonjs/core/Materials/standardMaterial.js');
    const { setupRendering } = await load('/src/render.ts');

    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128; canvas.style.cssText = 'width:128px;height:128px'; document.body.append(canvas);
    const engine = new Engine(canvas, false, { preserveDrawingBuffer: true }), scene = new Scene(engine); engine.setSize(128, 128); scene.clearColor = new Color4(0, 0, 0, 1);
    const camera = new FreeCamera('shadow-camera', new Vector3(0, 150, -.01), scene); camera.mode = Camera.ORTHOGRAPHIC_CAMERA;
    camera.orthoLeft = camera.orthoBottom = -50; camera.orthoRight = camera.orthoTop = 50; camera.setTarget(Vector3.Zero()); camera.maxZ = 500;
    const sun = new DirectionalLight('test-sun', new Vector3(-.4, -1, .3), scene); sun.position.set(40, 100, -30); sun.intensity = 1;
    const batch = new ChunkedBatch(900, true), clouds = new BlossomClouds(); foliageCluster(batch.at(0, 0), 0, 25, 0, 15, .7, 'bloomA', .3, clouds);
    const meshes = clouds.build(scene, batch, foliageMaterial(scene), true), proxy = meshes.find((m: any) => m.metadata?.blossomShadow);
    for (const mesh of meshes) if (mesh !== proxy) mesh.setEnabled(false);
    const groundMaterial = new StandardMaterial('ground', scene); groundMaterial.specularColor = Color3.Black(); groundMaterial.backFaceCulling = false;
    const groundBatch = new MeshBatch(); groundBatch.quad([-60, 0, -60], [60, 0, -60], [60, 0, 60], [-60, 0, 60], [1, 1, 1], [0, 1, 0]);
    const ground = groundBatch.toMesh('ground', scene, groundMaterial); ground.receiveShadows = true;
    const rendering = setupRendering(scene, camera, sun, [proxy], [ground, ...meshes.filter((m: any) => m !== proxy)]);
    const shadow = sun.getShadowGenerator(); let draws = 0;
    shadow.onBeforeShadowMapRenderMeshObservable.add(() => draws++);
    const capture = async (enabled: boolean) => {
      proxy.setEnabled(enabled); scene.render(); await scene.whenReadyAsync(); scene.render(); scene.render();
      const pixels = Array.from(await engine.readPixels(0, 0, 128, 128)) as number[]; return { pixels, image: canvas.toDataURL(), activeProxy: scene.getActiveMeshes().data.slice(0, scene.getActiveMeshes().length).includes(proxy) };
    };
    const withShadow = await capture(true), drawCount = draws, without = await capture(false); let darker = 0;
    for (let i = 0; i < without.pixels.length; i += 4) if (without.pixels[i]! - withShadow.pixels[i]! > 20) darker++;
    proxy.setEnabled(true);
    for (const mesh of meshes) if (mesh !== proxy) mesh.setEnabled(true);


    scene.render(); await scene.whenReadyAsync(); scene.render();
    const startedHigh = rendering.quality === 'high';
    rendering.downgrade(); rendering.downgrade(); scene.render(); await scene.whenReadyAsync(); scene.render();
    const downgrade = { startedHigh, quality: rendering.quality, proxyDisposed: proxy.isDisposed(),
      cloudAlive: meshes.filter((m: any) => m.name.startsWith('blossom-cloud-')).every((m: any) => !m.isDisposed() && m.isEnabled() && m.material.diffuseTexture.isReady()) };
    scene.dispose(); engine.dispose(); return { darker, drawCount, activeProxy: withShadow.activeProxy, downgrade, withImage: withShadow.image, withoutImage: without.image };
  });
  for (const [name, data] of [['with', result.withImage], ['without', result.withoutImage]]) fs.writeFileSync(`screenshots/blossom-shadow-${name}.png`, Buffer.from(data!.split(',')[1]!, 'base64'));
  console.log(JSON.stringify({ darker: result.darker, drawCount: result.drawCount, activeProxy: result.activeProxy }));
  expect(errors).toEqual([]); expect(result.activeProxy).toBe(false); expect(result.drawCount).toBeGreaterThan(0); expect(result.darker).toBeGreaterThan(50);
  expect(result.downgrade).toEqual({ startedHigh: true, quality: 'low', proxyDisposed: true, cloudAlive: true });
});
