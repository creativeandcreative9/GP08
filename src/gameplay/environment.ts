import { Color3, Color4 } from '@babylonjs/core/Maths/math.color.js';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture.js';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight.js';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight.js';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder.js';
import { ParticleSystem } from '@babylonjs/core/Particles/particleSystem.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { Texture } from '@babylonjs/core/Materials/Textures/texture.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer.js';
import { type Mesh } from '@babylonjs/core/Meshes/mesh.js';
import type { GameScene } from '../scene';
import type { LifeState } from './calendar';
import { makeRng } from '../town/util';
import { createPuddles } from './puddles';

/** Gameplay lighting only; the five reference cameras keep the reproducible spring-afternoon setup. */
export class Environment {
  private key = '';
  private raining = false;
  private readonly rain: ParticleSystem;
  private readonly puddles: Mesh;
  private readonly sky: Mesh | undefined;
  private readonly colors: number[];
  private readonly stars: Mesh[] = [];
  private readonly lamps: Mesh[] = [];
  private readonly glow: StandardMaterial;
  private readonly base: number[];
  constructor(private readonly game: GameScene) {
    const scene = game.scene;
    this.puddles = createPuddles(scene, game.town);
    this.sky = scene.getMeshByName('sky') as Mesh | undefined;
    this.base = [...(this.sky?.getVerticesData(VertexBuffer.ColorKind) ?? [])];
    this.colors = [...this.base];
    const texture = new DynamicTexture('rain-drop', { width: 16, height: 64 }, scene, false);
    const g = texture.getContext(); g.clearRect(0, 0, 16, 64); g.fillStyle = '#d8e8ff'; g.fillRect(6, 4, 4, 52); texture.update();
    this.rain = new ParticleSystem('rain', 650, scene);
    this.rain.particleTexture = texture; texture.wrapU = texture.wrapV = Texture.CLAMP_ADDRESSMODE;
    // Populate the visible volume immediately, including on slow renderers or just after stepping outside.
    this.rain.minEmitBox = new Vector3(-90, 8, -90); this.rain.maxEmitBox = new Vector3(90, 140, 90);
    this.rain.direction1 = new Vector3(-5, -160, 0); this.rain.direction2 = new Vector3(-12, -200, 2);
    this.rain.minLifeTime = .55; this.rain.maxLifeTime = .9; this.rain.emitRate = 650;
    this.rain.minSize = .7; this.rain.maxSize = 1.2;
    this.rain.minScaleY = 4; this.rain.maxScaleY = 7;
    this.rain.color1 = new Color4(.8, .9, 1, .5); this.rain.color2 = new Color4(.6, .75, .9, .35);
    this.rain.colorDead = new Color4(.6, .75, .9, 0); this.rain.blendMode = ParticleSystem.BLENDMODE_STANDARD;
    this.glow = new StandardMaterial('night-lamp', scene); this.glow.disableLighting = true; this.glow.emissiveColor.set(1, .76, .42);
    const rng = makeRng(8374);
    for (let i = 0; i < 36; i++) {
      const star = MeshBuilder.CreateSphere(`star-${i}`, { diameter: 15 + rng() * 15, segments: 3 }, scene);
      const a = rng() * Math.PI * 2, e = .25 + rng();
      star.position.set(Math.cos(a) * 16000 * Math.cos(e), Math.sin(e) * 16000, Math.sin(a) * 16000 * Math.cos(e));
      star.infiniteDistance = true; star.material = this.glow; star.isPickable = false; star.applyFog = false; star.setEnabled(false); this.stars.push(star);
    }
    const poolTexture = new DynamicTexture('lamp-pool', { width: 64, height: 64 }, scene, false);
    const context = poolTexture.getContext() as CanvasRenderingContext2D;
    const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32); gradient.addColorStop(0, '#ffe7ab70'); gradient.addColorStop(1, '#ffe7ab00');
    context.fillStyle = gradient; context.fillRect(0, 0, 64, 64); poolTexture.update(); poolTexture.hasAlpha = true;
    const poolMaterial = new StandardMaterial('lamp-pool-material', scene); poolMaterial.diffuseTexture = poolTexture; poolMaterial.useAlphaFromDiffuseTexture = true;
    poolMaterial.disableLighting = true; poolMaterial.emissiveColor.set(1, .82, .55); poolMaterial.backFaceCulling = false; poolMaterial.disableDepthWrite = true;
    for (const [i, p] of (game.town.lamps ?? []).entries()) {
      const lamp = MeshBuilder.CreateSphere(`night-lantern-${i}`, { diameter: 2.4, segments: 6 }, scene);
      lamp.position.set(p.x, p.y, p.z); lamp.material = this.glow; lamp.parent = game.town.root; lamp.isPickable = false; lamp.setEnabled(false); this.lamps.push(lamp);
      const pool = MeshBuilder.CreatePlane(`night-pool-${i}`, { size: 44 }, scene); pool.rotation.x = Math.PI / 2;
      pool.position.set(p.x, game.town.heightAt(p.x, p.z) + .75, p.z); pool.material = poolMaterial; pool.parent = game.town.root; pool.isPickable = false; pool.setEnabled(false); this.lamps.push(pool);
    }
  }
  update(life: LifeState, indoor: boolean): void {
    this.game.scene.metadata.climate = { day: life.day, weather: life.weather, indoor };
    this.rain.emitter = this.game.camera.target.clone();
    const wet = life.weather === 'rain' && !indoor;
    this.puddles.setEnabled(wet);
    if (wet !== this.raining) {
      this.raining = wet;
      if (wet) this.rain.start(); else this.rain.stop();
    }
    const key = `${Math.floor(life.minute / 3)}-${life.weather}-${indoor}`;
    if (key === this.key) return;
    this.key = key;
    const h = life.minute / 60;
    const day = Math.max(.04, Math.min(1, Math.sin((h - 6) / 12 * Math.PI) * 1.5));
    const sunset = Math.max(0, 1 - Math.abs(h - 18) / 2) * .65;
    const overcast = life.weather === 'rain' ? .58 : life.weather === 'cloudy' ? .8 : 1;
    const scene = this.game.scene;
    const hemi = scene.getLightByName('hemi') as HemisphericLight;
    const sun = scene.getLightByName('sun') as DirectionalLight;
    // Lift daytime shade while keeping the original night floor and indoor fill.
    const skyBoost = Math.max(0, day - .04) / .96;
    hemi.intensity = indoor ? .95 : .48 + (day * .3 + skyBoost * .12) * overcast;
    hemi.diffuse = Color3.Lerp(new Color3(.38, .48, .78), new Color3(.8, .86, 1), day);
    sun.intensity = indoor ? .3 : day * 1.15 * overcast;
    sun.diffuse.set(1, .91 - sunset * .4, .78 - sunset * .4);
    sun.direction.set(-.6, -.12 - day * .5, .55).normalize();
    const fog = Color3.Lerp(new Color3(.045, .065, .13), new Color3(.84, .9, .97), day * overcast);
    fog.r += sunset * .18; fog.b -= sunset * .12;
    scene.fogColor.copyFrom(fog); scene.fogDensity = life.weather === 'rain' ? .00023 : .00018;
    for (let i = 0; i < this.colors.length; i += 4) {
      this.colors[i] = this.base[i]! * (.08 + day * .92) * overcast + sunset * .3;
      this.colors[i + 1] = this.base[i + 1]! * (.1 + day * .9) * overcast + sunset * .05;
      this.colors[i + 2] = this.base[i + 2]! * (.2 + day * .8) * overcast;
    }
    this.sky?.updateVerticesData(VertexBuffer.ColorKind, this.colors);
    const shafts = scene.getMaterialByName('light-shafts');
    if (shafts) shafts.alpha = indoor ? 0 : .18 * day * overcast;
    const glass = scene.getMaterialByName('glassMat') as StandardMaterial | null;
    if (glass?.reflectionTexture) glass.reflectionTexture.level = .04 + .24 * day * overcast;
    glass?.emissiveColor.copyFrom(Color3.Lerp(new Color3(.4, .26, .11), new Color3(.06, .08, .1), day));
    const night = day < .2;
    for (const star of this.stars) star.setEnabled(night && life.weather === 'clear');
    for (const lamp of this.lamps) lamp.setEnabled(night && !indoor);
    for (const material of scene.materials) if (material.name.startsWith('cloudMat') && material instanceof StandardMaterial) material.emissiveColor.set(.18 + .82 * day, .2 + .8 * day, .3 + .7 * day);
  }
}
