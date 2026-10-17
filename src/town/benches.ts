/** The ten wooden benches beside the plaza's central path, in builder order. */
export const PLAZA_BENCHES = [-300, -180, 180, 300, 420].flatMap(z => [-52, 52].map(x => ({
  id: `plaza-bench-${x < 0 ? 'west' : 'east'}-${z}`,
  x, z, fx: x < 0 ? 1 : -1, fz: 0, seatHeight: 7,
})));
