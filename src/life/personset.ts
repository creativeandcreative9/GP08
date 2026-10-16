import type { Scene, StandardMaterial } from '@babylonjs/core';
import type { Rendering } from '../render';
import type { MeshBatch } from '../town/batch';
import { buildPerson, buildSeated, type Outfit, type PersonParts } from './people';
import { hideInstance, Instances, setPart, setPose } from './inst';

/** Swing of the legs and arms at full stride (radians) */
const LEG_AMP = 0.52;
const ARM_AMP = 0.42;

/**
 * All the thin-instance meshes of one outfit: the body, one leg mesh (two instances per person) and one arm mesh
 * (two instances per person, or the left arm here and the right arm in `hold`). `write` poses one person.
 */
export class PersonSet {
  readonly parts: PersonParts;
  readonly body: Instances;
  readonly legs: Instances;
  readonly arms: Instances;
  readonly hold?: Instances;
  /** No bob / arm swing (carrying a cane) */
  readonly fixedArm: boolean;

  constructor(
    scene: Scene,
    mat: StandardMaterial,
    rendering: Rendering,
    readonly outfit: Outfit,
    readonly capacity: number,
  ) {
    const p = buildPerson(outfit);
    this.parts = p;
    const id = outfit.id;
    this.body = new Instances(`life_p_${id}_body`, p.body, mat, scene, capacity);
    this.legs = new Instances(`life_p_${id}_leg`, p.leg, mat, scene, capacity * 2);
    this.fixedArm = outfit.cane === true;
    if (p.armHold) {
      this.arms = new Instances(`life_p_${id}_arm`, p.arm, mat, scene, capacity);
      this.hold = new Instances(`life_p_${id}_armR`, p.armHold, mat, scene, capacity);
    } else {
      this.arms = new Instances(`life_p_${id}_arm`, p.arm, mat, scene, capacity * 2);
    }
    for (const m of this.meshes()) rendering.addShadowCaster(m.mesh);
  }

  meshes(): Instances[] {
    const out = [this.body, this.legs];
    if (!this.outfit.staticArms) out.push(this.arms);
    if (this.hold && !this.outfit.staticArms) out.push(this.hold);
    return out;
  }

  get vertexCount(): number {
    let n = 0;
    for (const m of [this.body, this.legs, this.arms, this.hold]) if (m) n += m.vertexCount;
    return n;
  }

  /**
   * Poses person `slot`: feet at (x, y, z), facing `yaw`, uniform scale `k`. `phase` is the walk cycle (radians),
   * `swing` scales the limb swing (0 = standing).
   */
  write(slot: number, x: number, y: number, z: number, yaw: number, k: number, phase: number, swing: number): void {
    const p = this.parts;
    const s = Math.sin(phase) * swing;
    const legA = LEG_AMP * s;
    const bob = this.fixedArm ? 0 : -p.hipY * 0.62 * (1 - Math.cos(legA));
    setPose(this.body.data, slot * 16, x, y + bob * k, z, yaw, k);
    setPart(this.legs.data, slot * 2 * 16, x, y + bob * k, z, yaw, k, p.dims.hipX, p.hipY, 0, legA);
    setPart(this.legs.data, (slot * 2 + 1) * 16, x, y + bob * k, z, yaw, k, -p.dims.hipX, p.hipY, 0, -legA);
    if (this.outfit.staticArms) return;
    const armA = this.fixedArm ? 0 : ARM_AMP * s;
    if (this.hold) {
      // left arm swings freely, the right one carries something: it swings less
      setPart(this.arms.data, slot * 16, x, y + bob * k, z, yaw, k, -p.shoulderX, p.shoulderY, 0.1, -armA);
      setPart(this.hold.data, slot * 16, x, y + bob * k, z, yaw, k, p.shoulderX, p.shoulderY, 0.1, this.fixedArm ? 0 : armA * 0.45);
    } else {
      setPart(this.arms.data, slot * 2 * 16, x, y + bob * k, z, yaw, k, -p.shoulderX, p.shoulderY, 0.1, -armA);
      setPart(this.arms.data, (slot * 2 + 1) * 16, x, y + bob * k, z, yaw, k, p.shoulderX, p.shoulderY, 0.1, armA);
    }
  }

  /** Takes person `slot` out of the scene */
  hide(slot: number): void {
    hideInstance(this.body.data, slot * 16);
    for (const k of [slot * 2, slot * 2 + 1]) hideInstance(this.legs.data, k * 16);
    if (this.hold) {
      hideInstance(this.arms.data, slot * 16);
      hideInstance(this.hold.data, slot * 16);
    } else {
      for (const k of [slot * 2, slot * 2 + 1]) hideInstance(this.arms.data, k * 16);
    }
  }

  upload(): void {
    for (const m of this.meshes()) m.upload();
  }
}

/** One seated person (a single static mesh per outfit and seat height, one or more instances). */
export class SeatedSet {
  readonly body: Instances;

  constructor(scene: Scene, mat: StandardMaterial, rendering: Rendering, readonly outfit: Outfit, seatH: number, capacity: number) {
    this.body = new Instances(`life_s_${outfit.id}_${seatH}`, buildSeated(outfit, seatH), mat, scene, capacity);
    rendering.addShadowCaster(this.body.mesh);
  }

  write(slot: number, x: number, seatY: number, z: number, yaw: number, k = 1): void {
    setPose(this.body.data, slot * 16, x, seatY, z, yaw, k);
  }

  hide(slot: number): void {
    hideInstance(this.body.data, slot * 16);
  }

  upload(): void {
    this.body.upload();
  }
}

/**
 * A figure drawn as one static mesh: shop and station staff (who stand at their post) and animals. `gait` bobs a
 * walking animal along with its stride.
 */
export class FusedSet {
  readonly body: Instances;

  constructor(scene: Scene, mat: StandardMaterial, rendering: Rendering, id: string, batch: MeshBatch, capacity: number) {
    this.body = new Instances(`life_f_${id}`, batch, mat, scene, capacity);
    rendering.addShadowCaster(this.body.mesh);
  }

  write(slot: number, x: number, y: number, z: number, yaw: number, k = 1): void {
    setPose(this.body.data, slot * 16, x, y, z, yaw, k);
  }

  /** A trotting animal: bobs and pitches twice per stride cycle (`phase`); `swing` 0 = standing still */
  gait(slot: number, x: number, y: number, z: number, yaw: number, k: number, phase: number, swing: number): void {
    const s = Math.sin(phase);
    setPart(this.body.data, slot * 16, x, y + Math.abs(s) * 0.45 * swing * k, z, yaw, k, 0, 0, 0, Math.cos(phase) * 0.05 * swing);
  }

  hide(slot: number): void {
    hideInstance(this.body.data, slot * 16);
  }

  upload(): void {
    this.body.upload();
  }
}
