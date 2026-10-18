import { applyDiffuseLighting } from '../diffuse-lighting';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { type Scene } from '@babylonjs/core/scene.js';
import type { Avatar } from './player';
import { MeshBatch } from '../town/batch';
import { ellipsoid, mixRGB, shadeRGB } from '../life/geom';
import { personHand, personShoe, softLoft } from '../life/person-geometry';
import { buildPortrait } from '../life/people';
import { hex } from '../town/util';

/** Original, code-built character. The distributable game contains no licensed model assets. */
export function createPublicAvatar(scene: Scene): Avatar {
  const root = new Mesh('public-player', scene);
  const detail = new StandardMaterial('player-detail', scene);
  detail.diffuseColor.set(1, 1, 1); detail.specularColor.set(.06, .06, .06);
  detail.backFaceCulling = false; detail.twoSidedLighting = true;
  applyDiffuseLighting(detail);
  const skin = hex(0xf3d5bd), cloth = hex(0xf5e9d4), collar = hex(0x65847b), pants = hex(0x416b69), shoe = hex(0x52464b);
  const pivot = (name: string, x: number, y: number): TransformNode => {
    const n = new TransformNode(`player-${name}`, scene); n.parent = root; n.position.set(x, y, 0); return n;
  };
  const mesh = (name: string, b: MeshBatch, parent: TransformNode): Mesh => {
    const m = b.toMesh(`player-${name}`, scene, detail);
    m.unfreezeWorldMatrix(); m.doNotSyncBoundingInfo = false;
    m.parent = parent; return m;
  };
  const body = pivot('body', 0, 10.5);
  const portrait = new MeshBatch();
  buildPortrait(portrait, { cy: 7.8, hz: 0, rx: 1.2, ry: 1.45, rz: 1.35 }, skin, { style: 'short', color: hex(0x4c3437) }, 4.6);
  // The crowd faces +Z, while the playable rig and its controls face -Z.
  mesh('head', portrait, body).rotation.y = Math.PI;
  const shirt = new MeshBatch();
  const shirtRings = [{ y: -.75, a: 2.12, c: 1.27 }, { y: .1, a: 2.17, c: 1.31 },
    { y: 2.4, a: 2.22, c: 1.48 }, { y: 4.05, a: 2.40, c: 1.43 },
    { y: 4.52, a: 2.42, c: 1.32 }, { y: 5.6, a: 1.02, c: .84 }];
  const shirtDepth = (y: number, x: number): number => {
    const yy = Math.max(shirtRings[0]!.y, Math.min(shirtRings.at(-1)!.y, y));
    const upper = Math.max(1, shirtRings.findIndex(r => r.y >= yy)), a = shirtRings[upper - 1]!, b = shirtRings[upper]!;
    const t = (yy - a.y) / (b.y - a.y), width = a.a + (b.a - a.a) * t, depth = a.c + (b.c - a.c) * t;
    return depth * Math.max(0, 1 - Math.abs(x / width) ** 2.5) ** .4;
  };
  const front = (x: number, y: number, lift = .045): [number, number, number] => [x, y, -shirtDepth(y, x) - lift];
  softLoft(shirt, shirtRings, cloth);
  softLoft(shirt, [{ y: -.74, a: 2.14, c: 1.30 }, { y: -.49, a: 2.15, c: 1.31 }], shadeRGB(cloth, .93), { caps: false });
  shirt.tri(front(-.85, 5.46), front(-1.35, 4.7), front(0, 4.95), collar, [0, 0, -1]);
  shirt.tri(front(.85, 5.46), front(0, 4.95), front(1.35, 4.7), collar, [0, 0, -1]);
  for (const y of [4.1, 3.3, 2.5]) ellipsoid(shirt, 0, y, -shirtDepth(y, 0) - .035, .075, .075, .035, collar, { seg: 6, rings: 4, smooth: true });
  shirt.quad(front(.65, 3.25), front(1.48, 3.25), front(1.48, 4.12), front(.65, 4.12), shadeRGB(cloth, .96), [0, 0, -1]);
  shirt.quad(front(.65, 4.08, .055), front(1.48, 4.08, .055), front(1.48, 4.17, .055), front(.65, 4.17, .055), shadeRGB(cloth, .87), [0, 0, -1]);
  for (const side of [-1, 1]) shirt.tri([side * 1.8, .45, 1.07], [side * .6, .65, 1.34],
    [side * 1.7, .54, 1.15], shadeRGB(cloth, .93), [0, 0, 1]);
  // A small canvas shoulder bag gives the back view an identifiable silhouette and a useful everyday detail.
  const canvas = hex(0xb49a74), strap = hex(0x81694c);
  softLoft(shirt, [{ y: -.5, a: .60, c: .83, cx: 2.45, cz: .1 },
    { y: -.2, a: .69, c: .95, cx: 2.45, cz: .1 }, { y: 1.55, a: .65, c: .90, cx: 2.45, cz: .1 },
    { y: 1.85, a: .49, c: .76, cx: 2.45, cz: .1 }], canvas, { segments: 10 });
  const strapPath = [[-1.15, 5.17], [-.35, 4.25], [.55, 3.1], [1.35, 1.95], [2.35, .8]] as const;
  const strapPoint = (index: number, side: number, facing: number): [number, number, number] => {
    const [center, y] = strapPath[index]!, x = center + side * .145;
    const z = index === strapPath.length - 1 ? .97 : shirtDepth(y, x) + .045;
    return [x, y, facing * z];
  };
  for (const facing of [-1, 1]) {
    for (let i = 0; i < strapPath.length - 1; i++) shirt.quad(strapPoint(i, -1, facing), strapPoint(i, 1, facing),
      strapPoint(i + 1, 1, facing), strapPoint(i + 1, -1, facing), strap, [0, 0, facing]);
    shirt.quad(strapPoint(0, -1, facing), strapPoint(0, 1, facing), [-1.005, 5.65, 0], [-1.295, 5.65, 0], strap, [0, 1, facing]);
  }
  mesh('torso', shirt, body);
  const neck = new MeshBatch();
  softLoft(neck, [{ y: 5.35, a: .66, c: .61 }, { y: 6.55, a: .60, c: .59 }], shadeRGB(skin, .96), { roundness: 2 });
  mesh('neck', neck, body);
  const arms = [-1, 1].map(side => {
    const a = pivot(`arm${side}`, side * 2.8, 15.5);
    const arm = new MeshBatch();
    softLoft(arm, [{ y: .04, a: .24, c: .29 }, { y: -.34, a: .64, c: .65, cz: .03 },
      { y: -1.8, a: .60, c: .60, cz: .16 }, { y: -3.25, a: .53, c: .53, cz: .24 }], cloth);
    softLoft(arm, [{ y: -3.1, a: .56, c: .57, cz: .23 }, { y: -3.36, a: .55, c: .56, cz: .24 }], mixRGB(cloth, collar, .16));
    softLoft(arm, [{ y: -3.28, a: .49, c: .49, cz: .24 }, { y: -4.3, a: .49, c: .47, cz: -.02 },
      { y: -5.25, a: .40, c: .39, cz: -.39 }, { y: -5.95, a: .35, c: .35, cz: -.62 }], skin, { roundness: 2 });
    personHand(arm, 0, -6.4, -.64, .61, skin);
    mesh(`arm-clothes${side}`, arm, a); return a;
  });
  const legs = [-1, 1].map(side => {
    const l = pivot(`leg${side}`, side * 1.35, 10.5);
    const thigh = new MeshBatch();
    softLoft(thigh, [{ y: .02, a: 1.13, c: 1.18 }, { y: -1.5, a: 1.11, c: 1.15 },
      { y: -3.7, a: .94, c: .97 }, { y: -5.12, a: .90, c: .92 }], pants);
    mesh(`thigh${side}`, thigh, l);
    const knee = new TransformNode('player-knee', scene); knee.parent = l; knee.position.y = -5;
    const calf = new MeshBatch();
    softLoft(calf, [{ y: .08, a: .91, c: .94 }, { y: -1.3, a: 1.0, c: 1.00 },
      { y: -3.25, a: .78, c: .79 }, { y: -4.6, a: .70, c: .73 }], pants);
    softLoft(calf, [{ y: -4.25, a: .75, c: .77 }, { y: -4.64, a: .74, c: .76 }], shadeRGB(pants, 1.08));
    const first = calf.vertexCount;
    personShoe(calf, 0, -5.6, 0, 1.22, 1.4, shoe);
    // Rotate only the footwear so its toe follows this rig's -Z facing convention.
    for (let i = first; i < calf.vertexCount; i++) {
      calf.pos[i * 3] = -calf.pos[i * 3]!; calf.pos[i * 3 + 2] = -calf.pos[i * 3 + 2]!;
      calf.nor[i * 3] = -calf.nor[i * 3]!; calf.nor[i * 3 + 2] = -calf.nor[i * 3 + 2]!;
    }
    // The calf and shoe share a draw call; retain the shoe name used by seating
    // validation to inspect both articulated foot planes on every bench height.
    mesh('shoe', calf, knee); return { l, knee };
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
