import { expect, test } from '@playwright/test';
import { NullEngine, Scene } from '@babylonjs/core';
import { MeshBatch } from '../src/town/batch';
import { softLoft } from '../src/life/person-geometry';
import { buildFused, buildPerson, buildSeated } from '../src/life/people';
import { OUTFITS, STAFF } from '../src/life/outfits';
import { createPublicAvatar } from '../src/player/avatar';

test('rounded garment sections keep outward normals, Babylon winding and aligned vertex attributes in both directions', () => {
  const sections = [{ y: -3, a: .6, c: .5 }, { y: 0, a: 1.0, c: .8 }, { y: 2, a: .4, c: .6 }];
  for (const rings of [sections, [...sections].reverse()]) {
    const b = new MeshBatch(true);
    softLoft(b, rings, [.5, .6, .7]);
    expect(b.surf.length).toBe(b.vertexCount);
    expect(b.uvs.length).toBe(b.vertexCount * 2);
    expect(b.nor.length).toBe(b.pos.length);
    expect([...b.pos, ...b.nor, ...b.col].every(Number.isFinite)).toBe(true);
    for (let i = 0; i < b.nor.length; i += 3) expect(Math.hypot(...b.nor.slice(i, i + 3))).toBeCloseTo(1, 8);
    for (let i = 0; i < b.idx.length; i += 3) {
      const a = b.idx[i]! * 3, c = b.idx[i + 1]! * 3, d = b.idx[i + 2]! * 3;
      const u = [0, 1, 2].map(j => b.pos[c + j]! - b.pos[a + j]!);
      const v = [0, 1, 2].map(j => b.pos[d + j]! - b.pos[a + j]!);
      const cross = [u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!];
      expect(Math.hypot(...cross)).toBeGreaterThan(.00001);
      expect(cross.reduce((sum, n, j) => sum + n * b.nor[a + j]!, 0)).toBeLessThan(0);
    }
  }
});

test('resident templates keep their joint-relative foot plane and a bounded triangle budget across all outfits', () => {
  for (const outfit of [...OUTFITS, ...Object.values(STAFF)]) {
    const p = buildPerson(outfit), fused = buildFused(outfit), seated = buildSeated(outfit, 6.2);
    expect(Math.min(...p.leg.pos.filter((_, i) => i % 3 === 1)) + p.hipY, outfit.id).toBeCloseTo(0, 8);
    expect(Math.min(...seated.pos.filter((_, i) => i % 3 === 1)), outfit.id).toBeCloseTo(-6.2, 8);
    expect(p.body.triangleCount + 2 * p.leg.triangleCount + p.arm.triangleCount + (p.armHold ?? p.arm).triangleCount, outfit.id).toBeLessThan(5000);
    for (const b of [p.body, p.leg, p.arm, p.armHold, fused, seated].filter(b => b !== undefined)) {
      expect([...b.pos, ...b.nor, ...b.col].every(Number.isFinite), outfit.id).toBe(true);
      expect(b.surf.length, outfit.id).toBe(b.vertexCount);
      expect(b.idx.every(i => Number.isSafeInteger(i) && i >= 0 && i < b.vertexCount), outfit.id).toBe(true);
    }
  }
});

test('public clothing shares one material, receives shadows and keeps the articulated shoes at the floor when sitting', () => {
  const engine = new NullEngine(), scene = new Scene(engine);
  try {
    const avatar = createPublicAvatar(scene), meshes = avatar.root.getChildMeshes();
    expect(meshes.length).toBeLessThanOrEqual(10);
    expect(new Set(meshes.map(m => m.material)).size).toBe(1);
    expect(meshes.every(m => m.receiveShadows)).toBe(true);
    const floor = (): number => {
      for (const node of scene.transformNodes) node.computeWorldMatrix(true);
      for (const m of meshes) m.computeWorldMatrix(true);
      return Math.min(...meshes.map(m => m.getBoundingInfo().boundingBox.minimumWorld.y));
    };
    avatar.gait.update(0, 0);
    expect(floor()).toBeCloseTo(-.1, 5);
    avatar.gait.sit(0, 6.2);
    expect(floor()).toBeCloseTo(0, 5);
    avatar.gait.update(.1, 17.5);
    expect(meshes.every(m => [...m.getWorldMatrix().m].every(Number.isFinite))).toBe(true);
    avatar.gait.update(0, 0);
    expect(floor()).toBeCloseTo(-.1, 5);
  } finally { scene.dispose(); engine.dispose(); }
});
