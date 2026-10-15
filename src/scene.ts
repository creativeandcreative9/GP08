import {
  ArcRotateCamera,
  Color3,
  Color4,
  DirectionalLight,
  type Engine,
  HemisphericLight,
  MeshBuilder,
  Scene,
  StandardMaterial,
  Vector3,
} from '@babylonjs/core';

export interface GameScene {
  scene: Scene;
  camera: ArcRotateCamera;
}

/** Build the stage-0 scene. Later modules can extend the returned scene. */
export function createScene(engine: Engine, canvas: HTMLCanvasElement): GameScene {
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.64, 0.84, 0.96, 1); // light spring-sky blue

  const camera = new ArcRotateCamera('camera', -Math.PI / 2, Math.PI / 3, 40, new Vector3(0, 2, 0), scene);
  camera.lowerRadiusLimit = 5;
  camera.upperRadiusLimit = 120;
  camera.upperBetaLimit = Math.PI / 2 - 0.05;
  camera.attachControl(canvas, true);

  const hemi = new HemisphericLight('hemi', new Vector3(0, 1, 0), scene);
  hemi.intensity = 0.55;
  hemi.groundColor = new Color3(0.35, 0.4, 0.3);
  const sun = new DirectionalLight('sun', new Vector3(-1, -2, -1), scene);
  sun.intensity = 0.5;

  const ground = MeshBuilder.CreateGround('ground', { width: 200, height: 200 }, scene);
  const groundMat = new StandardMaterial('groundMat', scene);
  groundMat.diffuseColor = new Color3(0.4, 0.58, 0.32);
  groundMat.specularColor = Color3.Black();
  ground.material = groundMat;

  // Placeholder "houses"
  const houseColors = [new Color3(0.9, 0.8, 0.7), new Color3(0.8, 0.6, 0.5), new Color3(0.85, 0.85, 0.9), new Color3(0.7, 0.5, 0.4)];
  const positions: [number, number][] = [[-12, 0], [0, 8], [12, -4], [-6, -14]];
  positions.forEach(([x, z], i) => {
    const house = MeshBuilder.CreateBox(`house${i}`, { width: 6, height: 4 + (i % 2) * 2, depth: 5 }, scene);
    house.position.set(x, house.getBoundingInfo().boundingBox.extendSize.y, z);
    const mat = new StandardMaterial(`houseMat${i}`, scene);
    mat.diffuseColor = houseColors[i % houseColors.length]!;
    mat.specularColor = Color3.Black();
    house.material = mat;
  });

  return { scene, camera };
}
