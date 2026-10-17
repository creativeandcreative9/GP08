import { beam, type MeshBatch } from './batch';
import { discFace } from './shapes';
import { roundedFoliage } from './topiary';
import type { Ctx } from './ctx';
import { obox, person, SKIN, type PersonStyle } from './stationfolk';
import { pane, signX, signZ, type StationKit } from './stationkit';
import { BOOTH, F, GATES, HALL, OFFICE, TICKET_MACHINES, VENDING } from './stationplan';
import { hex, type RGB } from './util';
import { foliageCluster } from './leaf';
import { plantCards } from './greenery';

const GATE_BODY = hex(0xcbd0dc);
const GATE_CAP = hex(0x35455e);
const GATE_DARK = hex(0x39445f);
const KICK = hex(0x56607a);
const STEEL = hex(0xaeb4be);
const NAVY = hex(0x0f2a5c);
const WOOD = hex(0x9a7048);
const BLUE_LAMP: RGB = [0.3, 0.68, 1];
const GREEN_LAMP: RGB = [0.3, 1, 0.55];
const READER: RGB = [0.55, 0.88, 1];
const WHITE: RGB = [1, 1, 1];

const glowZ = (b: MeshBatch, x0: number, x1: number, y0: number, y1: number, z: number, facing: 1 | -1, col: RGB): void =>
  b.quad([x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z], col, [0, 0, facing]);
const glowY = (b: MeshBatch, x0: number, x1: number, z0: number, z1: number, y: number, col: RGB, up = true): void =>
  b.quad([x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1], col, [0, up ? 1 : -1, 0]);

/** One automatic ticket gate: body, card reader pad and indicator lamps at both ends. */
function gate(k: StationKit, x: number): void {
  const b = k.metal;
  const hw = GATES.machineW / 2;
  const z0 = GATES.z0;
  const z1 = GATES.z1;
  b.box(x - hw, x + hw, F, F + 1.2, z0 + 0.4, z1 - 0.4, KICK);
  b.box(x - hw + 0.2, x + hw - 0.2, F + 1.2, F + 9.6, z0 + 0.6, z1 - 0.6, GATE_BODY);
  // A small bevel catches the ceiling lights rather than leaving a sharp white box.
  const outer: [number, number][] = [[x - hw + .2, z0 + .6], [x + hw - .2, z0 + .6], [x + hw - .2, z1 - .6], [x - hw + .2, z1 - .6]];
  const inner: [number, number][] = [[x - hw + .6, z0 + 1], [x + hw - .6, z0 + 1], [x + hw - .6, z1 - 1], [x - hw + .6, z1 - 1]];
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4, a = outer[i]!, c = outer[j]!, d = inner[j]!, e = inner[i]!;
    b.quad([a[0], F + 9.6, a[1]], [c[0], F + 9.6, c[1]], [d[0], F + 10.2, d[1]], [e[0], F + 10.2, e[1]], GATE_BODY, [0, 1, 0]);
  }
  b.box(x - hw - 0.2, x + hw + 0.2, F + 10.2, F + 11.2, z0, z1, GATE_CAP, { bottom: true });
  for (const sx of [-1, 1]) b.box(x + sx * (hw - 0.2) - (sx > 0 ? 0 : 0.07), x + sx * (hw - 0.2) + (sx > 0 ? 0.07 : 0), F + 5.2, F + 6.6, z0 + 1.4, z1 - 1.4, hex(0x2f66b3));
  // IC card reader pad (entry side) and a small one at the exit side
  for (const [a, b2, entry] of [[z0 + 6, z0 + 10.2, true], [z1 - 9, z1 - 6, false]] as [number, number, boolean][]) {
    b.box(x - 2.4, x + 2.4, F + 11.2, F + 11.7, a - 0.5, b2 + 0.5, GATE_DARK);
    glowY(k.glow, x - 1.8, x + 1.8, a, b2, F + 11.73, entry ? READER : [0.7, 0.9, 1]);
  }
  // Front status panel, with an illuminated cross indicating the open lane.
  b.box(x - .75, x + .75, F + 7.8, F + 9.4, z0 + .5, z0 + .59, GATE_DARK);
  glowZ(k.glow, x - .12, x + .12, F + 8.08, F + 9.12, z0 + .48, -1, GREEN_LAMP);
  glowZ(k.glow, x - .52, x + .52, F + 8.48, F + 8.72, z0 + .47, -1, GREEN_LAMP);
  // Low indicator housings at both ends; the card reader stays flat on the cap.
  for (const end of [-1, 1] as const) {
    const za = end < 0 ? z0 + 0.8 : z1 - 4.2;
    const zb = end < 0 ? z0 + 4.2 : z1 - 0.8;
    b.box(x - 2.3, x + 2.3, F + 11.2, F + 12.1, za, zb, GATE_DARK, { bottom: true });
    glowZ(k.glow, x - 1.7, x + 1.7, F + 11.45, F + 11.9, end < 0 ? za - 0.05 : zb + 0.05, end, end < 0 ? BLUE_LAMP : GREEN_LAMP);
    const dz = end < 0 ? 1 : -1;
    const base = end < 0 ? za + 0.6 : zb - 0.6;
    k.glow.tri([x - 1.4, F + 12.15, base], [x + 1.4, F + 12.15, base], [x, F + 12.15, base + dz * 2.3], GREEN_LAMP, [0, 1, 0]);
  }
}

