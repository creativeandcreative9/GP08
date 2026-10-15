import {
  type ArcRotateCamera,
  type Mesh,
  type Scene,
  Vector3,
} from '@babylonjs/core';
import type { MmdModel } from 'babylon-mmd/esm/Runtime/mmdModel';
import { Gait } from './gait';

export interface Footprint {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface PlayerOptions {
  scene: Scene;
  camera: ArcRotateCamera;
  model: MmdModel;
  spawn: { x: number; z: number };
  /** Ground height at x,z (world units). */
  heightAt?: (x: number, z: number) => number;
  /** Footprints the player cannot walk through. */
  obstacles?: readonly Footprint[];
}

const WALK_SPEED = 17.5; // ≈ 1.4 m/s
const RUN_SPEED = 40; // ≈ 3.2 m/s
const TURN_RATE = 10; // how quickly the body turns to the walking direction
const RADIUS = 4; // body radius for collisions
const CAMERA_HEIGHT = 14; // look-at point above the feet

/**
 * Third-person player: WASD / arrow keys walk relative to the camera, Shift runs, the mouse orbits the camera.
 * The MMD model's root mesh is moved and turned; the legs and arms are animated by {@link Gait}.
 */
export class Player {
  readonly root: Mesh;
  readonly gait: Gait;
  private readonly keys = new Set<string>();
  private heading = 0;
  private speed = 0;
  private readonly heightAt: (x: number, z: number) => number;
  private readonly obstacles: readonly Footprint[];

  constructor(private readonly opts: PlayerOptions) {
    const { scene, camera, model } = opts;
    this.root = model.mesh as unknown as Mesh;
    this.heightAt = opts.heightAt ?? (() => 0);
    this.obstacles = opts.obstacles ?? [];
    this.gait = new Gait(model.mesh.metadata.skeleton.bones);

    this.root.position.set(opts.spawn.x, this.heightAt(opts.spawn.x, opts.spawn.z), opts.spawn.z);
    this.root.rotationQuaternion = null;

    // The camera follows the player; keys move the player instead of the camera.
    camera.inputs.removeByType('ArcRotateCameraKeyboardMoveInput');
    camera.lowerRadiusLimit = 20;
    camera.upperRadiusLimit = 400;
    camera.radius = 60;
    camera.beta = 1.25;
    camera.alpha = -Math.PI / 2; // south of the player, looking north (the way the player starts facing)
    this.heading = Math.PI; // face north
    this.updateCameraTarget();

    // Listen on the window so keys work even when the canvas does not have focus.
    window.addEventListener('keydown', (e) => this.keys.add(e.code));
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    // Pose the bones before the MMD runtime solves IK and physics for this frame.
    scene.onBeforeAnimationsObservable.add(() => this.update(scene.getEngine().getDeltaTime() / 1000), undefined, true);
  }

  /** Current ground speed (units per second). */
  get currentSpeed(): number {
    return this.speed;
  }

  get position(): Vector3 {
    return this.root.position;
  }

  private input(): { x: number; z: number; run: boolean } {
    const k = this.keys;
    let f = 0;
    let r = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) f += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) f -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) r += 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) r -= 1;
    if (f === 0 && r === 0) return { x: 0, z: 0, run: false };
    // Camera forward on the ground plane, and its right-hand side (left-handed, Y up).
    const cam = this.opts.camera;
    const fwd = cam.target.subtract(cam.position);
    fwd.y = 0;
    fwd.normalize();
    const right = new Vector3(fwd.z, 0, -fwd.x);
    const dir = fwd.scale(f).add(right.scale(r)).normalize();
    return { x: dir.x, z: dir.z, run: k.has('ShiftLeft') || k.has('ShiftRight') };
  }

  update(dt: number): void {
    dt = Math.min(dt, 0.1);
    const want = this.input();
    const moving = want.x !== 0 || want.z !== 0;
    const targetSpeed = moving ? (want.run ? RUN_SPEED : WALK_SPEED) : 0;
    this.speed += (targetSpeed - this.speed) * Math.min(dt * 6, 1);
    if (this.speed < 0.05 && !moving) this.speed = 0;

    if (moving) {
      // The model faces −Z locally, so yaw θ points it at (−sinθ, −cosθ).
      const targetHeading = Math.atan2(-want.x, -want.z);
      let d = targetHeading - this.heading;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.heading += d * Math.min(dt * TURN_RATE, 1);
    }
    this.root.rotation.y = this.heading;

    if (this.speed > 0) {
      const dx = -Math.sin(this.heading) * this.speed * dt;
      const dz = -Math.cos(this.heading) * this.speed * dt;
      this.moveTo(this.root.position.x + dx, this.root.position.z + dz);
    }
    this.root.position.y = this.heightAt(this.root.position.x, this.root.position.z);

    this.gait.update(dt, this.speed);
    this.updateCameraTarget();
  }

  /** Move to x,z, sliding along building footprints instead of entering them. */
  private moveTo(x: number, z: number): void {
    const p = this.root.position;
    const blocked = (px: number, pz: number): boolean =>
      this.obstacles.some(
        (o) => px > o.minX - RADIUS && px < o.maxX + RADIUS && pz > o.minZ - RADIUS && pz < o.maxZ + RADIUS,
      );
    if (!blocked(x, z)) {
      p.x = x;
      p.z = z;
    } else if (!blocked(x, p.z)) {
      p.x = x;
    } else if (!blocked(p.x, z)) {
      p.z = z;
    }
  }

  private updateCameraTarget(): void {
    const p = this.root.position;
    this.opts.camera.target.set(p.x, p.y + CAMERA_HEIGHT, p.z);
  }
}
