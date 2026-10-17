import { PLATFORM } from './platform';
import type { Rect } from './util';

/**
 * Plan of the station building (world units, +x east, +z north, +y up). Pure data and functions (no Babylon), so
 * that the builder, the obstacles and the tests all agree.
 *
 * The building stands on the south platform; its front faces the plaza (-z). The middle part is the concourse
 * (改札コンコース): entrance doors in the front wall, a line of ticket gates across the hall, and openings in
 * the back wall towards the platform. The two wings beside it are solid (offices and storage).
 */
export const F = PLATFORM.h;

export const BLD = {
  x0: PLATFORM.hall.x0,
  x1: PLATFORM.hall.x1,
  /** Outer face of the front wall (plaza side). */
  z0: PLATFORM.hall.z0,
  /** Outer face of the back wall (platform side). */
  z1: 710,
  /** Wall thickness. */
  wall: 2,
  /** Top of the walls (the roof starts here). */
  top: F + 50,
  /** Centre line of the building (the roof ridge). */
  cz: 664,
} as const;

/** The concourse: interior faces of the walls. */
export const HALL = {
  x0: -104,
  x1: 104,
  z0: BLD.z0 + BLD.wall,
  z1: BLD.z1 - BLD.wall,
  /** Underside of the ceiling. */
  ceil: F + 38,
} as const;

export interface Opening {
  x0: number;
  x1: number;
  /** Heights above the floor (F) of the bottom and the top of the opening. */
  y0: number;
  y1: number;
  /** door = open doorway down to the floor, window = glazed with a sill. */
  kind: 'door' | 'window';
}

/** Openings in the front (plaza side) wall of the hall. */
export const FRONT_OPENINGS: readonly Opening[] = [
  { x0: -98, x1: -22, y0: 8, y1: 33, kind: 'window' },
  { x0: -16, x1: 16, y0: 0, y1: 30, kind: 'door' },
  { x0: 22, x1: 98, y0: 8, y1: 33, kind: 'window' },
];

/** Openings in the back (platform side) wall of the hall. */
export const BACK_OPENINGS: readonly Opening[] = [
  { x0: -100, x1: -84, y0: 8, y1: 33, kind: 'window' },
  { x0: -84, x1: -38, y0: 0, y1: 31, kind: 'door' },
  { x0: -22, x1: 22, y0: 0, y1: 31, kind: 'door' },
  { x0: 22, x1: 100, y0: 8, y1: 33, kind: 'window' },
];

/** The line of automatic ticket gates across the hall. */
export const GATES = {
  /** Entry end (concourse side) and exit end (platform side) of the machines. */
  z0: 672,
  z1: 688,
  /** Machine centres (x), machine body width. */
  machineX: [-22.5, -7.5, 7.5, 22.5] as readonly number[],
  machineW: 6,
  /** Centre lines of the lanes between the machines. */
  laneX: [-15, 0, 15] as readonly number[],
  /** The wide lane next to the staffed booth. */
  wide: { x0: 25.5, x1: 46 },
  /** Fence panels closing the gate line to the side walls. */
  fenceWest: { x0: HALL.x0, x1: -25.5 },
  fenceEast: { x0: 74, x1: HALL.x1 },
} as const;

/** The staffed gate booth (有人改札). */
export const BOOTH = { x0: 46, x1: 74, z0: 672, z1: 690 } as const;

/** Glazed station office beside the smaller gate bank; the public counter faces the hall. */
export const OFFICE = { x0: -83.5, x1: -41.5, z0: 662, z1: 690 } as const;

/** Ticket vending machines along the east wall of the concourse. */
export const TICKET_MACHINES = {
  x0: 92,
  x1: HALL.x1,
  zc: [636, 650, 664] as readonly number[],
  w: 13.4,
} as const;

/** Drink vending machines against the front wall, east end (x ranges). */
export const VENDING = {
  x: [[80, 91.5], [92.5, HALL.x1]] as readonly (readonly [number, number])[],
  z0: HALL.z0 + 0.4,
  z1: HALL.z0 + 9,
} as const;