/** Glass screen between a gate line end and the wall. */
function fence(k: StationKit, x0: number, x1: number, z: number): void {
  k.room.box(x0, x1, F, F + 3.4, z - 0.9, z + 0.9, hex(0xdfe4ea));
  k.room.box(x0, x1, F + 11, F + 12.4, z - 1, z + 1, STEEL, { bottom: true });
  for (const x of [x0, x1 - 1.2]) k.room.box(x, x + 1.2, F, F + 12.4, z - 1, z + 1, STEEL);
  pane(k.glass, [x0, F + 3.4, z], [x1, F + 3.4, z], [x1, F + 11, z], [x0, F + 11, z], [0, 0, 1]);
}

const ATTENDANT: PersonStyle = { jacket: hex(0x25365e), trousers: hex(0x1f2a47), skin: SKIN, hair: hex(0x2a2220), cap: hex(0x25365e) };

/** The staffed gate booth with a glass front, a counter and the attendant. */
function booth(k: StationKit): void {
  const { x0, x1, z0, z1 } = BOOTH;
  const body = hex(0xe9eef4);
  k.room.box(x0, x1, F, F + 11, z0, z1, body);
  k.room.box(x0, x1, F, F + 1.2, z0 - 0.3, z1 + 0.3, KICK);
  k.room.box(x0 - 0.8, x1 + 0.8, F + 11, F + 12.4, z0 - 1.2, z1 + 0.4, hex(0x6c7a92), { bottom: true });
  const top = F + 29;
  for (const [px, pz] of [[x0, z0], [x1 - 1.6, z0], [x0, z1 - 1.6], [x1 - 1.6, z1 - 1.6]] as [number, number][]) k.room.box(px, px + 1.6, F + 12.4, top, pz, pz + 1.6, STEEL);
  // closed back and east side, glass towards the concourse and the wide lane
  k.room.box(x1 - 1.2, x1, F + 12.4, top, z0, z1, body);
  k.room.box(x0, x1, F + 12.4, top, z1 - 1.2, z1, body);
  pane(k.glass, [x0 + 0.8, F + 12.4, z0 + 0.8], [x1 - 1.6, F + 12.4, z0 + 0.8], [x1 - 1.6, top, z0 + 0.8], [x0 + 0.8, top, z0 + 0.8], [0, 0, 1]);
  pane(k.glass, [x0 + 0.8, F + 12.4, z0 + 1.6], [x0 + 0.8, F + 12.4, z1 - 1.6], [x0 + 0.8, top, z1 - 1.6], [x0 + 0.8, top, z0 + 1.6], [1, 0, 0]);
  k.room.box(x0 - 0.5, x1 + 0.5, top, top + 1.6, z0 - 0.8, z1 + 0.8, hex(0xf4f6f8), { bottom: true });
  // name board on top of the roof and on the west side
  k.room.box(x0 + 1, x1 - 1, top + 1.6, top + 8.2, z0 - 0.6, z0 + 0.6, NAVY, { bottom: true });
  signZ(k.signs, k.tex.uv('boothSign'), (x0 + x1) / 2, top + 1.7, 26, 6.5, z0 - 0.65, -1);
  k.room.box(x0 - 0.6, x0 + 0.6, top + 1.6, top + 6.2, z0 + 1, z1 - 1, NAVY, { bottom: true });
  signX(k.signs, k.tex.uv('boothSign'), (z0 + z1) / 2, top + 1.7, 17, 4.25, x0 - 0.65, -1);
  // interior: a desk with a monitor, the attendant standing behind the counter
  k.room.box(x0 + 3, x1 - 3, F + 11, F + 12.6, z1 - 6, z1 - 1.5, hex(0xb59a76));
  k.room.box(x0 + 17, x0 + 24, F + 12.6, F + 17.5, z1 - 5, z1 - 4, GATE_DARK);
  glowZ(k.glow, x0 + 17.5, x0 + 23.5, F + 13.2, F + 17, z1 - 5.05, -1, [0.6, 0.85, 1]);
  person(k.room, (x0 + x1) / 2 - 3, F, z0 + 7, Math.PI * 1.2, ATTENDANT, 0.92);
}

