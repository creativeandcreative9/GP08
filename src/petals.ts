import { Color4, DynamicTexture, ParticleSystem, Texture, Vector3, type Matrix, type Particle, type Scene } from '@babylonjs/core';

/** Most petals alive at once. */
const CAPACITY = 900;
/** Petals are born inside a disc of this radius around the viewer (world units; 1 unit ≈ 8 cm). */
const RADIUS = 330;
/** They start about this high above the ground (the height of the cherry crowns) and fall down to it. */
const TOP = 115;
/** Mean fall speed (units per second): a petal sinks at about half a metre per second. */
const FALL = 7;
/** Petals born per second at full strength; with the fall time this keeps about 600 of them in the air. */
const RATE = 38;
/** Sideways flutter (units per second). */
const SWAY = 5.5;
/** Above this height over the ground the petals are switched off (aerial views), fully on below the lower one. */
const ALT_OFF = 650;
const ALT_ON = 300;

const TAU = Math.PI * 2;
const frac = (v: number): number => v - Math.floor(v);
/** Stable pseudo-random number in [0,1) per particle id and channel. */
const hash = (id: number, k: number): number => frac(Math.sin(id * 12.9898 + k * 78.233) * 43758.5453);
const smooth = (a: number, b: number, v: number): number => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** A small pink cherry petal with the notch at its tip and a soft gradient, drawn once (alpha texture). */
function createPetalTexture(scene: Scene): DynamicTexture {
  const size = 64;
  const tex = new DynamicTexture('petalTexture', { width: size, height: size }, scene, true, Texture.TRILINEAR_SAMPLINGMODE);
  const g = tex.getContext() as CanvasRenderingContext2D;
  g.clearRect(0, 0, size, size);
  const petal = (): void => {
    g.beginPath();
    g.moveTo(32, 60); // the narrow base
    g.bezierCurveTo(10, 52, 3, 24, 17, 9); // left side up to the left lobe
    g.quadraticCurveTo(24, 3, 30, 12); // left lobe down into the notch
    g.lineTo(32, 17);
    g.lineTo(34, 12);
    g.quadraticCurveTo(40, 3, 47, 9); // notch up to the right lobe
    g.bezierCurveTo(61, 24, 54, 52, 32, 60); // right side back to the base
    g.closePath();
  };
  petal();
  const grad = g.createRadialGradient(32, 56, 2, 32, 30, 36);
  grad.addColorStop(0, '#ee86aa');
  grad.addColorStop(0.4, '#ffbdd3');
  grad.addColorStop(1, '#fff1f6');
  g.fillStyle = grad;
  g.fill();
  // a slightly deeper rim and a faint vein from the base
  g.lineWidth = 2;
  g.strokeStyle = 'rgba(238,134,170,0.55)';
  petal();
  g.stroke();
  g.beginPath();
  g.moveTo(32, 58);
  g.lineTo(32, 24);
  g.lineWidth = 1.2;
  g.strokeStyle = 'rgba(232,112,152,0.4)';
  g.stroke();
  tex.hasAlpha = true;
  tex.update(true);
  return tex;
}

/**
 * Cherry petals drifting down around the viewer: a CPU particle system whose spawn volume follows the active camera
 * (so there are always a few hundred petals around you, wherever you are). Each petal sinks slowly, is carried by a
 * wandering breeze, flutters from side to side and tumbles (turns in the picture and flips about its own axis).
 * Nothing is emitted when the camera is high above the ground, so the aerial views stay clean.
 */
