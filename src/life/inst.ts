import { Color3, StandardMaterial, type Mesh, type Scene } from '@babylonjs/core';
import type { MeshBatch } from '../town/batch';

/**
 * Row-major 4x4 matrices (the layout of Babylon's thin-instance buffers, row vectors: v' = v * M).
 * A model's local +Z is its front; yaw turns it so that local +Z points to world (sin yaw, cos yaw).
 */

/** Ry(yaw) * T(x,y,z) with uniform scale k, written at data[o .. o+15]. */
export function setPose(d: Float32Array, o: number, x: number, y: number, z: number, yaw: number, k = 1): void {
  const c = Math.cos(yaw) * k;
  const s = Math.sin(yaw) * k;
  d[o] = c;
  d[o + 1] = 0;
  d[o + 2] = -s;
  d[o + 3] = 0;
  d[o + 4] = 0;
  d[o + 5] = k;
  d[o + 6] = 0;
  d[o + 7] = 0;
  d[o + 8] = s;
  d[o + 9] = 0;
  d[o + 10] = c;
  d[o + 11] = 0;
  d[o + 12] = x;
  d[o + 13] = y;
  d[o + 14] = z;
  d[o + 15] = 1;
}

/**
 * A part of a model that swings about its local X axis: Rx(pitch) * T(ox,oy,oz) * Ry(yaw) * T(x,y,z), uniform scale k
 * (the part's own origin is the joint / axle). Used for legs and arms (pitch = swing) and wheels (pitch = spin).
 */
export function setPart(d: Float32Array, o: number, x: number, y: number, z: number, yaw: number, k: number, ox: number, oy: number, oz: number, pitch: number): void {
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cx = Math.cos(pitch);
  const sx = Math.sin(pitch);
  d[o] = cy * k;
  d[o + 1] = 0;
  d[o + 2] = -sy * k;
  d[o + 3] = 0;
  d[o + 4] = sx * sy * k;
  d[o + 5] = cx * k;
  d[o + 6] = sx * cy * k;
  d[o + 7] = 0;
  d[o + 8] = cx * sy * k;
  d[o + 9] = -sx * k;
  d[o + 10] = cx * cy * k;
  d[o + 11] = 0;
  d[o + 12] = k * (ox * cy + oz * sy) + x;
  d[o + 13] = k * oy + y;
  d[o + 14] = k * (-ox * sy + oz * cy) + z;
  d[o + 15] = 1;
}

/** Hides an instance (all-zero matrix). */
export function hideInstance(d: Float32Array, o: number): void {
  d.fill(0, o, o + 16);
}

/** The material of the cars and people: vertex colours, lit like the town (flat shaded, two-sided). */
export function lifeMaterial(scene: Scene): StandardMaterial {
  const m = new StandardMaterial('lifeMat', scene);
  m.diffuseColor = Color3.White();
  m.specularColor = Color3.Black();
  m.backFaceCulling = false;
  m.twoSidedLighting = true;
  return m;
}

/** A template mesh drawn as thin instances; the matrices live in `data` and are re-uploaded with {@link upload}. */
export class Instances {
  readonly mesh: Mesh;
  readonly data: Float32Array;

  constructor(
    name: string,
    batch: MeshBatch,
    material: StandardMaterial,
    scene: Scene,
    readonly capacity: number,
  ) {
    this.mesh = batch.toMesh(name, scene, material);
    this.data = new Float32Array(Math.max(1, capacity) * 16);
    for (let i = 0; i < capacity; i++) hideInstance(this.data, i * 16);
    this.mesh.thinInstanceSetBuffer('matrix', this.data, 16, false);
    // the template sits at the origin while the instances are spread over the whole town: never cull by its bounds
    this.mesh.alwaysSelectAsActiveMesh = true;
    this.mesh.receiveShadows = true;
  }

  get vertexCount(): number {
    return this.mesh.getTotalVertices();
  }

  upload(): void {
    this.mesh.thinInstanceBufferUpdated('matrix');
  }
}
