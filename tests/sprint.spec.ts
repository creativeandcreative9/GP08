import { expect, test } from '@playwright/test';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { Scene } from '@babylonjs/core/scene.js';
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { Player, type Footprint } from '../src/player/player';
import { SprintPace } from '../src/player/sprint';

/** NullEngine exercises the real controller without a browser, WebGL, or private assets. */
function controller(obstacles: Footprint[] = []) {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const camera = new ArcRotateCamera('test-camera', -Math.PI / 2, 1.25, 60, Vector3.Zero(), scene);
  const root = new Mesh('test-player', scene);
  const globals = ['window', 'document', 'HTMLElement'] as const;
  const oldGlobals = globals.map(key => Object.getOwnPropertyDescriptor(globalThis, key));
  const keyboard = new EventTarget();
  const documentEvents = Object.assign(new EventTarget(), { hidden: false });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: keyboard });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: documentEvents });
  Object.defineProperty(globalThis, 'HTMLElement', { configurable: true, value: class {} });
  let gaitSpeed = 0;
  const player = new Player({ scene, camera, spawn: { x: 0, z: 0 }, obstacles,
    avatar: { root, gait: { update: (_dt, speed) => { gaitSpeed = speed; }, sit: () => {} } } });
  camera.getViewMatrix(true);
  const frame = (dt = 1 / 60) => { player.update(dt); camera.getViewMatrix(true); };
  const frames = (seconds: number, fps = 60) => { for (let i = 0; i < Math.round(seconds * fps); i++) frame(1 / fps); };
  const key = (code: string, down: boolean) => {
    const event = new Event(down ? 'keydown' : 'keyup');
    Object.defineProperty(event, 'code', { value: code });
    keyboard.dispatchEvent(event);
  };
  return {
    player, camera, frame, frames, key, keyboard, documentEvents, gaitSpeed: () => gaitSpeed,
    dispose() {
      scene.dispose(); engine.dispose();
      globals.forEach((key, i) => {
        const old = oldGlobals[i];
        if (old) Object.defineProperty(globalThis, key, old);
        else Reflect.deleteProperty(globalThis, key);
      });
    },
  };
}

test('continuous active time reaches 2× at 10 s and 3× at 20 s independently of frame rate', () => {
  for (const fps of [15, 60, 144, 2]) {
    const game = controller();
    try {
      game.player.setTouch(0, 1, true);
      game.frames(10, fps);
      expect(game.player.runMultiplier).toBeCloseTo(2, 8);
      expect(game.player.currentSpeed).toBeCloseTo(80, 2);
      expect(game.player.running).toBe(true);
      game.frames(10, fps);
      expect(game.player.runMultiplier).toBeCloseTo(3, 8);
      expect(game.player.currentSpeed).toBeCloseTo(120, 2);
      game.frames(2, fps);
      expect(game.player.runMultiplier).toBe(3);
      expect(game.gaitSpeed()).toBeLessThanOrEqual(48);
    } finally { game.dispose(); }
  }
});

test('walking keeps the original 17.5-unit pace and cannot charge sprint', () => {
  const game = controller();
  try {
    game.player.setTouch(0, 1);
    game.frames(20);
    expect(game.player.currentSpeed).toBeCloseTo(17.5, 8);
    expect(game.player.runMultiplier).toBe(1);
    expect(game.player.running).toBe(false);
  } finally { game.dispose(); }
});

test('letting go, walking, and opening a modal immediately reset acceleration', () => {
  const game = controller();
  try {
    for (const stop of [() => game.player.setTouch(0, 0), () => game.player.setTouch(0, 1),
      () => game.player.setControlsEnabled(false)]) {
      game.player.setControlsEnabled(true);
      game.player.setTouch(0, 1, true);
      game.frames(1);
      expect(game.player.runMultiplier).toBeGreaterThan(1);
      stop();
      expect(game.player.runMultiplier).toBe(1);
      expect(game.player.running).toBe(false);
    }
    const before = game.player.position.clone();
    game.frame(30);
    expect(game.player.position.equals(before)).toBe(true);
  } finally { game.dispose(); }
});

test('real keyboard release resets the run without waiting for another animation frame', () => {
  const game = controller();
  try {
    game.key('KeyW', true); game.key('ShiftLeft', true);
    game.frames(2);
    expect(game.player.runMultiplier).toBeCloseTo(1.2, 8);
    game.key('ShiftLeft', false);
    expect(game.player.runMultiplier).toBe(1);
    expect(game.player.running).toBe(false);
    game.key('ShiftLeft', true); game.frames(1);
    game.key('KeyW', false);
    expect(game.player.runMultiplier).toBe(1);
  } finally { game.dispose(); }
});

