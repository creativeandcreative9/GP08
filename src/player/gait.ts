import { type Bone } from '@babylonjs/core/Bones/bone.js';
import { Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { Space } from '@babylonjs/core/Maths/math.axis.js';

/**
 * Procedural walk cycle for a standard MMD bone rig.
 *
 * The legs are driven through the foot IK bones (足ＩＫ): each foot target slides back while it is on the ground
 * and swings forward with a lift, so the feet stay planted and the IK solver bends the knees.
 * The arms are posed with plain rotations (lowered from the T-pose, swinging opposite to the legs).
 * All values are in MMD units in the model's local space (the model faces −Z).
 */

const ARM_DOWN = (40 * Math.PI) / 180; // lower the arms from the T-pose
const ELBOW_BEND = (12 * Math.PI) / 180;

interface FootBones {
  ik: Bone;
  rest: Vector3;
}

export interface GaitState {
  /** 0..1 position in the walk cycle. */
  phase: number;
  /** 0 = standing, 1 = full walk. Smoothed. */
  blend: number;
}

export class Gait {
  private readonly left: FootBones;
  private readonly right: FootBones;
  private readonly center: Bone;
  private readonly centerRest: Vector3;
  private readonly upper: Bone | null;
  private readonly armL: Bone;
  private readonly armR: Bone;
  private readonly elbowL: Bone | null;
  private readonly elbowR: Bone | null;
  private readonly hipRest: Vector3;
  private readonly thighLength: number;
  readonly state: GaitState = { phase: 0, blend: 0 };
  private time = 0;

  /** Distance (units) the body travels per full cycle (two steps). */
  static readonly STRIDE = 12;

  constructor(bones: readonly Bone[]) {
    const find = (name: string): Bone | null => bones.find((b) => b.name === name) ?? null;
    const need = (name: string): Bone => {
      const b = find(name);
      if (!b) throw new Error(`bone not found: ${name}`);
      return b;
    };
    const foot = (name: string): FootBones => {
      const ik = need(name);
      return { ik, rest: ik.getRestMatrix().getTranslation() };
    };
    this.left = foot('左足ＩＫ');
    this.right = foot('右足ＩＫ');
    this.center = need('センター');
    this.centerRest = this.center.getRestMatrix().getTranslation();
    this.upper = find('上半身');
    this.armL = need('左腕');
    this.armR = need('右腕');
    this.elbowL = find('左ひじ');
    this.elbowR = find('右ひじ');
    const hip = find('左足');
    let hipMatrix = hip?.getRestMatrix().clone();
    for (let parent = hip?.getParent(); parent && hipMatrix; parent = parent.getParent()) hipMatrix = hipMatrix.multiply(parent.getRestMatrix());
    this.hipRest = hipMatrix?.getTranslation() ?? new Vector3(0, 11, 0);
    this.thighLength = find('左ひざ')?.getRestMatrix().getTranslation().length() ?? 4.5;
  }

  /** Lower the pelvis onto the seat and bring both grounded foot IK targets forward. */
  sit(dt: number, seatHeight: number): void {
    this.time += dt;
    this.state.blend = 0;
    this.state.phase = 0;
    this.center.position = this.centerRest.add(new Vector3(0, seatHeight + 0.5 - this.hipRest.y, 0));
    for (const foot of [this.left, this.right]) {
      foot.ik.position = new Vector3(foot.rest.x, foot.rest.y, this.hipRest.z - this.thighLength * 0.95);
    }
    this.upper?.setRotationQuaternion(Quaternion.FromEulerAngles(0.04 + 0.01 * Math.sin(this.time * 2.2), 0, 0), Space.LOCAL);
    for (const [arm, elbow, side] of [[this.armL, this.elbowL, 1], [this.armR, this.elbowR, -1]] as const) {
      arm.setRotationQuaternion(Quaternion.RotationAxis(Vector3.Right(), 0.35).multiply(Quaternion.RotationAxis(Vector3.Forward(), -side * Math.PI * 0.39)), Space.LOCAL);
      elbow?.setRotationQuaternion(Quaternion.RotationAxis(Vector3.Up(), side * 0.8), Space.LOCAL);
    }
  }

  /**
   * Advance the cycle and pose the bones.
   * @param dt seconds since the last frame
   * @param speed ground speed in units per second (0 when standing)
   */
  update(dt: number, speed: number): void {
    this.time += dt;
    const s = this.state;
    const target = Math.min(speed / 12, 1);
    s.blend += (target - s.blend) * Math.min(dt * 8, 1);
    if (speed > 0.01) s.phase = (s.phase + (speed * dt) / Gait.STRIDE) % 1;
    else if (s.blend < 0.02) s.phase = 0;

    const b = s.blend;
    // Stride and lift grow a little with speed (running takes longer, higher steps).
    const half = (Gait.STRIDE / 4) * Math.min(1.3, 0.75 + speed / 70);
    const lift = 0.9 + Math.min(speed / 40, 1) * 1.2;

    this.poseFoot(this.left, s.phase, half, lift, b);
    this.poseFoot(this.right, (s.phase + 0.5) % 1, half, lift, b);

    // Hips dip slightly at each footfall (twice per cycle); breathing when idle.
    const bob = -0.35 * b * (0.5 + 0.5 * Math.cos(s.phase * 4 * Math.PI));
    this.center.position = this.centerRest.add(new Vector3(0, bob, 0));

    if (this.upper) {
      const breathe = 0.012 * (1 - b) * Math.sin(this.time * 2.2);
      const twist = 0.08 * b * Math.sin(s.phase * 2 * Math.PI);
      const lean = 0.05 * b;
      this.upper.setRotationQuaternion(Quaternion.FromEulerAngles(lean + breathe, twist, 0), Space.LOCAL);
    }

    // Arms swing opposite to the legs: the left arm goes forward with the right foot.
    const swing = 0.45 * b * Math.sin(s.phase * 2 * Math.PI);
    this.poseArm(this.armL, this.elbowL, +1, swing);
    this.poseArm(this.armR, this.elbowR, -1, -swing);
  }

  private poseFoot(foot: FootBones, phase: number, half: number, lift: number, blend: number): void {
    let z: number;
    let y = 0;
    if (phase < 0.5) {
      // Stance: the foot moves from front (−Z) to back (+Z) relative to the body.
      z = -half + (phase / 0.5) * 2 * half;
    } else {
      // Swing: back to front, lifted.
      const t = (phase - 0.5) / 0.5;
      z = half - t * 2 * half;
      y = lift * Math.sin(t * Math.PI);
    }
    foot.ik.position = foot.rest.add(new Vector3(0, y * blend, z * blend));
  }

  /** side: +1 for the left arm (extends to +X), −1 for the right arm. */
  private poseArm(arm: Bone, elbow: Bone | null, side: number, swing: number): void {
    const down = Quaternion.RotationAxis(Vector3.Forward(), -side * ARM_DOWN);
    const fwd = Quaternion.RotationAxis(Vector3.Right(), swing);
    arm.setRotationQuaternion(fwd.multiply(down), Space.LOCAL);
    elbow?.setRotationQuaternion(Quaternion.RotationAxis(Vector3.Up(), side * ELBOW_BEND), Space.LOCAL);
  }
}
