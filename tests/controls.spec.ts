import { expect, test } from '@playwright/test';

test.use({ hasTouch: true });

test('the touch stick clears movement on cancellation, dialogs and blur', async ({ page }) => {
  await page.route('**/src/main.ts*', route => route.fulfill({ contentType: 'application/javascript', body: '' }));
  await page.goto('/'); await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(async () => {
    await import(/* @vite-ignore */ '/src/style.css');
    const path = '/src/player/touch.ts'; const { touchControls } = await import(/* @vite-ignore */ path) as typeof import('../src/player/touch');
    const moves: number[][] = [];
    (window as unknown as { moves: number[][] }).moves = moves;
    touchControls({ setTouch(x: number, z: number, run: boolean) { moves.push([x, z, Number(run)]); } } as unknown as import('../src/player/player').Player);
  });
  const pad = page.locator('.touch-pad'); const bounds = (await pad.boundingBox())!;
  const event = { pointerId: 9, pointerType: 'touch', clientX: bounds.x + 92, clientY: bounds.y + 56 };
  // Real pointer capture is exercised through the browser's mouse pointer; pointer cancellation uses the same handler.
  await page.mouse.move(event.clientX, event.clientY); await page.mouse.down();
  expect(await page.evaluate(() => (window as unknown as { moves: number[][] }).moves.at(-1)![0])).toBeGreaterThan(.5);
  await page.mouse.up();
  expect(await page.evaluate(() => (window as unknown as { moves: number[][] }).moves.at(-1)!.slice(0, 2))).toEqual([0, 0]);
  await page.mouse.down(); await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  expect(await page.evaluate(() => (window as unknown as { moves: number[][] }).moves.at(-1)!.slice(0, 2))).toEqual([0, 0]);
  await page.mouse.up();
  await page.evaluate(() => { const dialog = document.createElement('dialog'); document.body.append(dialog); dialog.showModal(); });
  await expect(page.locator('.touch-controls')).toBeHidden();
  expect(await page.evaluate(() => (window as unknown as { moves: number[][] }).moves.at(-1)!.slice(0, 2))).toEqual([0, 0]);
});

test('the camera stops before a wall and restores its zoom after leaving the wall', async ({ page }) => {
  await page.route('**/src/main.ts*', route => route.fulfill({ contentType: 'application/javascript', body: '' })); await page.goto('/');
  const result = await page.evaluate(async () => {
    const load = async (path: string): Promise<Record<string, any>> => import(/* @vite-ignore */ path);
    const { NullEngine } = await load('/node_modules/@babylonjs/core/Engines/nullEngine.js');
    const { Scene } = await load('/node_modules/@babylonjs/core/scene.js');
    const { ArcRotateCamera } = await load('/node_modules/@babylonjs/core/Cameras/arcRotateCamera.js');
    const { Vector3 } = await load('/node_modules/@babylonjs/core/Maths/math.vector.js');
    const { Player } = await load('/src/player/player.ts'); const { createPublicAvatar } = await load('/src/player/avatar.ts');
    const engine = new NullEngine(), scene = new Scene(engine), camera = new ArcRotateCamera('test', 0, 1, 60, new Vector3(), scene);
    const player = new Player({ scene, camera, avatar: createPublicAvatar(scene), spawn: { x: 0, z: 0 }, obstacles: [{ minX: -30, maxX: 30, minZ: -25, maxZ: -12 }] });
    const near = camera.radius, nearVisibility = Math.max(...[player.root, ...player.root.getChildMeshes()].map(m => m.visibility));
    player.position.z = 100; player.update(0); const far = camera.radius, farVisibility = player.root.visibility;
    scene.dispose(); engine.dispose(); return { near, far, nearVisibility, farVisibility };
  });
  expect(result.near).toBeLessThan(12); expect(result.near).toBeGreaterThanOrEqual(6); expect(result.far).toBeCloseTo(60);
  expect(result.nearVisibility).toBe(0); expect(result.farVisibility).toBe(1);
});

