import { type Scene } from '@babylonjs/core/scene.js';
import { ChunkedBatch, MeshBatch } from './batch';
import type { BlossomClouds } from './blossoms';
import type { ClothBanners } from './cloth';
import type { SignAtlas } from './signs';
import type { Rect } from './util';

/** A built named lot: building centre, front direction (axis-aligned) and half sizes along/across the front. */
export interface Spot {
  x: number;
  z: number;
  fx: number;
  fz: number;
  hu: number;
  hv: number;
}

/** Shared state while the town is being assembled. */
export interface Ctx {
  scene: Scene;
  /** Lit, vertex-coloured solid geometry (buildings, props), chunked for culling. */
  main: ChunkedBatch;
  /** Mountain forest trees (chunked). */
  forest: ChunkedBatch;
  foliage?: ChunkedBatch;
  blossoms?: BlossomClouds;
  cloth?: ClothBanners;
  /** Clipped, opaque shrubs use their own shadow offset while sharing the town material. */
  topiary?: ChunkedBatch;
  /** Signboards sharing the atlas texture (also shop interiors, posters and other picture details). */
  signs: ChunkedBatch;
  /** Window panes: transparent, with texture coordinates for the reflection streaks. */
  glass: ChunkedBatch;
  /** Ground decal layers, drawn with increasing depth bias: pads+sidewalks, lawns+ballast, asphalt+paths, markings+petals. */
  dec0: MeshBatch;
  dec1: MeshBatch;
  dec2: MeshBatch;
  dec3: MeshBatch;
  atlas: SignAtlas;
  obstacles: Rect[];
  /** Built named lots by id (shops), used for camera presets. */
  spots: Record<string, Spot>;
  home?: { x: number; z: number };
  lamps?: { x: number; y: number; z: number }[];
  report: string[];
  rnd: () => number;
}

export const DEC0_Y = 0.15;
export const DEC1_Y = 0.3;
export const DEC2_Y = 0.45;
export const DEC3_Y = 0.6;
