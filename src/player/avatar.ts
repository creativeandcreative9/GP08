import { applyDiffuseLighting } from '../diffuse-lighting';
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { type Scene } from '@babylonjs/core/scene.js';
import type { Avatar } from './player';
import { MeshBatch } from '../town/batch';
import { roundedOctBand as octBand } from '../life/geom';
import { buildPortrait } from '../life/people';
import { hex } from '../town/util';

/** Original, code-built character. The distributable game contains no licensed model assets. */
export function createPublicAvatar(scene: Scene): Avatar {
  const root = new Mesh('public-player', scene);
  const paint = (name: string, hex: string): StandardMaterial => {
    const m = new StandardMaterial(`player-${name}`, scene);
    m.diffuseColor = Color3.FromHexString(hex); m.specularColor.set(.08, .08, .08);
    applyDiffuseLighting(m);
    return m;
  };
  const skin = paint('skin', '#f3d5bd');
  const top = paint('shirt', '#f5e9d4'), pants = paint('trousers', '#416b69'), shoe = paint('shoes', '#52464b');
  const pivot = (name: string, x: number, y: number): TransformNode => {
    const n = new TransformNode(`player-${name}`, scene); n.parent = root; n.position.set(x, y, 0); return n;
  };
  const box = (name: string, w: number, h: number, d: number, material: StandardMaterial, parent: TransformNode, y: number, z = 0): Mesh => {
    const b = new MeshBatch(), white = [1, 1, 1] as const;
    const bevel = Math.min(w, d) * .22;
    octBand(b, { y: -h / 2, a: w / 2, c: d / 2, k: bevel }, { y: h / 2, a: w / 2, c: d / 2, k: bevel }, white, { top: white, bottom: white });
    const m = b.toMesh(`player-${name}`, scene, material);
    m.unfreezeWorldMatrix(); m.doNotSyncBoundingInfo = false;
    m.parent = parent; m.position.set(0, y, z); return m;
  };
  const body = pivot('body', 0, 10.5);
  const detail = paint('detail', '#ffffff'); detail.backFaceCulling = false; detail.twoSidedLighting = true;
  const portrait = new MeshBatch();
  buildPortrait(portrait, { cy: 7.8, hz: 0, rx: 1.2, ry: 1.45, rz: 1.35 }, hex(0xf3d5bd), { style: 'short', color: hex(0x4c3437) }, 4.6);
  // The crowd faces +Z, while the playable rig and its controls face -Z.
  const head = portrait.toMesh('player-head', scene, detail); head.unfreezeWorldMatrix(); head.doNotSyncBoundingInfo = false;
  head.parent = body; head.rotation.y = Math.PI;
  const shirt = new MeshBatch(), cloth = hex(0xf5e9d4), collar = hex(0x65847b);
  const sections = [{ y: -.75, a: 2.2, c: 1.3, k: .4 }, { y: 2.4, a: 2.4, c: 1.5, k: .5 }, { y: 5.0, a: 2.45, c: 1.35, k: .55 }, { y: 5.6, a: 1.1, c: .85, k: .35 }];
  for (let i = 0; i < sections.length - 1; i++) octBand(shirt, sections[i]!, sections[i + 1]!, cloth, i === sections.length - 2 ? { top: cloth } : {});
  shirt.tri([-1.1, 5.65, -.92], [-1.45, 4.7, -1.44], [0, 4.95, -1.48], collar, [0, 0, -1]);
  shirt.tri([1.1, 5.65, -.92], [0, 4.95, -1.48], [1.45, 4.7, -1.44], collar, [0, 0, -1]);
  const torso = shirt.toMesh('player-torso', scene, detail); torso.unfreezeWorldMatrix(); torso.doNotSyncBoundingInfo = false; torso.parent = body;
  box('neck', 1.3, 1.2, 1.25, skin, body, 5.95);
  const arms = [-1, 1].map(side => {
    const a = pivot(`arm${side}`, side * 2.8, 15.5);
    box('sleeve', 1.7, 3.5, 1.8, top, a, -1.75);
    box('hand', 1.35, 3.8, 1.4, skin, a, -5.2); return a;
  });
  const legs = [-1, 1].map(side => {
    const l = pivot(`leg${side}`, side * 1.35, 10.5);
    box('thigh', 2.3, 5.1, 2.4, pants, l, -2.55);
    const knee = new TransformNode('player-knee', scene); knee.parent = l; knee.position.y = -5;
    box('calf', 2, 4.8, 2.1, pants, knee, -2.4);
    box('shoe', 2.3, 1.4, 3.5, shoe, knee, -4.9, -.65); return { l, knee };
  });
  for (const mesh of root.getChildMeshes()) mesh.receiveShadows = true;
  let phase = 0;
  return { root, gait: {
    update(dt, speed) {
      phase += dt * speed / 12 * Math.PI * 2;
      const swing = Math.sin(phase) * Math.min(1, speed / 17.5) * .6;
      body.position.y = 10.5 - Math.abs(Math.sin(phase)) * .25 * Math.min(1, speed / 17.5);
      arms.forEach((a, i) => { a.position.y = 15.5; a.rotation.x = swing * (i ? 1 : -1); });
      legs.forEach(({ l, knee }, i) => { l.position.y = 10.5; l.rotation.x = swing * (i ? -1 : 1); knee.rotation.x = Math.max(0, -l.rotation.x) * .6; });
    },
    sit(_dt, height) {
      body.position.y = height + .8;
      arms.forEach(a => { a.position.y = height + 5.8; a.rotation.x = .55; });
      const bend = Math.acos(Math.max(0, Math.min(1, (height + .8 - 5.6) / 5)));
      legs.forEach(({ l, knee }) => { l.position.y = height + .8; l.rotation.x = bend; knee.rotation.x = -bend; });
    },
  } };
}