/** A quiet ticket-office counter: plaster shell, recessed glazing and a working desk behind it. */
function officeWindow(k: StationKit): void {
  const { x0, x1, z0, z1 } = OFFICE, wall = hex(0xb6b0b5), frame = hex(0x625651);
  const sill = F + 11, glassTop = F + 27, top = F + 37, inset = z0 + 1.3;
  k.room.box(x0, x1, F, sill, z0, z1, wall);
  k.room.box(x0, x0 + 1.3, sill, top, z0, z1, wall);
  k.room.box(x1 - 1.3, x1, sill, top, z0, z1, wall);
  k.room.box(x0, x1, sill, top, z1 - 1.3, z1, wall);
  k.room.box(x0, x1, glassTop, top, z0, z0 + 1.3, wall);
  k.room.box(x0, x1, top - 1, top, z0, z1, hex(0xa6a1a8));
  // The counter remains inside the office collision footprint.
  k.room.box(x0, x1, sill, sill + 1.1, z0, z0 + 4, hex(0x756452));
  for (const x of [x0 + 1.3, (x0 + x1) / 2, x1 - 2.1]) k.room.box(x, x + .8, sill + 1.1, glassTop, inset - .3, inset + .5, frame);
  for (const y of [sill + 1.1, glassTop - .8]) k.room.box(x0 + 1.3, x1 - 1.3, y, y + .8, inset - .3, inset + .5, frame);
  pane(k.glass, [x0 + 2.1, sill + 1.9, inset], [x1 - 2.1, sill + 1.9, inset], [x1 - 2.1, glassTop - .8, inset], [x0 + 2.1, glassTop - .8, inset], [0, 0, -1]);
  // Desk, monitor, ticket printer and papers are visible through the window.
  const center = (x0 + x1) / 2;
  k.room.box(x0 + 4, x1 - 4, F + 10.8, F + 12, z0 + 9, z0 + 18, hex(0xa1917a));
  k.room.box(center - 2, center + 2, F + 12, F + 13.4, z0 + 12, z0 + 15, GATE_DARK);
  k.room.box(center - 5, center + 3, F + 13.4, F + 19, z0 + 13.4, z0 + 14.2, GATE_DARK);
  glowZ(k.glow, center - 4.5, center + 2.5, F + 14, F + 18.5, z0 + 13.35, -1, [.48, .65, .72]);
  k.room.box(x1 - 13, x1 - 5, F + 12, F + 16.2, z0 + 11, z0 + 17, hex(0xd7d4cc));
  k.room.box(x0 + 8, x0 + 15, F + 12, F + 12.15, z0 + 10, z0 + 15, hex(0xf4f0df));
  // An original uniformed clerk works behind the desk, inside the closed office.
  person(k.room, center + 14, F, z0 + 8, Math.PI, {
    jacket: hex(0x35465c), trousers: hex(0x273446), skin: SKIN,
    hair: hex(0x322923), cap: hex(0x273950), armsForward: true,
  }, .92);
  // A small counter plant sits inside the existing office footprint.
  const plantX = x1 - 4.5, plantZ = z0 + 3;
  k.room.cylinder(plantX, plantZ, F + 12.1, F + 14.2, 1.4, 1.8, 8, hex(0xd8c8a7));
  k.room.cylinder(plantX, plantZ, F + 14.2, F + 18, .16, .12, 5, hex(0x68543e));
  roundedFoliage(k.room, plantX, F + 18.1, plantZ, 2.4, 2, 2.2, hex(0x62934e));
  roundedFoliage(k.room, plantX + .8, F + 19.8, plantZ, 1.4, 1.4, 1.4, hex(0x78a55c));
  signZ(k.signs, k.tex.uv('officeWindowSign'), center + 2, F + 29.5, 24, 6, z0 - .05, -1);
  const clock = k.tex.uv('clock');
  discFace(k.signs, [x0 + 7, F + 32.5, z0 - .08], [0, 0, -1], [0, 1, 0], 2.94, 32, [1, 1, 1], {
    cu: (clock.u0 + clock.u1) / 2, cv: (clock.v0 + clock.v1) / 2,
    ru: (clock.u1 - clock.u0) * .49, rv: (clock.v1 - clock.v0) * .49,
  });
}

