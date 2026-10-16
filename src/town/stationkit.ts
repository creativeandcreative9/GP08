import { Color3, StandardMaterial, type Mesh, type Scene, type Texture } from '@babylonjs/core';
import { MeshBatch } from './batch';
import { quality } from '../render';
import type { Ctx } from './ctx';
import { StationTextures, type UvRect } from './stationtex';
import type { RGB, V3 } from './util';

/**
 * Everything the station interior needs besides the shared town batches: its own materials (the sun does not
 * reach the inside, so interior surfaces get a little emissive light), the textures, and the batches that feed them.
 * The meshes are created once, by `finishStation`, after all builders have run.
 */
export class StationKit {
  readonly tex: StationTextures;
  /** Vertex-coloured interior surfaces and furniture. */
  readonly room = new MeshBatch();
  /** Self-lit parts (ceiling lights, indicator lamps, displays): unlit vertex colours, they bloom. */
  readonly glow = new MeshBatch();
  /** Translucent window panes. */
  readonly glass = new MeshBatch(true);
  readonly floor = new MeshBatch(true);
  readonly ceil = new MeshBatch(true);
  readonly wallPanel = new MeshBatch(true);
  readonly wallTile = new MeshBatch(true);
  readonly tactile = new MeshBatch(true);
  readonly signs = new MeshBatch(true);
  /** Tiled platform tops (outdoors: lit by the sun like the rest of the town). */
  readonly platform = new MeshBatch(true);

  constructor(readonly scene: Scene) {
    this.tex = new StationTextures(scene);
  }

  private mat(name: string, emissive: Color3, diffuse: Color3, tex?: Texture): StandardMaterial {
    const m = new StandardMaterial(name, this.scene);
    m.diffuseColor = diffuse;
    m.specularColor = Color3.Black();
    m.emissiveColor = emissive;
    m.backFaceCulling = false;
    m.twoSidedLighting = true;
    if (tex) m.diffuseTexture = tex;
    return m;
  }

  meshes(): Mesh[] {
    const out: Mesh[] = [];
    const add = (name: string, b: MeshBatch, m: StandardMaterial): void => {
      if (!b.empty) out.push(b.toMesh(name, this.scene, m));
    };
    // warm fluorescent light: the tint cancels the blue of the sky light that leaks in, so whites stay white
    const warm = new Color3(1, 0.95, 0.86);
    const fill = (e: number): Color3 => new Color3(e * 1.05, e * 0.96, e * 0.78);
    // without the sun (low quality) the floor gets a little more lamp light so that it does not look dull
    const low = quality(this.scene.getEngine()) === 'low';
    const e = ROOM_LIGHT;
    const floorE = e * 0.12 + (low ? 0.06 : 0.01);
    add('stationroom', this.room, this.mat('stationRoomMat', fill(e), warm));
    add('stationfloor', this.floor, this.mat('stationFloorMat', fill(floorE), new Color3(1, 0.96, 0.9), this.tex.floor));
    add('stationceil', this.ceil, this.mat('stationCeilMat', new Color3(0.3, 0.33, 0.35), Color3.White(), this.tex.ceiling));
    add('stationwall', this.wallPanel, this.mat('stationWallMat', fill(e), warm, this.tex.wallPanel));
    add('stationtile', this.wallTile, this.mat('stationTileMat', fill(e), warm, this.tex.wallTile));
    add('stationtactile', this.tactile, this.mat('stationTactileMat', fill(floorE), new Color3(1, 0.96, 0.9), this.tex.tactile));
    add('stationplatform', this.platform, this.mat('stationPlatformMat', Color3.Black(), Color3.White(), this.tex.platform));
    add('stationsigns', this.signs, this.mat('stationSignMat', new Color3(0.42, 0.42, 0.42), Color3.White(), this.tex.atlas));

    const lit = new StandardMaterial('stationGlowMat', this.scene);
    lit.disableLighting = true;
    lit.diffuseColor = Color3.Black();
    lit.specularColor = Color3.Black();
    lit.emissiveColor = Color3.White();
    lit.backFaceCulling = false;
    add('stationglow', this.glow, lit);

    const glass = new StandardMaterial('stationGlassMat', this.scene);
    glass.diffuseColor = new Color3(0.86, 0.94, 1);
    glass.diffuseTexture = this.tex.glass;
    glass.useAlphaFromDiffuseTexture = true;
    glass.specularColor = new Color3(0.5, 0.5, 0.5);
    glass.specularPower = 120;
    glass.emissiveColor = new Color3(0.08, 0.1, 0.12);
    glass.backFaceCulling = false;
    glass.twoSidedLighting = true;
    add('stationglass', this.glass, glass);

    // Without shadows (low quality) the sun would shine through the roof: light the interior by lamps only.
    const sun = this.scene.getLightByName('sun');
    if (sun && low) {
      for (const m of out) if (m.name !== 'stationglow' && m.name !== 'stationplatform') sun.excludedMeshes.push(m);
    }
    return out;
  }
}

