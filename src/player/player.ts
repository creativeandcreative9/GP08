import { type ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera.js';
import { type Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { type Scene } from '@babylonjs/core/scene.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import type { MmdModel } from 'babylon-mmd/esm/Runtime/mmdModel';
import { Gait } from './gait';
import { SprintPace } from './sprint';
import type { RestPlace } from '../gameplay/rest';

export interface Footprint {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface PlayerOptions {
  scene: Scene;
  camera: ArcRotateCamera;
  model?: MmdModel;
  avatar?: Avatar;
  spawn: { x: number; z: number };
  /** Ground height at x,z (world units). */
  heightAt?: (x: number, z: number) => number;
  /** Footprints the player cannot walk through. */
  obstacles?: readonly Footprint[];
}

export interface Avatar {
  root: Mesh;
  gait: { update(dt: number, speed: number): void; sit(dt: number, height: number): void };
  resetPhysics?(): void;
}

const WALK_SPEED = 17.5; // ≈ 1.4 m/s
const RUN_SPEED = 40; // ≈ 3.2 m/s
const TURN_RATE = 10; // how quickly the body turns to the walking direction
const RADIUS = 4; // body radius for collisions
const CAMERA_HEIGHT = 16; // eye/shoulder height keeps the street and its skyline in view

/**
 * Third-person player: WASD / arrow keys walk relative to the camera, Shift runs, the mouse orbits the camera.
 * The MMD model's root mesh is moved and turned; the legs and arms are animated by {@link Gait}.
 */
export class Player {
  readonly root: Mesh;
  readonly gait: Avatar['gait'];
  private readonly keys = new Set<string>();
  private wantedRadius = 78;
  private appliedRadius = 78;
  private heading = 0;
  private speed = 0;
  private baseSpeed = 0;
  private readonly sprint = new SprintPace();
  private movingRun = false;
  private readonly lastPosition = new Vector3();
  private discardRunTime = false;
  private controlsEnabled = true;
  private restingAt: RestPlace | null = null;
  private readonly heightAt: (x: number, z: number) => number;
  private readonly obstacles: readonly Footprint[];
  private room: { height: number; obstacles: readonly Footprint[] } | null = null;
  private outside: { x: number; z: number } | null = null;
  private touch = { x: 0, z: 0, run: false };

  constructor(private readonly opts: PlayerOptions) {
    const { scene, camera, model } = opts;
    if (!model && !opts.avatar) throw new Error('Player requires an avatar');
    this.root = opts.avatar?.root ?? model!.mesh as unknown as Mesh;
    this.heightAt = opts.heightAt ?? (() => 0);
    this.obstacles = opts.obstacles ?? [];
    this.gait = opts.avatar?.gait ?? new Gait(model!.mesh.metadata.skeleton.bones);

    this.root.position.set(opts.spawn.x, this.heightAt(opts.spawn.x, opts.spawn.z), opts.spawn.z);
    this.lastPosition.copyFrom(this.root.position);
    this.root.rotationQuaternion = null;
    const hallLight = scene.getLightByName('station-light');
    if (hallLight) hallLight.includedOnlyMeshes.push(this.root, ...this.root.getChildMeshes());

    // The camera follows the player; keys move the player instead of the camera.
    camera.inputs.removeByType('ArcRotateCameraKeyboardMoveInput');
    camera.lowerRadiusLimit = 20;
    camera.upperRadiusLimit = 400;
    camera.radius = 78;
    camera.beta = 1.43;
    camera.alpha = -Math.PI / 2; // south of the player, looking north (the way the player starts facing)
    this.heading = Math.PI; // face north
    this.updateCameraTarget();

    const listeners = new AbortController();
    scene.onDisposeObservable.addOnce(() => listeners.abort());
    // Listen on the window so keys work even when the canvas does not have focus.
    window.addEventListener('keydown', (e) => {
      if (!this.controlsEnabled || this.restingAt || e.target instanceof HTMLElement && e.target.closest('input, textarea, select, dialog')) return;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      this.keys.add(e.code);
    }, { signal: listeners.signal });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      this.resetIfNotRunning();
    }, { signal: listeners.signal });
    const suspend = () => {
      this.clearMotion();
      // The first resumed engine delta can include the time spent away from the game.
      this.discardRunTime = true;
    };
    window.addEventListener('blur', suspend, { signal: listeners.signal });
    document.addEventListener('visibilitychange', suspend, { signal: listeners.signal });

    // Pose the bones before the MMD runtime solves IK and physics for this frame.
    scene.onBeforeAnimationsObservable.add(() => this.update(scene.getEngine().getDeltaTime() / 1000), undefined, true);
  }

  /** Current ground speed (units per second). */
  get currentSpeed(): number {
    this.checkTeleport();
    return this.speed;
  }

  /** Current continuous-run multiplier, relative to the original 40-unit run speed. */
  get runMultiplier(): number {
    this.checkTeleport();
    return this.sprint.multiplier;
  }

  /** True only while run input produces real movement; pushing a wall does not count. */
  get running(): boolean {
    this.checkTeleport();
    return this.movingRun;
  }

  get position(): Vector3 {
    return this.root.position;
  }

  get resting(): RestPlace | null { return this.restingAt; }

  /** Reload and standing both use the clear ground in front of the bench. */
  get resumePosition(): { x: number; z: number } {
    const p = this.outside ?? this.restingAt?.exit ?? this.root.position;
    return { x: p.x, z: p.z };
  }

  sit(bench: RestPlace): void {
    this.clearMotion();
    this.restingAt = bench;
    this.heading = Math.atan2(-bench.fx, -bench.fz);
    this.root.position.set(bench.x, bench.y, bench.z);
    this.lastPosition.copyFrom(this.root.position);
    this.root.rotation.y = this.heading;
    this.gait.sit(0, bench.seatHeight);
    this.updateCameraTarget();
    // Reset skirt/hair bodies after the new pose has been solved for one frame.
    this.resetPhysics();
  }

  standUp(): void {
    if (!this.restingAt) return;
    const p = this.restingAt.exit;
    this.root.position.set(p.x, p.y, p.z);
    this.lastPosition.copyFrom(this.root.position);
    this.restingAt = null;
    this.clearMotion();
    this.gait.update(0, 0);
    this.updateCameraTarget();
    this.resetPhysics();
  }

  private resetPhysics(): void {
    this.opts.scene.onAfterRenderObservable.addOnce(() => {
      this.opts.model?.initializePhysics();
      this.opts.avatar?.resetPhysics?.();
    });
  }

  setTouch(x: number, z: number, run = false): void {
    this.touch = this.controlsEnabled && !this.restingAt && !document.hidden ? { x, z, run } : { x: 0, z: 0, run: false };
    this.resetIfNotRunning();
  }

  enterRoom(x: number, z: number, height: number, obstacles: readonly Footprint[]): void {
    this.standUp();
    this.outside = { x: this.position.x, z: this.position.z };
    this.room = { height, obstacles };
    this.root.position.set(x, height, z);
    this.lastPosition.copyFrom(this.root.position);
    this.clearMotion();
    this.updateCameraTarget(); this.resetPhysics();
  }

  leaveRoom(): void {
    if (!this.outside) return;
    this.standUp();
    const p = this.outside;
    this.room = null; this.outside = null;
    this.root.position.set(p.x, this.heightAt(p.x, p.z), p.z);
    this.lastPosition.copyFrom(this.root.position);
    this.clearMotion();
    this.updateCameraTarget(); this.resetPhysics();
  }

  /** Dialogs stop movement immediately and discard held keys until the next key press. */
  setControlsEnabled(enabled: boolean): void {
    this.controlsEnabled = enabled;
    this.clearMotion();
  }

  private resetSprint(): void {
    this.sprint.reset();
    this.movingRun = false;
  }

  private clearMotion(): void {
    this.keys.clear();
    this.touch = { x: 0, z: 0, run: false };
    this.baseSpeed = this.speed = 0;
    this.resetSprint();
  }

  private resetIfNotRunning(): void {
    const want = this.input();
    if (!want.run || (want.x === 0 && want.z === 0)) {
      this.resetSprint();
      this.speed = this.baseSpeed;
    }
  }

  private checkTeleport(): void {
    if (Vector3.DistanceSquared(this.root.position, this.lastPosition) > 0.000001) {
      this.baseSpeed = this.speed = 0;
      this.resetSprint();
      this.lastPosition.copyFrom(this.root.position);
    }
  }

  private input(): { x: number; z: number; run: boolean } {
    const k = this.keys;
    let f = this.touch.z;
    let r = this.touch.x;
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
    return { x: dir.x, z: dir.z, run: this.touch.run || k.has('ShiftLeft') || k.has('ShiftRight') };
  }

  update(dt: number): void {
    this.checkTeleport();
    const elapsed = Number.isFinite(dt) && dt > 0 ? dt : 0;
    dt = Math.min(elapsed, 0.1);
    const runTime = this.discardRunTime ? 0 : elapsed;
    this.discardRunTime = false;
    if (!this.controlsEnabled || document.hidden) {
      this.clearMotion();
      this.updateCameraTarget();
      return;
    }
    if (this.restingAt) {
      this.gait.sit(dt, this.restingAt.seatHeight);
      this.updateCameraTarget();
      return;
    }
    const want = this.input();
    const moving = want.x !== 0 || want.z !== 0;
    const wantsRun = moving && want.run;
    if (!wantsRun) this.resetSprint();
    const targetSpeed = moving ? (want.run ? RUN_SPEED : WALK_SPEED) : 0;
    // Smooth the starting speed, not the multiplier: after 10 s the actual speed is 80.
    this.baseSpeed += (targetSpeed - this.baseSpeed) * Math.min(dt * 6, 1);
    if (this.baseSpeed < 0.05 && !moving) this.baseSpeed = 0;
    this.speed = this.baseSpeed * this.sprint.multiplier;

    if (moving) {
      // The model faces −Z locally, so yaw θ points it at (−sinθ, −cosθ).
      const targetHeading = Math.atan2(-want.x, -want.z);
      let d = targetHeading - this.heading;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.heading += d * Math.min(dt * TURN_RATE, 1);
    }
    this.root.rotation.y = this.heading;

    const oldX = this.root.position.x, oldZ = this.root.position.z;
    if (this.speed > 0) {
      const dx = -Math.sin(this.heading) * this.speed * dt;
      const dz = -Math.cos(this.heading) * this.speed * dt;
      this.moveTo(this.root.position.x + dx, this.root.position.z + dz);
    }
    this.root.position.y = this.room?.height ?? this.heightAt(this.root.position.x, this.root.position.z);
    if (elapsed > 0) {
      const moved = Math.hypot(this.root.position.x - oldX, this.root.position.z - oldZ) > 0.00001;
      this.movingRun = wantsRun && moved;
      this.sprint.advance(runTime, this.movingRun);
      if (!moved) this.baseSpeed = 0;
      this.speed = moved ? this.baseSpeed * this.sprint.multiplier : 0;
    }
    this.lastPosition.copyFrom(this.root.position);

    // Faster travel should still look like a readable running stride, not frantic feet.
    this.gait.update(dt, Math.min(this.speed, RUN_SPEED * 1.2));
    this.updateCameraTarget();
  }

  /** Move to x,z, sliding along building footprints instead of entering them. */
  private moveTo(x: number, z: number): void {
    const p = this.root.position;
    // Cull the town once for this move, before checking each short step and axis slide.
    const minX = Math.min(p.x, x) - RADIUS, maxX = Math.max(p.x, x) + RADIUS;
    const minZ = Math.min(p.z, z) - RADIUS, maxZ = Math.max(p.z, z) + RADIUS;
    const obstacles = (this.room?.obstacles ?? this.obstacles).filter(o =>
      o.maxX > minX && o.minX < maxX && o.maxZ > minZ && o.minZ < maxZ);
    if (!obstacles.length) { p.x = x; p.z = z; return; }
    // Check the whole segment, including shallow corner crossings whose endpoints are clear.
    const blocked = (px: number, pz: number): boolean => obstacles.some((o) => {
      let near = 0, far = 1;
      for (const [start, delta, low, high] of [
        [p.x, px - p.x, o.minX - RADIUS, o.maxX + RADIUS],
        [p.z, pz - p.z, o.minZ - RADIUS, o.maxZ + RADIUS],
      ]) {
        if (Math.abs(delta!) < 1e-10) {
          if (start! <= low! || start! >= high!) return false;
        } else {
          const a = (low! - start!) / delta!, b = (high! - start!) / delta!;
          near = Math.max(near, Math.min(a, b));
          far = Math.min(far, Math.max(a, b));
        }
      }
      return near < far && far > 0 && near < 1;
    });
    const steps = Math.max(1, Math.ceil(Math.hypot(x - p.x, z - p.z) / (RADIUS / 2)));
    const dx = (x - p.x) / steps, dz = (z - p.z) / steps;
    for (let i = 0; i < steps; i++) {
      const nextX = p.x + dx, nextZ = p.z + dz;
      if (!blocked(nextX, nextZ)) {
        p.x = nextX;
        p.z = nextZ;
      } else if (!blocked(nextX, p.z)) {
        p.x = nextX;
      } else if (!blocked(p.x, nextZ)) {
        p.z = nextZ;
      }
    }
  }

  private updateCameraTarget(): void {
    const p = this.root.position;
    const camera = this.opts.camera;
    camera.target.set(p.x, p.y + CAMERA_HEIGHT, p.z);
    if (Math.abs(camera.radius - this.appliedRadius) > .01) this.wantedRadius = camera.radius;
    const radius = this.wantedRadius;
    const dx = Math.cos(camera.alpha) * Math.sin(camera.beta) * radius;
    const dz = Math.sin(camera.alpha) * Math.sin(camera.beta) * radius;
    let limit = 1;
    for (const o of this.room?.obstacles ?? this.obstacles) {
      let near = 0, far = 1;
      for (const [start, delta, low, high] of [[p.x, dx, o.minX - 1, o.maxX + 1], [p.z, dz, o.minZ - 1, o.maxZ + 1]]) {
        if (Math.abs(delta!) < .0001) { if (start! <= low! || start! >= high!) { near = 2; break; } }
        else {
          const a = (low! - start!) / delta!, b = (high! - start!) / delta!;
          near = Math.max(near, Math.min(a, b)); far = Math.min(far, Math.max(a, b));
        }
      }
      if (near > .001 && near < far && near < limit) limit = near;
    }
    camera.lowerRadiusLimit = 6;
    camera.radius = this.appliedRadius = Math.max(6, radius * limit - (limit < 1 ? 3 : 0));
    const visibility = Math.min(1, Math.max(0, (camera.radius - 22) / 12));
    for (const mesh of [this.root, ...this.root.getChildMeshes()]) mesh.visibility = visibility;
  }
}