/** Long fluorescent fixtures in the suspended grid ceiling. */
function ceilingLights(k: StationKit): void {
  const y = HALL.ceil - 0.08;
  for (const za of [634, 668, 699]) {
    for (let i = 0; i < 6; i++) {
      const xa = -94 + i * 33;
      k.room.box(xa, xa + 23, y - .65, y, za, za + 2.3, hex(0xc4c6ce));
      glowY(k.glow, xa + .6, xa + 22.4, za + .5, za + 1.8, y - .67, [1, .98, .92], false);
    }
  }
}

function hangingBoard(k: StationKit, name: string, xc: number, z: number, w: number, h: number, yTop: number, thick = 1.4): void {
  const y0 = yTop - h;
  k.room.box(xc - w / 2 - 0.5, xc + w / 2 + 0.5, y0 - 0.5, yTop + 0.5, z - thick / 2, z + thick / 2, NAVY, { bottom: true });
  const uv = k.tex.uv(name);
  signZ(k.signs, uv, xc, y0, w, h, z - thick / 2 - 0.05, -1);
  signZ(k.signs, uv, xc, y0, w, h, z + thick / 2 + 0.05, 1);
  for (const dx of [-w / 2 + 6, w / 2 - 6]) k.room.box(xc + dx - 0.3, xc + dx + 0.3, yTop + 0.5, HALL.ceil, z - 0.3, z + 0.3, STEEL);
}

/** A board hung from the ceiling and turned by `yaw` (0 = faces the concourse, positive = towards the west). */
function angledBoard(k: StationKit, name: string, xc: number, z: number, w: number, h: number, yTop: number, yaw: number): void {
  const t = 1.6;
  const y0 = yTop - h;
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const P = (lx: number, y: number, lz: number): [number, number, number] => [xc + lx * c + lz * s, y, z - lx * s + lz * c];
  obox(k.room, xc, z, y0 - 0.5, yTop + 0.5, w / 2 + 0.5, t / 2, yaw, NAVY, { bottom: true });
  const uv = k.tex.uv(name);
  const fz = -t / 2 - 0.05;
  k.signs.quad(P(-w / 2, y0, fz), P(w / 2, y0, fz), P(w / 2, yTop, fz), P(-w / 2, yTop, fz), WHITE, [-s, 0, -c], [
    [uv.u0, uv.v0], [uv.u1, uv.v0], [uv.u1, uv.v1], [uv.u0, uv.v1],
  ]);
  const bz = t / 2 + 0.05;
  k.signs.quad(P(w / 2, y0, bz), P(-w / 2, y0, bz), P(-w / 2, yTop, bz), P(w / 2, yTop, bz), WHITE, [s, 0, c], [
    [uv.u0, uv.v0], [uv.u1, uv.v0], [uv.u1, uv.v1], [uv.u0, uv.v1],
  ]);
  for (const lx of [-w / 2 + 6, w / 2 - 6]) {
    const p = P(lx, 0, 0);
    k.room.box(p[0] - 0.3, p[0] + 0.3, yTop + 0.5, HALL.ceil, p[2] - 0.3, p[2] + 0.3, STEEL);
  }
}

/** A board hung from the ceiling that faces west and east (for people coming along the hall). */
function sideBoard(k: StationKit, name: string, x: number, zc: number, w: number, h: number, yTop: number): void {
  const t = 1.4;
  const y0 = yTop - h;
  k.room.box(x - t / 2, x + t / 2, y0 - 0.5, yTop + 0.5, zc - w / 2 - 0.5, zc + w / 2 + 0.5, NAVY, { bottom: true });
  const uv = k.tex.uv(name);
  signX(k.signs, uv, zc, y0, w, h, x - t / 2 - 0.05, -1);
  signX(k.signs, uv, zc, y0, w, h, x + t / 2 + 0.05, 1);
  for (const dz of [-w / 2 + 4, w / 2 - 4]) k.room.box(x - 0.3, x + 0.3, yTop + 0.5, HALL.ceil, zc + dz - 0.3, zc + dz + 0.3, STEEL);
}