export function createFallingPetals(scene: Scene): void {
  const texture = createPetalTexture(scene);
  const ps = new ParticleSystem('fallingPetals', CAPACITY, scene);
  ps.particleTexture = texture;
  ps.blendMode = ParticleSystem.BLENDMODE_STANDARD;
  const emitter = new Vector3();
  ps.emitter = emitter; // follows the camera, see below

  // one particle age unit = one second (at 60 frames per second the engine scales by the real frame time)
  ps.updateSpeed = 1 / 60;
  ps.emitRate = 0;
  ps.minLifeTime = 10;
  ps.maxLifeTime = 20; // overwritten per petal in startPositionFunction
  ps.minSize = 0.9;
  ps.maxSize = 2.0;
  ps.minInitialRotation = 0;
  ps.maxInitialRotation = TAU;
  ps.minAngularSpeed = -3;
  ps.maxAngularSpeed = 3;
  ps.color1 = new Color4(1, 0.9, 0.94, 1);
  ps.color2 = new Color4(1, 1, 1, 1);
  ps.colorDead = new Color4(1, 0.9, 0.94, 1);
  ps.gravity = new Vector3(0, 0, 0);
  ps.minEmitPower = 1;
  ps.maxEmitPower = 1;
  ps.billboardMode = ParticleSystem.BILLBOARDMODE_ALL;

  // ---- state shared by the frame hook and the particle callbacks --------------------------------
  const camPos = new Vector3();
  const lastCam = new Vector3();
  const centre = new Vector3(); // where petals are born (a little ahead of a moving viewer)
  const velocity = new Vector3();
  let time = 0;
  let strength = 0;
  let seeding = false; // true while the first batch is being created: spread over the whole height
  let seedPending = false;
  let needSeed = true;
  let haveLast = false;
  let windX = 0;
  let windZ = 0;

  const heightAt = (x: number, z: number): number => {
    const town = (scene.metadata as { town?: { heightAt(x: number, z: number): number } } | null)?.town;
    return town ? town.heightAt(x, z) : 0;
  };

  ps.startPositionFunction = (_world: Matrix, out: Vector3, particle: Particle): void => {
    const a = Math.random() * TAU;
    const rr = RADIUS * Math.pow(Math.random(), 0.6); // denser close to the viewer
    const x = centre.x + Math.cos(a) * rr;
    const z = centre.z + Math.sin(a) * rr;
    const top = TOP * (0.85 + 0.3 * Math.random());
    const fall = FALL * (0.65 + 0.7 * hash(particle.id, 3));
    const h = seeding ? Math.random() * top : top;
    out.copyFromFloats(x, heightAt(x, z) + h, z);
    particle.lifeTime = (top / fall) * 1.5 + 2;
    particle.age = seeding ? (top - h) / fall : 0;
  };

  // per-petal motion on top of the standard particle update (which integrates direction, angle and colour)
  const baseUpdate = ps.updateFunction;
  ps.updateFunction = (particles: Particle[]): void => {
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i]!;
      const id = p.id;
      const age = p.age;
      const h1 = hash(id, 1);
      const h2 = hash(id, 2);
      const h3 = hash(id, 3);
      const h4 = hash(id, 4);
      const w = age * (1.1 + 1.3 * h1) + h2 * TAU;
      const sway = SWAY * (0.45 + h4);
      const fall = FALL * (0.65 + 0.7 * h3);
      p.direction.x = windX + sway * Math.sin(w);
      p.direction.z = windZ + sway * Math.cos(w * 0.8 + h4 * TAU);
      p.direction.y = -fall * (0.85 + 0.15 * Math.sin(w * 1.7 + h1 * TAU));
      // the petal turns over as it falls: its apparent width goes from the full petal down to a thin edge and back
      p.scale.x = 0.25 + 0.75 * Math.abs(Math.cos(age * (1.5 + 1.8 * h4) + h1 * TAU));
      // fade in after birth and out at the end, and away from the viewer (not right in the face, not far away)
      const dx = p.position.x - camPos.x;
      const dy = p.position.y - camPos.y;
      const dz = p.position.z - camPos.z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      p.color.a =
        smooth(0, 1.5, age) * (1 - smooth(p.lifeTime - 2.5, p.lifeTime, age)) * smooth(14, 40, d) * (1 - smooth(RADIUS * 0.72, RADIUS, d));
      // landed, or left far behind the viewer: let the standard update recycle it
      if (d > RADIUS * 1.6 || p.position.y < heightAt(p.position.x, p.position.z) + 0.4) p.age = p.lifeTime;
    }
    baseUpdate(particles);
  };

  ps.start();

  scene.onBeforeRenderObservable.add(() => {
    const cam = scene.activeCamera;
    if (!cam) return;
    const dt = Math.min(0.25, scene.getEngine().getDeltaTime() / 1000);
    time += dt;
    camPos.copyFrom(cam.globalPosition);
    // a breeze that wanders slowly
    windX = 4.5 + 3.2 * Math.sin(time * 0.17) + 1.4 * Math.sin(time * 0.61 + 2);
    windZ = 1.5 + 2.4 * Math.sin(time * 0.13 + 1) + 1.1 * Math.sin(time * 0.5);

    // follow the camera; a jump (a different view preset, a teleport) refills the volume at once
    if (haveLast) {
      const jump = Vector3.Distance(camPos, lastCam);
      if (jump > 250) needSeed = true;
      else if (dt > 0) velocity.scaleInPlace(0.9).addInPlace(camPos.subtract(lastCam).scaleInPlace(0.1 / dt));
    }
    haveLast = true;
    lastCam.copyFrom(camPos);
    emitter.copyFrom(camPos);
    // born where the viewer is heading (about five seconds ahead, at most 180 units)
    const lead = Math.min(1, 180 / (velocity.length() * 5 + 1e-3));
    centre.set(camPos.x + velocity.x * 5 * lead, camPos.y, camPos.z + velocity.z * 5 * lead);

    // none when the camera is high above the ground
    const alt = camPos.y - heightAt(camPos.x, camPos.z);
    strength = 1 - smooth(ALT_ON, ALT_OFF, alt);
    ps.emitRate = RATE * strength;

    if (seedPending && ps.manualEmitCount === 0) {
      // the first batch has been created: back to the steady emission
      ps.manualEmitCount = -1;
      seedPending = false;
      seeding = false;
    }
    if (needSeed && strength > 0.05 && !seedPending) {
      needSeed = false;
      seeding = true;
      seedPending = true;
      ps.manualEmitCount = Math.round(RATE * strength * 16);
    }
  });
}
