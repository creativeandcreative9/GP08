import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { type Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { type TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { type Scene } from '@babylonjs/core/scene.js';
import { MeshBatch } from '../town/batch';

/** Small original food models, made from code; they share materials within this room. */
export function shopGoods(scene: Scene, root: TransformNode, shop: string, shadow: (mesh: Mesh) => void): void {
  const materials = new Map<string, StandardMaterial>();
  const material = (color: string): StandardMaterial => {
    let m = materials.get(color);
    if (!m) {
      m = new StandardMaterial(`room-goods-${color}`, scene); m.diffuseColor = Color3.FromHexString(color);
      m.specularColor.set(.12, .12, .12); materials.set(color, m);
    }
    return m;
  };
  const place = (m: Mesh, color: string, x: number, y: number, z: number): Mesh => {
    m.unfreezeWorldMatrix(); m.parent = root; m.position.set(x, y, z); m.material = material(color); m.isPickable = false; shadow(m); return m;
  };
  const cylinder = (name: string, x: number, y: number, z: number, top: number, bottom: number, height: number, color: string): Mesh =>
    place(MeshBuilder.CreateCylinder(name, { diameterTop: top, diameterBottom: bottom, height, tessellation: 12 }, scene), color, x, y, z);
  const cup = (x: number, y: number, z: number, tea = false): void => {
    cylinder('room-saucer', x, y, z, 2.4, 2.2, .15, '#efe8d8');
    cylinder('room-cup', x, y + .85, z, 1.5, 1.1, 1.6, '#f8f2df');
    cylinder('room-drink', x, y + 1.67, z, 1.3, 1.3, .04, tea ? '#778a4b' : '#513525');
    const handle = place(MeshBuilder.CreateTorus('room-cup-handle', { diameter: .85, thickness: .17, tessellation: 10 }, scene), '#f8f2df', x + .9, y + .85, z);
    handle.rotation.x = Math.PI / 2;
  };
  for (const x of [-20, 0, 20]) {
    if (shop === 'e-wagashi') {
      for (const offset of [-3.2, 0, 3.2]) {
        const stick = cylinder('room-dango-stick', x + offset, 16.3, 31.7, .12, .12, 5.6, '#b59362'); stick.rotation.x = Math.PI / 2;
        ['#d898ab', '#efe6d1', '#8aab69'].forEach((color, n) => {
          place(MeshBuilder.CreateSphere('room-dango', { diameter: 1.1, segments: 8 }, scene), color, x + offset, 16.83, 31 + n * 1.1);
        });
      }
    } else if (shop === 'w-cafe') {
      cup(x - 2.5, 16.2, 32); cup(x + 2.5, 16.2, 32);
    } else {
      for (const offset of [-3.2, 0, 3.2]) {
        const data = new MeshBatch(), white = [1, 1, 1] as const;
        for (const side of [-1, 1]) data.tri([-1.5, 0, side * .7], [1.5, 0, side * .7], [0, 2.6, side * .7], white, [0, 0, side]);
        data.quad([-1.5, 0, -.7], [0, 2.6, -.7], [0, 2.6, .7], [-1.5, 0, .7], white);
        data.quad([0, 2.6, -.7], [1.5, 0, -.7], [1.5, 0, .7], [0, 2.6, .7], white);
        data.quad([-1.5, 0, -.7], [-1.5, 0, .7], [1.5, 0, .7], [1.5, 0, -.7], white, [0, -1, 0]);
        place(data.toMesh('room-onigiri', scene, material('#f8f3e6')), '#f8f3e6', x + offset, 16.2, 32);
        place(MeshBuilder.CreateBox('room-nori', { width: 1.2, height: 1.1, depth: 1.46 }, scene), '#30483a', x + offset, 16.75, 32);
      }
    }
  }
  if (shop !== 'w-conbini') cup(36, 11.5, -14, shop === 'e-wagashi');
}