/** A flush door in the west wall with its name plate above (staff room, restroom). */
function westDoor(k: StationKit, zc: number, label: string): void {
  const x = HALL.x0;
  k.room.box(x, x + 0.9, F, F + 27.6, zc - 5.2, zc + 5.2, hex(0xcfd4dc));
  k.room.box(x + 0.9, x + 1.3, F, F + 26.4, zc - 4.4, zc + 4.4, hex(0x9a7a52));
  k.room.box(x + 1.3, x + 1.9, F + 12, F + 13.6, zc + 2.6, zc + 3.6, STEEL);
  signX(k.signs, k.tex.uv(label), zc, F + 28.4, 11, 11 * 0.25, x + 0.15, 1);
}

function ticketMachines(k: StationKit): void {
  const { x0, x1, w } = TICKET_MACHINES;
  for (const zc of TICKET_MACHINES.zc) {
    const hw = w / 2;
    k.room.box(x0, x1, F, F + 15, zc - hw, zc + hw, hex(0xdfe4ea));
    k.room.box(x0 - 0.3, x1, F + 15, F + 26, zc - hw, zc + hw, hex(0x26324d), { bottom: true });
    k.room.box(x0 - 0.5, x1, F + 26, F + 27, zc - hw - 0.3, zc + hw + 0.3, hex(0x2f66b3), { bottom: true });
    signX(k.signs, k.tex.uv('ticketScreen'), zc, F + 16.5, 10.5, 9.2, x0 - 0.35, -1);
    // bill and coin slots, receipt tray
    k.room.box(x0 - 0.7, x0, F + 11, F + 12.6, zc - 4, zc - 0.4, GATE_DARK);
    k.room.box(x0 - 0.7, x0, F + 11, F + 14.5, zc + 1.2, zc + 4.2, STEEL);
    k.room.box(x0 - 1.2, x0, F + 4, F + 6, zc - 3.5, zc + 3.5, GATE_DARK);
  }
  // fare chart above the machines
  signX(k.signs, k.tex.uv('fare'), 650, F + 27.6, 48, 48 / (1024 / 214), HALL.x1 - 0.1, -1);
}

/** Drink vending machines at the front wall, east end. */
function vending(k: StationKit): void {
  const uv = k.tex.uv('vending');
  for (const [xa, xb] of VENDING.x) {
    const zf = VENDING.z1;
    k.room.box(xa, xb, F, F + 22, VENDING.z0, zf, hex(0xe9ecef));
    k.room.box(xa - 0.2, xb + 0.2, F + 22, F + 23.4, VENDING.z0, zf + 0.2, hex(0xc8281e), { bottom: true });
    signZ(k.signs, uv, (xa + xb) / 2, F + 3, xb - xa - 1.8, (xb - xa - 1.8) / 0.6, zf + 0.1, 1);
  }
}

/** A bench with its back against the front wall. */
function bench(k: StationKit, x: number, z: number, len: number): void {
  const steel = hex(0x555a62);
  k.room.box(x - len / 2, x + len / 2, F + 5, F + 6.4, z - 3.2, z + 3.2, WOOD);
  k.room.box(x - len / 2, x + len / 2, F + 6.4, F + 13, z - 3.8, z - 2.6, WOOD);
  for (const dx of [-len / 2 + 2, len / 2 - 2]) k.room.box(x + dx - 0.5, x + dx + 0.5, F, F + 5, z - 2.8, z + 2.8, steel);
}

/** A bench with its back against the west wall. */
function sideBench(k: StationKit, x: number, z: number, len: number): void {
  const steel = hex(0x555a62);
  k.room.box(x - 3.2, x + 3.2, F + 5, F + 6.4, z - len / 2, z + len / 2, WOOD);
  k.room.box(x - 3.8, x - 2.6, F + 6.4, F + 13, z - len / 2, z + len / 2, WOOD);
  for (const dz of [-len / 2 + 2, len / 2 - 2]) k.room.box(x - 2.8, x + 2.8, F, F + 5, z + dz - 0.5, z + dz + 0.5, steel);
}

