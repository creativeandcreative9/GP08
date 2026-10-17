import { expect, test } from '@playwright/test';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { Scene } from '@babylonjs/core/scene.js';
import { MeshBatch } from '../src/town/batch';
import { Instances, lifeMaterial, setPose } from '../src/life/inst';

test('the minimal runtime imports create actual instance buffers for the visible town cast', () => {
  // Importing the Babylon barrel here would silently supply the registration missing in the public build.
  const engine = new NullEngine(), scene = new Scene(engine), batch = new MeshBatch();
  batch.box(-1, 1, 0, 2, -1, 1, [.8, .6, .5]);
  const instances = new Instances('town-cast', batch, lifeMaterial(scene), scene, 2);
  setPose(instances.data, 0, 90, 0, -25, .5);
  setPose(instances.data, 16, -10, 3, 42, -.2);
  instances.upload();
  expect(instances.mesh.thinInstanceCount).toBe(2);
  expect(instances.mesh.hasThinInstances).toBe(true);
  for (const attribute of ['world0', 'world1', 'world2', 'world3']) expect(instances.mesh.isVerticesDataPresent(attribute)).toBe(true);
  const matrices = instances.mesh.thinInstanceGetWorldMatrices();
  expect(matrices[0]!.getTranslation().asArray()).toEqual([90, 0, -25]);
  expect(matrices[1]!.getTranslation().asArray()).toEqual([-10, 3, 42]);
  scene.dispose(); engine.dispose();
});
