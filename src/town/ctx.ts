import type { Scene } from '@babylonjs/core';
import { ChunkedBatch, MeshBatch } from './batch';
import type { SignAtlas } from './signs';
import type { Rect } from './util';

/** Shared state while the town is being assembled. */
export interface Ctx {
  scene: Scene;
  /** Lit, vertex-coloured solid geometry (buildings, props), chunked for culling. */
  main: ChunkedBatch;
  /** Mountain forest trees (chunked). */
  forest: ChunkedBatch;
  /** Signboards sharing the atlas texture. */
  signs: ChunkedBatch;
  /** Ground decal layers, drawn with increasing depth bias: pads+sidewalks, lawns+ballast, asphalt+paths, markings+petals. */
  dec0: MeshBatch;
  dec1: MeshBatch;
  dec2: MeshBatch;
  dec3: MeshBatch;
  atlas: SignAtlas;
  obstacles: Rect[];
  report: string[];
  rnd: () => number;
}

export const DEC0_Y = 0.15;
export const DEC1_Y = 0.3;
export const DEC2_Y = 0.45;
export const DEC3_Y = 0.6;