/** Emissive fill of the interior surfaces (the room is lit by lamps, not by the sun). */
export const ROOM_LIGHT = 0.16;

const kits = new WeakMap<Ctx, StationKit>();

export function stationKit(c: Ctx): StationKit {
  let k = kits.get(c);
  if (!k) {
    const t0 = performance.now();
    k = new StationKit(c.scene);
    kits.set(c, k);
    c.report.push(`station textures drawn in ${Math.round(performance.now() - t0)} ms`);
  }
  return k;
}

/** Creates the meshes of the station interior (call once, after the station has been built). */
export function finishStation(c: Ctx): Mesh[] {
  const k = kits.get(c);
  return k ? k.meshes() : [];
}

// --- small geometry helpers --------------------------------------------------------------------------

export const WHITE: RGB = [1, 1, 1];

/** A window pane (the texture coordinates follow the world coordinates, so reflections line up across panes). */
export function pane(b: MeshBatch, a: V3, bb: V3, c: V3, d: V3, hint: V3): void {
  const alongX = Math.abs(a[2] - c[2]) < 1e-6;
  const uv = (p: V3): [number, number] => [(alongX ? p[0] : p[2]) / 34, p[1] / 34];
  b.quad(a, bb, c, d, WHITE, hint, [uv(a), uv(bb), uv(c), uv(d)]);
}

/** Sign quad on a plane z = const, centred on xc, seen from the side `facing` (+1: from larger z). */
export function signZ(b: MeshBatch, uv: UvRect, xc: number, y0: number, w: number, h: number, z: number, facing: 1 | -1): void {
  const l = facing > 0 ? xc + w / 2 : xc - w / 2; // viewer's left
  const r = facing > 0 ? xc - w / 2 : xc + w / 2;
  b.quad([l, y0, z], [r, y0, z], [r, y0 + h, z], [l, y0 + h, z], WHITE, [0, 0, facing], [
    [uv.u0, uv.v0], [uv.u1, uv.v0], [uv.u1, uv.v1], [uv.u0, uv.v1],
  ]);
}

/** Sign quad on a plane x = const, centred on zc, seen from the side `facing` (+1: from larger x). */
export function signX(b: MeshBatch, uv: UvRect, zc: number, y0: number, w: number, h: number, x: number, facing: 1 | -1): void {
  const l = facing > 0 ? zc - w / 2 : zc + w / 2;
  const r = facing > 0 ? zc + w / 2 : zc - w / 2;
  b.quad([x, y0, l], [x, y0, r], [x, y0 + h, r], [x, y0 + h, l], WHITE, [facing, 0, 0], [
    [uv.u0, uv.v0], [uv.u1, uv.v0], [uv.u1, uv.v1], [uv.u0, uv.v1],
  ]);
}
