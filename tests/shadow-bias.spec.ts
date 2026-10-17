import { expect, test } from '@playwright/test';

test('curved foliage and moving actors use their own shadow offset while thin walls keep the town setting', async ({ page }) => {
  await page.route('**/src/main.ts*', route => route.fulfill({ contentType: 'application/javascript', body: '' }));
  await page.goto('/?gfx=high');
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const result = await page.evaluate(async () => {
    const load = async (path: string): Promise<Record<string, any>> => import(/* @vite-ignore */ path);
    const { Engine } = await load('/node_modules/@babylonjs/core/Engines/engine.js');
    const { Scene } = await load('/node_modules/@babylonjs/core/scene.js');
    const { FreeCamera } = await load('/node_modules/@babylonjs/core/Cameras/freeCamera.js');
    const { Vector3 } = await load('/node_modules/@babylonjs/core/Maths/math.vector.js');
    const { DirectionalLight } = await load('/node_modules/@babylonjs/core/Lights/directionalLight.js');
    const { StandardMaterial } = await load('/node_modules/@babylonjs/core/Materials/standardMaterial.js');
    const { MeshBuilder } = await load('/node_modules/@babylonjs/core/Meshes/meshBuilder.js');
    const { setupRendering } = await load('/src/render.ts');
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128; document.body.append(canvas);
    const engine = new Engine(canvas, false), scene = new Scene(engine);
    const camera = new FreeCamera('camera', new Vector3(0, 4, -12), scene); camera.setTarget(new Vector3(0, 1, 0)); camera.minZ = .1; camera.maxZ = 60;
    const sun = new DirectionalLight('sun', new Vector3(-.4, -1, .3).normalize(), scene);
    const material = new StandardMaterial('paint', scene);
    const wall = MeshBuilder.CreateBox('thin-wall', { size: 1 }, scene); wall.position.x = -2;
    const shrub = MeshBuilder.CreateSphere('rounded-shrub', { diameter: 1.5, segments: 8 }, scene);
    const actor = MeshBuilder.CreateBox('moving-actor', { size: 1 }, scene); actor.position.x = 2;
    const ground = MeshBuilder.CreateGround('ground', { width: 20, height: 20 }, scene); ground.position.y = -1;
    for (const mesh of [wall, shrub, actor, ground]) mesh.material = material;
    shrub.metadata = { shadowNormalBias: .14 };
    const rendering = setupRendering(scene, camera, sun, [wall, shrub], [ground]); rendering.addShadowCaster(actor);
    const shadow = sun.getShadowGenerator(), offsets: Record<string, number[]> = {};
    let current = '';
    shadow.onBeforeShadowMapRenderMeshObservable.add((mesh: any) => { current = mesh.name; });
    shadow.onBeforeShadowMapRenderObservable.add((effect: any) => {
      const location = effect.getUniform('biasAndScaleSM'), program = effect.getPipelineContext()?.program;
      if (!location || !program) return;
      // Read the actual WebGL uniform after the renderer's observer has overridden Babylon's defaults.
      const value = engine._gl.getUniform(program, location);
      if (value) (offsets[current] ??= []).push(value[1]);
    });
    scene.render(); await scene.whenReadyAsync(); scene.render(); scene.render();
    const global = shadow.normalBias;
    scene.dispose(); engine.dispose(); canvas.remove(); return { offsets, global };
  });
  expect(errors).toEqual([]); expect(result.global).toBeCloseTo(.012);
  for (const [name, expected] of [['thin-wall', .012], ['rounded-shrub', .14], ['moving-actor', .14]] as const) {
    expect(result.offsets[name]?.length, JSON.stringify(result)).toBeGreaterThan(0);
    for (const value of result.offsets[name]!) expect(value).toBeCloseTo(expected);
  }
});
