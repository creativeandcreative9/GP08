import { MeshBatch } from '../town/batch';
import { hex, type RGB } from '../town/util';
import { boxC, shadeRGB, taperBox } from './geom';

/**
 * Animals of the town. A small shiba-like dog (about 5 units = 40 cm at the shoulder) walked on a lead by its owner:
 * a single static mesh that the crowd bobs along (a few units are too small for swinging legs to show).
 * Local frame as for people: +Z forward, +X to the right, origin on the ground between the feet.
 */

const COAT = hex(0xd9a15e);
const CREAM = hex(0xf6ebd8);
const NOSE: RGB = [0.1, 0.08, 0.08];

export function buildDog(coat: RGB = COAT, belly: RGB = CREAM): MeshBatch {
  const b = new MeshBatch();
  const dark = shadeRGB(coat, 0.8);
  // legs (cream socks)
  for (const [x, z] of [
    [-0.85, 2.05],
    [0.85, 2.05],
    [-0.9, -2.35],
    [0.9, -2.35],
  ] as const) {
    boxC(b, x, 1.55, z, 0.46, 1.55, 0.46, coat);
    boxC(b, x, 0.36, z, 0.52, 0.36, 0.52, belly);
  }
  // body: deeper chest, light belly, a little wider over the back
  taperBox(b, 2.5, 5.05, { x0: -1.0, x1: 1.0, z0: -3.1, z1: 2.7 }, { x0: -1.28, x1: 1.28, z0: -3.3, z1: 3.0 }, coat, { bottom: belly, front: belly });
  taperBox(b, 3.0, 4.2, { x0: -0.95, x1: 0.95, z0: 2.6, z1: 3.1 }, { x0: -0.95, x1: 0.95, z0: 2.6, z1: 3.1 }, belly); // white chest
  // neck, head, muzzle, nose
  taperBox(b, 4.6, 6.0, { x0: -0.8, x1: 0.8, z0: 2.4, z1: 3.5 }, { x0: -0.72, x1: 0.72, z0: 3.1, z1: 4.0 }, coat);
  boxC(b, 0, 6.05, 4.15, 1.05, 0.95, 0.95, coat);
  boxC(b, 0, 5.75, 5.2, 0.6, 0.45, 0.55, belly);
  boxC(b, 0, 6.0, 5.82, 0.3, 0.22, 0.12, NOSE);
  // eyes and ears
  for (const sd of [-1, 1]) {
    boxC(b, sd * 0.56, 6.35, 5.03, 0.14, 0.15, 0.06, NOSE);
    taperBox(b, 6.8, 7.9, { x0: sd * 0.72 - 0.42, x1: sd * 0.72 + 0.42, z0: 3.55, z1: 4.25 }, { x0: sd * 0.78 - 0.1, x1: sd * 0.78 + 0.1, z0: 3.8, z1: 4.0 }, dark);
  }
  // tail curled over the back
  taperBox(b, 4.9, 7.0, { x0: -0.5, x1: 0.5, z0: -3.8, z1: -2.9 }, { x0: -0.38, x1: 0.38, z0: -3.2, z1: -2.3 }, coat, { top: belly });
  return b;
}