/** Sorted trash bins with a label each and a notice board above. */
function bins(k: StationKit, x0: number, z: number): void {
  const names = ['binBurn', 'binCan', 'binPet', 'binPaper'];
  const lids = [hex(0xc8281e), hex(0x1f6fb8), hex(0x1f9a58), hex(0xd9a21a)];
  names.forEach((n, i) => {
    const x = x0 + i * 7.2;
    k.room.box(x - 3, x + 3, F, F + 10.6, z - 3.2, z + 3.2, hex(0xb9c0cb));
    k.room.box(x - 3.1, x + 3.1, F, F + 1.4, z - 3.3, z + 3.3, hex(0x6c7480));
    k.room.box(x - 3.3, x + 3.3, F + 10.6, F + 11.8, z - 3.5, z + 3.5, lids[i]!, { bottom: true });
    k.room.box(x - 1.6, x + 1.6, F + 11.8, F + 11.9, z - 1, z + 1, hex(0x15181d));
    k.room.box(x - 0.2, x + 0.2, F + 11.8, F + 17, z + 2.4, z + 2.8, STEEL);
    signZ(k.signs, k.tex.uv(n), x, F + 17, 5.8, 4.35, z + 3.1, 1);
  });
  signZ(k.signs, k.tex.uv('binBoard'), x0 + 10.8, F + 21, 30, 30 / (512 / 96), z + 3.2, 1);
  for (const x of [x0 - 2, x0 + 23.6]) k.room.box(x - 0.3, x + 0.3, F + 11.8, F + 26.5, z + 3, z + 3.6, STEEL);
}

function plant(c: Ctx, k: StationKit, x: number, z: number, s = 1): void {
  k.room.cylinder(x, z, F, F + 6 * s, 3.4 * s, 2.8 * s, 8, hex(0xb5654a));
  k.room.cylinder(x, z, F + 6 * s, F + 6.3 * s, 3 * s, 3 * s, 8, hex(0x4a3524));
  if (c.foliage) { plantCards(c, x, F + 6 * s, z, 14 * s, 'plantRubber'); return; }
  const g = [hex(0x4fa352), hex(0x62b85a), hex(0x3f8f48)];
  g.forEach((c, i) => k.room.blob(x + (i - 1) * 1.4 * s, F + (10 + i * 2.2) * s, z + (i % 2 ? 1 : -1) * s, 3.4 * s, 3.8 * s, 3.2 * s, c, 0.1, i));
}


/** A tall vase with cherry blossom branches on a pedestal (a spring decoration). */
function sakuraVase(c: Ctx, k: StationKit, x: number, z: number): void {
  const pink = [hex(0xffc4d8), hex(0xffb3cc), hex(0xffd6e4), hex(0xff9fbf)];
  const wood = hex(0x6a4b3b);
  k.room.box(x - 3.4, x + 3.4, F, F + 9, z - 3.4, z + 3.4, hex(0xf2efe8));
  k.room.box(x - 3.8, x + 3.8, F + 9, F + 9.8, z - 3.8, z + 3.8, hex(0xd9d4c8), { bottom: true });
  k.room.cylinder(x, z, F + 9.8, F + 17, 2.8, 1.8, 8, hex(0x3b5f9a));
  const tips: [number, number, number, number][] = [
    [-4.5, 27, -2, 4.6], [4.5, 29, 1.5, 4.8], [0.5, 32, 0, 4.4], [-2, 23.5, 4.5, 4], [3.2, 24.5, -4, 4.2],
  ];
  tips.forEach(([dx, y, dz, r], i) => {
    beam(k.room, [x, F + 17, z], [x + dx, F + y - 2, z + dz], 0.7, 0.7, wood);
    if (c.foliage) {
      foliageCluster(c.foliage.at(x, z), x + dx, F + y, z + dz, r, .85, i % 2 ? 'bloomB' : 'bloomA', i * 1.3);
      foliageCluster(c.foliage.at(x, z), x + dx * .55, F + y - 4, z + dz * .55, r * .6, .8, 'bloomB', i);
    } else {
      k.room.blob(x + dx, F + y, z + dz, r, r * 0.85, r, pink[i % 4]!, 0.08, i);
      k.room.blob(x + dx * 0.55 + 0.8, F + y - 4, z + dz * 0.55, r * 0.6, r * 0.5, r * 0.6, pink[(i + 1) % 4]!, 0.08, i + 7);
    }
  });
}