/** Furniture that blocks the way (simple footprints). */
export const FURNITURE: readonly Rect[] = [
  // benches at the front wall, sorted trash bins, plants beside the doors
  { minX: -100, maxX: -76, minZ: HALL.z0, maxZ: HALL.z0 + 7 },
  { minX: 26, maxX: 50, minZ: HALL.z0, maxZ: HALL.z0 + 7 },
  { minX: -59.5, maxX: -29.5, minZ: HALL.z0, maxZ: HALL.z0 + 7.4 },
  { minX: -28, maxX: -20, minZ: HALL.z0, maxZ: HALL.z0 + 8.4 },
  { minX: 14.6, maxX: 21.4, minZ: HALL.z0 + 1.6, maxZ: HALL.z0 + 8.4 },
  // benches along the west wall and the area map stand
  { minX: HALL.x0, maxX: HALL.x0 + 7.6, minZ: 625, maxZ: 643 },
  { minX: HALL.x0, maxX: HALL.x0 + 7.6, minZ: 645, maxZ: 667 },
  { minX: 53, maxX: 75, minZ: 636, maxZ: 638 },
  // plant in the paid area
  { minX: 94.5, maxX: 101.5, minZ: 697.5, maxZ: 704.5 },
];

const rect = (minX: number, maxX: number, minZ: number, maxZ: number): Rect => ({ minX, maxX, minZ, maxZ });

/** Solid parts of a wall running along x, between openings (given by x ranges that stay open). */
function wallRuns(x0: number, x1: number, z0: number, z1: number, open: readonly { x0: number; x1: number }[]): Rect[] {
  const out: Rect[] = [];
  let x = x0;
  for (const o of [...open].sort((a, b) => a.x0 - b.x0)) {
    if (o.x0 > x) out.push(rect(x, o.x0, z0, z1));
    x = Math.max(x, o.x1);
  }
  if (x < x1) out.push(rect(x, x1, z0, z1));
  return out;
}

/**
 * Collision footprints of the building: the solid wings, the walls of the concourse with the entrance doors and
 * the openings to the platform, the gate machines (the lanes between them stay passable), the booth, the fences,
 * the ticket machines and the furniture.
 */
export function stationObstacles(): Rect[] {
  const doorsFront = FRONT_OPENINGS.filter((o) => o.kind === 'door');
  const doorsBack = BACK_OPENINGS.filter((o) => o.kind === 'door');
  const out: Rect[] = [
    // solid wings
    rect(BLD.x0, HALL.x0, BLD.z0, BLD.z1),
    rect(HALL.x1, BLD.x1, BLD.z0, BLD.z1),
    ...wallRuns(HALL.x0, HALL.x1, BLD.z0, HALL.z0, doorsFront),
    ...wallRuns(HALL.x0, HALL.x1, HALL.z1, BLD.z1, doorsBack),
  ];
  // gate machines: a narrow core so that the lanes between them are wide enough for the player
  for (const x of GATES.machineX) out.push(rect(x - 1, x + 1, GATES.z0 + 1, GATES.z1 - 1));
  const zf = (GATES.z0 + GATES.z1) / 2;
  out.push(
    rect(GATES.fenceWest.x0, GATES.fenceWest.x1, zf - 1, zf + 1),
    rect(GATES.fenceEast.x0, GATES.fenceEast.x1, zf - 1, zf + 1),
    rect(BOOTH.x0, BOOTH.x1, BOOTH.z0, BOOTH.z1),
    rect(OFFICE.x0, OFFICE.x1, OFFICE.z0, OFFICE.z1),
  );
  for (const z of TICKET_MACHINES.zc) out.push(rect(TICKET_MACHINES.x0, TICKET_MACHINES.x1, z - TICKET_MACHINES.w / 2, z + TICKET_MACHINES.w / 2));
  for (const [xa, xb] of VENDING.x) out.push(rect(xa, xb, VENDING.z0, VENDING.z1));
  out.push(...FURNITURE);
  return out;
}
