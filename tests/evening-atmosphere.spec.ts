import { expect, test } from '@playwright/test';

test('moon and stars fade in at dusk, disappear indoors and in rain, and share a small geometry budget', async ({ page }) => {
  await page.route('**/src/main.ts*', route => route.fulfill({ contentType: 'application/javascript', body: '' }));
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const load = async (path: string): Promise<Record<string, any>> => import(/* @vite-ignore */ path);
    const { NullEngine } = await load('/node_modules/@babylonjs/core/Engines/nullEngine.js');
    const { Scene } = await load('/node_modules/@babylonjs/core/scene.js');
    const { EveningAtmosphere } = await load('/src/gameplay/evening-atmosphere.ts');
    const { newLife } = await load('/src/gameplay/calendar.ts');
    const engine = new NullEngine(), scene = new Scene(engine), atmosphere = new EveningAtmosphere(scene), life = newLife();
    const moon = scene.getMeshByName('evening-moon'), stars = scene.getMeshByName('evening-stars');
    const visible = (): boolean => moon.isEnabled() && stars.isEnabled();
    atmosphere.update(life, false); const day = visible();
    life.minute = 18 * 60; atmosphere.update(life, false); const dusk = { visible: visible(), alpha: moon.material.alpha };
    life.minute = 20 * 60; atmosphere.update(life, false); const night = { visible: visible(), alpha: moon.material.alpha };
    atmosphere.update(life, true); const indoors = visible();
    life.weather = 'rain'; atmosphere.update(life, false); const rain = visible();
    life.weather = 'cloudy'; atmosphere.update(life, false); const clouds = visible();
    life.weather = 'clear'; atmosphere.update(life, false); const restored = visible();
    life.minute = 6 * 60; atmosphere.update(life, false); const dawn = moon.material.alpha;
    life.minute = 7 * 60; atmosphere.update(life, false); const morning = visible();
    const budget = { meshes: scene.meshes.length, vertices: scene.meshes.reduce((sum: number, mesh: { getTotalVertices(): number }) => sum + mesh.getTotalVertices(), 0), lights: scene.lights.length };
    atmosphere.dispose(); const remaining = { meshes: scene.meshes.length, materials: scene.materials.length, textures: scene.textures.length };
    scene.dispose(); engine.dispose();
    return { day, dusk, night, indoors, rain, clouds, restored, dawn, morning, budget, remaining };
  });
  expect(result.day).toBe(false); expect(result.dusk.visible).toBe(true);
  expect(result.dusk.alpha).toBeGreaterThan(0); expect(result.dusk.alpha).toBeLessThan(result.night.alpha);
  expect(result.night).toEqual({ visible: true, alpha: 1 });
  expect(result.indoors).toBe(false); expect(result.rain).toBe(false); expect(result.clouds).toBe(false); expect(result.restored).toBe(true);
  expect(result.dawn).toBeGreaterThan(0); expect(result.dawn).toBeLessThan(1); expect(result.morning).toBe(false);
  expect(result.budget.meshes).toBeLessThanOrEqual(2); expect(result.budget.vertices).toBeLessThan(500); expect(result.budget.lights).toBe(0);
  expect(result.remaining).toEqual({ meshes: 0, materials: 0, textures: 0 });
});

test('night streets retain readable neutral fill while the afternoon lighting stays unchanged', async ({ page }) => {
  await page.route('**/src/main.ts*', route => route.fulfill({ contentType: 'application/javascript', body: '' }));
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const load = async (path: string): Promise<Record<string, any>> => import(/* @vite-ignore */ path);
    const { NullEngine } = await load('/node_modules/@babylonjs/core/Engines/nullEngine.js');
    const { Scene } = await load('/node_modules/@babylonjs/core/scene.js');
    const { ArcRotateCamera } = await load('/node_modules/@babylonjs/core/Cameras/arcRotateCamera.js');
    const { Vector3 } = await load('/node_modules/@babylonjs/core/Maths/math.vector.js');
    const { HemisphericLight } = await load('/node_modules/@babylonjs/core/Lights/hemisphericLight.js');
    const { DirectionalLight } = await load('/node_modules/@babylonjs/core/Lights/directionalLight.js');
    const { TransformNode } = await load('/node_modules/@babylonjs/core/Meshes/transformNode.js');
    const { Environment } = await load('/src/gameplay/environment.ts');
    const { newLife } = await load('/src/gameplay/calendar.ts');
    const engine = new NullEngine(), scene = new Scene(engine); scene.metadata = {};
    const camera = new ArcRotateCamera('test', 0, 1, 60, new Vector3(), scene);
    const hemi = new HemisphericLight('hemi', new Vector3(0, 1, 0), scene);
    new DirectionalLight('sun', new Vector3(-1, -1, 0), scene);
    const town = { root: new TransformNode('town', scene), lamps: [], heightAt: () => 0 };
    const environment = new Environment({ scene, camera, town }), life = newLife();
    environment.update(life, false); const day = { intensity: hemi.intensity, color: hemi.diffuse.asArray() };
    life.minute = 23 * 60; environment.update(life, false);
    const night = { intensity: hemi.intensity, color: hemi.diffuse.asArray() };
    environment.update(life, true); const indoors = hemi.intensity;
    life.minute = 14 * 60; environment.update(life, false); const restored = { intensity: hemi.intensity, color: hemi.diffuse.asArray() };
    scene.dispose(); engine.dispose(); return { day, night, indoors, restored };
  });
  expect(result.day.intensity).toBeCloseTo(.9); expect(result.day.color).toEqual([.8, .86, 1]);
  expect(result.night.intensity).toBeGreaterThan(.58); expect(result.night.intensity).toBeLessThan(result.day.intensity);
  // A visible red component keeps skin and cream paving readable instead of flattening them to blue.
  expect(result.night.color[0]! / result.night.color[2]!).toBeGreaterThan(.67);
  expect(result.indoors).toBe(.95); expect(result.restored).toEqual(result.day);
});