test('night lighting and rain follow the saved clock and weather, including entering and leaving a room', async ({ page }) => {
  await page.route('**/src/main.ts*', route => route.fulfill({ contentType: 'application/javascript', body: '' })); await page.goto('/');
  const result = await page.evaluate(async () => {
    const load = async (path: string): Promise<Record<string, any>> => import(/* @vite-ignore */ path);
    const { NullEngine } = await load('/node_modules/@babylonjs/core/Engines/nullEngine.js');
    const { Scene } = await load('/node_modules/@babylonjs/core/scene.js');
    const { ArcRotateCamera } = await load('/node_modules/@babylonjs/core/Cameras/arcRotateCamera.js');
    const { Vector3 } = await load('/node_modules/@babylonjs/core/Maths/math.vector.js');
    const { HemisphericLight } = await load('/node_modules/@babylonjs/core/Lights/hemisphericLight.js');
    const { DirectionalLight } = await load('/node_modules/@babylonjs/core/Lights/directionalLight.js');
    const { MeshBuilder } = await load('/node_modules/@babylonjs/core/Meshes/meshBuilder.js');
    const { TransformNode } = await load('/node_modules/@babylonjs/core/Meshes/transformNode.js');
    const { Environment } = await load('/src/gameplay/environment.ts'); const { newLife } = await load('/src/gameplay/calendar.ts');
    const engine = new NullEngine(), scene = new Scene(engine), camera = new ArcRotateCamera('test', 0, 1, 60, new Vector3(), scene); scene.metadata = {};
    const { StandardMaterial } = await load('/node_modules/@babylonjs/core/Materials/standardMaterial.js');
    const glass = new StandardMaterial('glassMat', scene);
    const hemi = new HemisphericLight('hemi', new Vector3(0, 1, 0), scene); new DirectionalLight('sun', new Vector3(-1, -1, 0), scene);
    const sky = MeshBuilder.CreateBox('sky', {}, scene); sky.setVerticesData('color', new Array(sky.getTotalVertices() * 4).fill(1), true);
    const town = { root: new TransformNode('town', scene), lamps: [{ x: 0, y: 44, z: 0 }], heightAt: () => 0 };
    const environment = new Environment({ scene, camera, town }), life = newLife();
    environment.update(life, false); const day = hemi.intensity, dayColor = sky.getVerticesData('color')[0];
    life.minute = 23 * 60; environment.update(life, false);
    const night = { intensity: hemi.intensity, color: sky.getVerticesData('color')[0], lamp: scene.getMeshByName('night-lantern-0').isEnabled(), windowWarm: glass.emissiveColor.r > glass.emissiveColor.b };
    life.weather = 'rain'; environment.update(life, false); const rain = scene.particleSystems.find((p: { name: string }) => p.name === 'rain'); const rainy = rain.isStarted();
    const puddles = scene.getMeshByName('wet-road'), wet = puddles.isEnabled();
    environment.update(life, true); const indoorWet = puddles.isEnabled();
    environment.update(life, false); const restarted = rain.isStarted() && puddles.isEnabled();
    life.weather = 'clear'; environment.update(life, false); const dry = !puddles.isEnabled();
    scene.dispose(); engine.dispose(); return { day, dayColor, night, rainy, restarted, wet, indoorWet, dry };
  });
  expect(result.night.intensity).toBeLessThan(result.day); expect(result.night.color).toBeLessThan(result.dayColor);
  expect(result.night.lamp).toBe(true); expect(result.rainy).toBe(true); expect(result.restarted).toBe(true);
  expect(result.night.windowWarm).toBe(true); expect(result.wet).toBe(true); expect(result.indoorWet).toBe(false); expect(result.dry).toBe(true);
});

test('a room has solid counters, usable chairs and an exit back to the same outside position', async ({ page }) => {
  await page.route('**/src/main.ts*', route => route.fulfill({ contentType: 'application/javascript', body: '' })); await page.goto('/');
  const result = await page.evaluate(async () => {
    const load = async (path: string): Promise<Record<string, any>> => import(/* @vite-ignore */ path);
    const { NullEngine } = await load('/node_modules/@babylonjs/core/Engines/nullEngine.js');
    const { Scene } = await load('/node_modules/@babylonjs/core/scene.js');
    const { ArcRotateCamera } = await load('/node_modules/@babylonjs/core/Cameras/arcRotateCamera.js');
    const { Vector3 } = await load('/node_modules/@babylonjs/core/Maths/math.vector.js');
    const { TransformNode } = await load('/node_modules/@babylonjs/core/Meshes/transformNode.js');
    const { Player } = await load('/src/player/player.ts'); const { createPublicAvatar } = await load('/src/player/avatar.ts');
    const { Interiors } = await load('/src/gameplay/interiors.ts');
    const engine = new NullEngine(), scene = new Scene(engine), camera = new ArcRotateCamera('test', 0, 1, 60, new Vector3(), scene);
    const town = { root: new TransformNode('town', scene), heightAt: () => 0 };
    const player = new Player({ scene, camera, avatar: createPublicAvatar(scene), spawn: { x: 3, z: 8 } });
    const rooms = new Interiors({ scene, camera, town, rendering: { quality: 'low', addShadowCaster() {} } }, player);
    rooms.enter({ id: 'w-cafe', name: '喫茶店', x: 3, y: 0, z: 8, kind: 'shop', line: '' });
    camera.getViewMatrix(true); player.setTouch(0, 1);
    for (let i = 0; i < 420; i++) player.update(1 / 60);
    player.setTouch(0, 0);
    const counter = { x: player.position.x, y: player.position.y, z: player.position.z, action: rooms.action };
    player.position.set(16036, 2000, 15956); const seat = rooms.rest;
    if (!seat) throw new Error('chair cannot be approached');
    player.sit(seat); const safe = player.resumePosition; player.standUp(); const standing = { x: player.position.x, z: player.position.z };
    rooms.leave(); const outside = { x: player.position.x, y: player.position.y, z: player.position.z };
    const removed = scene.meshes.every((m: { name: string }) => !m.name.startsWith('room-')) && scene.getLightByName('room-light') === null;
    scene.dispose(); engine.dispose(); return { counter, safe, standing, outside, removed };
  });
  expect(result.counter.y).toBe(2000); expect(result.counter.z).toBeGreaterThan(15998); expect(result.counter.z).toBeLessThanOrEqual(16021); expect(result.counter.action).toBe('shop');
  expect(result.safe).toEqual({ x: 3, z: 8 }); expect(result.standing).toEqual({ x: 16036, z: 15956 }); expect(result.outside).toEqual({ x: 3, y: 0, z: 8 }); expect(result.removed).toBe(true);
});