/** Yellow tactile paving tiles (30 cm) on the floor. */
function tactile(k: StationKit): void {
  const t = 3.75;
  const hw = t / 2 - 0.07;
  const y = F + 0.12;
  const bars = { u0: 0.002, u1: 0.498, v0: 0.005, v1: 0.995 };
  const dots = { u0: 0.502, u1: 0.998, v0: 0.005, v1: 0.995 };
  const tile = (cx: number, cz: number, kind: 'z' | 'x' | 'dots'): void => {
    const uv = kind === 'dots' ? dots : bars;
    const c: [number, number][] =
      kind === 'x'
        ? [[uv.u0, uv.v0], [uv.u0, uv.v1], [uv.u1, uv.v1], [uv.u1, uv.v0]]
        : [[uv.u0, uv.v0], [uv.u1, uv.v0], [uv.u1, uv.v1], [uv.u0, uv.v1]];
    k.tactile.quad([cx - hw, y, cz - hw], [cx + hw, y, cz - hw], [cx + hw, y, cz + hw], [cx - hw, y, cz + hw], WHITE, [0, 1, 0], c);
  };
  const lineZ = (x: number, za: number, zb: number): void => {
    for (let z = za; z <= zb + 0.01; z += t) tile(x, z, 'z');
  };
  const lineX = (z: number, xa: number, xb: number): void => {
    for (let x = xa; x <= xb + 0.01; x += t) tile(x, z, 'x');
  };
  // warning band in front of the entrance doors
  for (let x = -15; x <= 15.01; x += t) tile(x, HALL.z0 + 3.5, 'dots');
  // guide line from the doors towards the wide gate lane
  lineZ(0, HALL.z0 + 7.8, 656.5);
  tile(0, 660.5, 'dots');
  lineX(660.5, 3.75, 32.5);
  tile(36.25, 660.5, 'dots');
  // warning band along the gates
  for (let x = GATES.machineX[0]! - 4.5; x <= 47; x += t) tile(x, GATES.z0 - 3.2, 'dots');
  // guide through the wide lane
  lineZ(36.25, GATES.z0 + 1, GATES.z1 - 1);
  // guide line to the ticket machines
  lineX(650.5, 3.75, 82.5);
  tile(86.25, 650.5, 'dots');
}

const PEOPLE: { x: number; z: number; y?: number; yaw: number; st: PersonStyle; s?: number }[] = [
  // sitting on the bench along the west wall (facing east)
  { x: HALL.x0 + 4.2, z: 650, yaw: Math.PI / 2, st: { jacket: hex(0x8fbf9a), trousers: hex(0x4a5a78), skin: SKIN, hair: hex(0x6a4a30), seated: true } },
  // on the platform side of the gates
  { x: -46, z: 699, yaw: 0, st: { jacket: hex(0x9fc8e8), trousers: hex(0x5a5f70), skin: SKIN, hair: hex(0x2a2220), bag: hex(0x3f5f9a) } },
  // waiting near the bins
  { x: 28, z: 644, yaw: Math.PI / 2, st: { jacket: hex(0xe8c860), trousers: hex(0x3d4452), skin: SKIN, hair: hex(0x241c18), bag: hex(0x6a3f2a) } },
  { x: -18, z: 653, yaw: 0.1, st: { jacket: hex(0xf2a6bf), trousers: hex(0xfaf4ec), skin: SKIN, hair: hex(0x5a3a28), skirt: true, bag: hex(0x8a5a3a) } },
  { x: 84, z: 650, yaw: Math.PI / 2, st: { jacket: hex(0x6f8fb8), trousers: hex(0x3a4660), skin: SKIN, hair: hex(0x1f1a18), armsForward: true } },
  { x: -8, z: 700, yaw: Math.PI, st: { jacket: hex(0xd9d4c4), trousers: hex(0x4a4f5a), skin: SKIN, hair: hex(0x3a2e28) } },
];

