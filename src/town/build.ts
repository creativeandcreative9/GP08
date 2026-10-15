import { Color3, Mesh, StandardMaterial, TransformNode, type Scene } from '@babylonjs/core';
import { ChunkedBatch, MeshBatch } from './batch';
import type { Ctx } from './ctx';
import { LOTS } from './layout';
import { buildClouds } from './clouds';
import { buildLots } from './lots';
import { buildPlaza, buildRailway, buildRoads, buildStation, buildCrossings } from './network';
import { buildAvenues, buildForest, buildPoles, buildTrail } from './props';
import { SignAtlas } from './signs';
import { buildSummit } from './summit';
import { createTerrainMeshes, heightAt } from './terrain';
import { makeRng, type Rect } from './util';

export type Footprint = Rect;

export interface Town {
  root: TransformNode;
  /** Ground height (world units) at x,z: flat town at 0, beach sloping into the sea, mountain up to SUMMIT.height. */
  heightAt(x: number, z: number): number;
  /** Building footprints (axis-aligned, world units) the player must not walk through. */
  obstacles: readonly Footprint[];
  /** Observation deck on the summit (walking surface). */
  summitDeck: { x: number; z: number; y: number };
  /** Build notes: clipped lots, counts, geometry statistics. */
  report: readonly string[];
}

function vertexColourMaterial(scene: Scene, name: string, zOffset = 0, zUnits = 0): StandardMaterial {
  const m = new StandardMaterial(name, scene);
  m.diffuseColor = Color3.White();
  m.specularColor = Color3.Black();
  m.backFaceCulling = false;
  m.twoSidedLighting = true;
  if (zOffset) {
    m.zOffset = zOffset;
    m.zOffsetUnits = zUnits;
  }
  return m;
}

export function buildTown(scene: Scene): Town {
  const t0 = performance.now();
  const root = new TransformNode('town', scene);

  const labels = ['駅', '海辺の公園', '公園'];
  for (const l of LOTS) if (l.kind !== 'home' || l.floors >= 3) labels.push(l.label);

  const c: Ctx = {
    scene,
    main: new ChunkedBatch(1800),
    forest: new ChunkedBatch(1800),
    signs: new ChunkedBatch(1800, true),
    dec0: new MeshBatch(),
    dec1: new MeshBatch(),
    dec2: new MeshBatch(),
    dec3: new MeshBatch(),
    atlas: new SignAtlas(scene, labels),
    obstacles: [],
    report: [],
    rnd: makeRng(20260415),
  };

  const terrain = createTerrainMeshes(scene);
  terrain.ground.parent = root;
  terrain.sea.parent = root;

  let last = 0;
  const budget: string[] = [];
  const mark = (name: string): void => {
    const now = c.main.vertexCount + c.forest.vertexCount + c.signs.vertexCount;
    budget.push(`${name} ${now - last}`);
    last = now;
  };
  buildRoads(c);
  buildCrossings(c);
  buildRailway(c);
  mark('railway');
  buildStation(c);
  buildPlaza(c);
  mark('station+plaza');
  buildLots(c);
  mark('lots');
  const summit = buildSummit(c);
  const trail = buildTrail(c);
  mark('summit');
  const avenues = buildAvenues(c);
  mark('avenues');
  const poles = buildPoles(c);
  mark('poles+wires');
  const forest = buildForest(c, trail);
  mark('forest');
  c.report.push(`vertices by stage: ${budget.join(', ')}`);
  c.report.push(`cherry trees on avenues/plaza: ${avenues}, utility poles: ${poles.poles}, forest trees: ${forest}`);

  const mainMat = vertexColourMaterial(scene, 'townMat');
  const d0 = vertexColourMaterial(scene, 'decal0', -1, -2);
  const d1 = vertexColourMaterial(scene, 'decal1', -2, -4);
  const d2 = vertexColourMaterial(scene, 'decal2', -3, -6);
  const d3 = vertexColourMaterial(scene, 'decal3', -4, -8);
  const meshes: Mesh[] = [
    ...c.main.toMeshes('town', scene, mainMat),
    ...c.forest.toMeshes('forest', scene, mainMat),
    ...c.signs.toMeshes('signs', scene, c.atlas.material),
    c.dec0.toMesh('decals0', scene, d0),
    c.dec1.toMesh('decals1', scene, d1),
    c.dec2.toMesh('decals2', scene, d2),
    c.dec3.toMesh('decals3', scene, d3),
    buildClouds().toMesh('clouds', scene, mainMat),
  ];
  for (const m of meshes) m.parent = root;
  for (const mat of [mainMat, d0, d1, d2, d3]) mat.freeze();

  let verts = terrain.vertexCount;
  let tris = 0;
  for (const m of meshes) {
    verts += m.getTotalVertices();
    tris += m.getTotalIndices() / 3;
  }
  c.report.push(`town meshes: ${meshes.length + 2} (+ sky), vertices ${verts}, triangles ${tris}, built in ${Math.round(performance.now() - t0)} ms`);

  return { root, heightAt, obstacles: c.obstacles, summitDeck: summit.deck, report: c.report };
}
