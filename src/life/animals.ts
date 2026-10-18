import { MeshBatch } from '../town/batch';
import { hex, type RGB } from '../town/util';
import { ellipsoid, prism, shadeRGB } from './geom';
import { softLoft } from './person-geometry';

/** A small shiba-like dog, fused into the existing single mesh and whole-body trot. +Z is forward. */
const COAT = hex(0xd9a15e);
const CREAM = hex(0xf6ebd8);
const NOSE: RGB = [0.1, 0.08, 0.08];

export function buildDog(coat: RGB = COAT, belly: RGB = CREAM): MeshBatch {
  const b = new MeshBatch();
  const dark = shadeRGB(coat, 0.8);
  // Keep the four original foot centres and ground plane. Taper into the body;
  // rounded cream paws overlap the shins instead of ending in separate square blocks.
  for (const [x, z] of [[-.85, 2.05], [.85, 2.05], [-.9, -2.35], [.9, -2.35]] as const) {
    softLoft(b, [
      { y: .55, a: .33, c: .34, cx: x, cz: z },
      { y: 1.5, a: .34, c: .35, cx: x, cz: z },
      { y: 3.1, a: .46, c: .46, cx: x, cz: z },
    ], coat, { segments: 8, roundness: 2, caps: false });
    softLoft(b, [
      { y: 0, a: .46, c: .48, cx: x, cz: z },
      { y: .18, a: .52, c: .52, cx: x, cz: z },
      { y: .72, a: .38, c: .40, cx: x, cz: z },
    ], belly, { segments: 8, roundness: 2 });
  }
  // The original body envelope, with an arched back and a tucked underside.
  ellipsoid(b, 0, 3.775, -.15, 1.28, 1.275, 3.15, coat,
    { seg: 8, rings: 4, phase: 0, smooth: true, facetColor: ring => ring >= 2 ? belly : undefined });
  ellipsoid(b, 0, 3.75, 2.48, .86, 1.05, .62, belly, { seg: 8, rings: 4, phase: 0, smooth: true });
  // The ruff runs into both the shoulders and the cheeks; no isolated neck block.
  softLoft(b, [
    { y: 4.25, a: .8, c: .78, cz: 2.75 },
    { y: 5.15, a: .77, c: .82, cz: 3.12 },
    { y: 6.0, a: .72, c: .58, cz: 3.55 },
  ], coat, { segments: 8, roundness: 2, caps: false });
  ellipsoid(b, 0, 6.05, 4.15, 1.05, .95, .95, coat, { seg: 8, rings: 4, phase: 0, smooth: true });
  ellipsoid(b, 0, 5.75, 5.2, .6, .45, .55, belly, { seg: 8, rings: 4, phase: 0, smooth: true });
  ellipsoid(b, 0, 6.0, 5.82, .3, .22, .12, NOSE, { seg: 8, rings: 4, phase: 0, smooth: true });
  for (const sd of [-1, 1]) {
    ellipsoid(b, sd * .54, 5.6, 4.58, .45, .34, .43, belly, { seg: 6, rings: 4, phase: 0, smooth: true });
    // Set the eyes against the curved face rather than the former box's front plane.
    ellipsoid(b, sd * .48, 6.35, 4.965, .11, .13, .075, NOSE, { seg: 6, rings: 4, smooth: true });
    const x = sd * .72, tip = sd * .78;
    // Thick triangular ears replace the truncated square horns, at the same ear height.
    b.tri([x - .42, 6.8, 4.25], [x + .42, 6.8, 4.25], [tip, 7.9, 3.95], coat, [0, 0, 1]);
    b.tri([x + .42, 6.8, 3.55], [x - .42, 6.8, 3.55], [tip, 7.9, 3.88], dark, [0, 0, -1]);
    for (const edge of [-1, 1]) b.quad([x + edge * .42, 6.8, 3.55], [x + edge * .42, 6.8, 4.25],
      [tip, 7.9, 3.95], [tip, 7.9, 3.88], dark, [edge, 0, 0]);
  }
  // A rising root and a short return curl connect to the rounded rump. The rear
  // extent remains -3.8; all joints overlap, so the curl has no detached boxes.
  const curl = [[0, 4.1, -2.65], [0, 5.35, -3.3], [0, 6.35, -3.3],
    [0, 6.55, -2.85], [0, 6.1, -2.7]] as const;
  for (let i = 0; i < curl.length - 1; i++) prism(b, curl[i]!, curl[i + 1]!, .42, .36, 6,
    i === curl.length - 2 ? belly : coat, { cap0: false, cap1: false });
  ellipsoid(b, 0, 5.35, -3.3, .46, .5, .5, coat, { seg: 6, rings: 4, phase: 0, smooth: true });
  ellipsoid(b, 0, 6.35, -3.3, .46, .5, .45, coat, { seg: 6, rings: 4, phase: 0, smooth: true });
  ellipsoid(b, 0, 6.55, -2.85, .42, .45, .45, coat, { seg: 6, rings: 4, phase: 0, smooth: true });
  ellipsoid(b, 0, 6.1, -2.7, .32, .4, .32, belly, { seg: 6, rings: 4, phase: 0, smooth: true });
  return b;
}