export function furnishConcourse(c: Ctx, k: StationKit): void {
  for (const x of GATES.machineX) gate(k, x);
  const zf = (GATES.z0 + GATES.z1) / 2;
  fence(k, GATES.fenceWest.x0, OFFICE.x0, zf);
  fence(k, OFFICE.x1, GATES.fenceWest.x1, zf);
  fence(k, GATES.fenceEast.x0, GATES.fenceEast.x1, zf);
  booth(k);
  officeWindow(k);
  ceilingLights(k);
  tactile(k);
  // hanging signs above the gate line: 改札口 with the platforms, and the departure board
  hangingBoard(k, 'hanging', -5, 666, 60, 60 / (1536 / 224), F + 35.5);
  angledBoard(k, 'departure', 54, 664, 40, 10, F + 35.5, 0.25);
  ticketMachines(k);
  vending(k);
  sideBoard(k, 'ticketSign', 62, 652, 24, 6, F + 34);

  // front wall: benches, bins and plants beside the entrance
  bench(k, -88, HALL.z0 + 3.6, 24);
  bench(k, 38, HALL.z0 + 3.6, 24);
  bins(k, -56, HALL.z0 + 4);
  sakuraVase(c, k, -24, HALL.z0 + 4.5);
  plant(c, k, 18, HALL.z0 + 5, 0.9);
  plant(c, k, 98, 701, 1.0);

  // west wall: timetable, notice board, benches, poster
  const wx = HALL.x0 + 0.1;
  signX(k.signs, k.tex.uv('timetable'), 634, F + 15, 15, 20, wx, 1);
  signX(k.signs, k.tex.uv('notice'), 656, F + 15, 22, 16.5, wx, 1);
  signX(k.signs, k.tex.uv('posterSakura'), 673, F + 14, 8, 11, wx, 1);
  sideBench(k, HALL.x0 + 3.8, 656, 22);
  sideBench(k, HALL.x0 + 3.8, 634, 18);
  westDoor(k, 689, 'officeSign');
  westDoor(k, 702, 'toiletSign');
  signX(k.signs, k.tex.uv('routeMap'), 698, F + 20, 22, 5.5, HALL.x1 - 0.1, -1);
  signX(k.signs, k.tex.uv('posterLost'), 676, F + 14, 7.2, 9.9, BOOTH.x1 + 0.1, 1);

  // signs above the doorways
  signZ(k.signs, k.tex.uv('platformGuide'), -61, F + 31.6, 40, 6.25, HALL.z1 - 0.12, -1);
  signZ(k.signs, k.tex.uv('platformGuide'), 0, F + 31.6, 40, 6.25, HALL.z1 - 0.12, -1);
  signZ(k.signs, k.tex.uv('exitSign'), 0, F + 31.4, 9, 4.5, HALL.z0 + 0.12, 1);

  // free-standing area map
  const map = k.tex.uv('infoMap');
  const mx = 64;
  const mz = 637;
  k.room.box(mx - 10.8, mx + 10.8, F + 5, F + 26.8, mz - 0.9, mz + 0.9, NAVY, { bottom: true });
  for (const dx of [-8, 8]) k.room.box(mx + dx - 0.5, mx + dx + 0.5, F, F + 5, mz - 0.5, mz + 0.5, STEEL);
  signZ(k.signs, map, mx, F + 5.8, 20, 20, mz - 1, -1);
  signZ(k.signs, map, mx, F + 5.8, 20, 20, mz + 1, 1);

  // the clock on the pier between the platform doorways
  signZ(k.signs, k.tex.uv('clock'), -30, F + 27, 8, 8, HALL.z1 - 0.1, -1);

  // passengers
  for (const p of PEOPLE) person(k.room, p.x, F + (p.y ?? 0), p.z, p.yaw, p.st, p.s ?? 0.92);
}

const PLATFORM_PEOPLE: { x: number; z: number; yaw: number; st: PersonStyle }[] = [
  { x: -250, z: 742, yaw: 0, st: { jacket: hex(0xe6b8c8), trousers: hex(0x4a5068), skin: SKIN, hair: hex(0x3a2a22), bag: hex(0x8a5a3a) } },
  { x: -60, z: 758, yaw: 0.2, st: { jacket: hex(0x7ea6c8), trousers: hex(0x2f3a52), skin: SKIN, hair: hex(0x1f1a18) } },
  { x: 62, z: 748, yaw: -0.3, st: { jacket: hex(0xf0d890), trousers: hex(0x56606c), skin: SKIN, hair: hex(0x5a3a28), skirt: true } },
  { x: 140, z: 754, yaw: Math.PI, st: { jacket: hex(0x9ac8a0), trousers: hex(0x3d4452), skin: SKIN, hair: hex(0x2a2220), seated: true } },
  { x: 210, z: 744, yaw: 0, st: { jacket: hex(0xc8b8e0), trousers: hex(0x4a4a5a), skin: SKIN, hair: hex(0x241c18), bag: hex(0x3f5f9a) } },
];

/** A few people waiting on the near platform (in the town batch, so that they cast shadows). */
export function platformPassengers(b: MeshBatch): void {
  for (const p of PLATFORM_PEOPLE) person(b, p.x, F, p.z, p.yaw, p.st, 0.92);
}