test('blur and hidden tabs discard held input and elapsed time spent away', () => {
  const game = controller();
  try {
    game.player.setTouch(0, 1, true); game.frames(2);
    game.keyboard.dispatchEvent(new Event('blur'));
    expect(game.player.runMultiplier).toBe(1);
    expect(game.player.currentSpeed).toBe(0);
    game.player.setTouch(0, 1, true); game.frame(30);
    expect(game.player.runMultiplier).toBe(1);
    game.frame();
    expect(game.player.runMultiplier).toBeGreaterThan(1);
    game.documentEvents.hidden = true;
    game.documentEvents.dispatchEvent(new Event('visibilitychange'));
    const position = game.player.position.clone();
    game.player.setTouch(0, 1, true); game.frame(50);
    expect(game.player.position.equals(position)).toBe(true);
    expect(game.player.runMultiplier).toBe(1);
    game.documentEvents.hidden = false;
    game.documentEvents.dispatchEvent(new Event('visibilitychange'));
    game.player.setTouch(0, 1, true); game.frame(50);
    expect(game.player.runMultiplier).toBe(1);
    game.frames(1);
    expect(game.player.runMultiplier).toBeCloseTo(1.1, 8);
  } finally { game.dispose(); }
});

test('sitting, room transitions, and externally changed positions reset the run', () => {
  const game = controller();
  try {
    const charge = () => { game.player.setTouch(0, 1, true); game.frames(1); };
    charge();
    game.player.sit({ id: 'bench', name: 'bench', x: 0, y: 0, z: 0, fx: 0, fz: 1,
      seatHeight: 4, exit: { x: 0, y: 0, z: 15 } });
    expect(game.player.runMultiplier).toBe(1);
    game.player.setTouch(0, 1, true); game.frames(10);
    expect(game.player.running).toBe(false);
    game.player.standUp(); charge();
    game.player.enterRoom(100, 100, 20, []);
    expect(game.player.runMultiplier).toBe(1);
    charge(); game.player.leaveRoom();
    expect(game.player.runMultiplier).toBe(1);
    charge(); game.player.position.x += 100;
    expect(game.player.runMultiplier).toBe(1);
    expect(game.player.running).toBe(false);
    expect(game.player.currentSpeed).toBe(0);
  } finally { game.dispose(); }
});

test('holding run against a wall never charges a stationary player', () => {
  const obstacles = [{ minX: -100, maxX: 100, minZ: 5, maxZ: 5.1 }];
  const game = controller(obstacles);
  try {
    game.player.setTouch(0, 1, true); game.frames(25);
    expect(game.player.position.z).toBeLessThanOrEqual(1);
    expect(game.player.runMultiplier).toBe(1);
    expect(game.player.running).toBe(false);
    expect(game.player.currentSpeed).toBe(0);
    obstacles.length = 0;
    game.frame();
    expect(game.player.runMultiplier).toBeCloseTo(1 + 1 / 600, 8);
  } finally { game.dispose(); }
});

test('a capped three-times run cannot tunnel through a thin wall in a slow frame', () => {
  const obstacles: Footprint[] = [];
  const game = controller(obstacles);
  try {
    game.player.setTouch(0, 1, true); game.frames(20);
    const before = game.player.position.clone();
    obstacles.push({ minX: before.x - 50, maxX: before.x + 50, minZ: before.z + 6, maxZ: before.z + 6.01 });
    game.frame(0.5);
    expect(game.player.position.z).toBeLessThanOrEqual(before.z + 2 + 1e-8);
    expect(game.player.position.z).toBeGreaterThanOrEqual(before.z);
    game.frames(1);
    expect(game.player.running).toBe(false);
    expect(game.player.runMultiplier).toBe(1);
  } finally { game.dispose(); }
});

test('sprint clock ignores invalid elapsed values and remains capped', () => {
  const pace = new SprintPace();
  for (const dt of [-1, NaN, Infinity, 0]) pace.advance(dt, true);
  expect(pace.multiplier).toBe(1);
  pace.advance(10, true); expect(pace.multiplier).toBe(2);
  pace.advance(100, true); expect(pace.multiplier).toBe(3);
  pace.advance(1, false); expect(pace.multiplier).toBe(1);
});
