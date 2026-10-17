import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture.js';
import { Texture } from '@babylonjs/core/Materials/Textures/texture.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder.js';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js';
import type { Scene } from '@babylonjs/core/scene.js';
import type { LifeState } from './calendar';
import { makeRng } from '../town/util';

const clamp = (v: number): number => Math.max(0, Math.min(1, v));
const smooth = (v: number): number => { const t = clamp(v); return t * t * (3 - 2 * t); };

function skyMaterial(scene: Scene, name: string, texture: DynamicTexture): StandardMaterial {
  const material = new StandardMaterial(name, scene);
  material.diffuseTexture = texture;
  material.useAlphaFromDiffuseTexture = true;
  material.disableLighting = true;
  material.emissiveColor = Color3.White();
  material.specularColor = Color3.Black();
  material.backFaceCulling = false;
  material.disableDepthWrite = true;
  material.fogEnabled = false;
  return material;
}

/** Painted once: a restrained halo, a warm lunar disc and softly shaded maria. */
function moonTexture(scene: Scene): DynamicTexture {
  const texture = new DynamicTexture('evening-moon-paint', { width: 256, height: 256 }, scene, true, Texture.TRILINEAR_SAMPLINGMODE);
  const g = texture.getContext() as CanvasRenderingContext2D;
  g.clearRect(0, 0, 256, 256);
  const halo = g.createRadialGradient(128, 128, 30, 128, 128, 122);
  halo.addColorStop(0, 'rgba(255,228,175,.24)');
  halo.addColorStop(.32, 'rgba(255,225,175,.055)');
  halo.addColorStop(1, 'rgba(217,227,255,0)');
  g.fillStyle = halo; g.fillRect(0, 0, 256, 256);
  g.save(); g.beginPath(); g.arc(128, 128, 36, 0, Math.PI * 2); g.clip();
  const disc = g.createLinearGradient(92, 110, 164, 145);
  disc.addColorStop(0, '#e0d4bc'); disc.addColorStop(.25, '#f4ebd2'); disc.addColorStop(1, '#fff6dc');
  g.fillStyle = disc; g.fillRect(90, 90, 76, 76);
  const rng = makeRng(52119);
  for (let i = 0; i < 18; i++) {
    const x = 103 + rng() * 49, y = 102 + rng() * 50, radius = 2 + rng() * 8;
    const crater = g.createRadialGradient(x, y, 0, x, y, radius);
    crater.addColorStop(0, 'rgba(116,126,138,.17)'); crater.addColorStop(1, 'rgba(116,126,138,0)');
    g.fillStyle = crater; g.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }
  g.restore();
  texture.hasAlpha = true; texture.wrapU = texture.wrapV = Texture.CLAMP_ADDRESSMODE; texture.update();
  return texture;
}

/** One draw for all stars, replacing dozens of separate spherical meshes. */
function starField(scene: Scene): { mesh: Mesh; material: StandardMaterial } {
  const texture = new DynamicTexture('evening-star-paint', { width: 32, height: 32 }, scene, true, Texture.TRILINEAR_SAMPLINGMODE);
  const g = texture.getContext() as CanvasRenderingContext2D;
  const glow = g.createRadialGradient(16, 16, 0, 16, 16, 15);
  glow.addColorStop(0, '#ffffff'); glow.addColorStop(.15, '#ffffffd0'); glow.addColorStop(.42, '#ffffff38'); glow.addColorStop(1, '#ffffff00');
  g.fillStyle = glow; g.fillRect(0, 0, 32, 32);
  texture.hasAlpha = true; texture.wrapU = texture.wrapV = Texture.CLAMP_ADDRESSMODE; texture.update();
  const material = skyMaterial(scene, 'evening-star-material', texture);
  const mesh = new Mesh('evening-stars', scene);
  const vertices = new VertexData();
  const positions: number[] = [], colors: number[] = [], uvs: number[] = [], indices: number[] = [], normals: number[] = [];
  const rng = makeRng(8374);
  for (let i = 0; i < 112; i++) {
    const azimuth = rng() * Math.PI * 2, height = .1 + rng() * .85;
    const radius = 16000, horizontal = Math.sqrt(1 - height * height);
    const direction = new Vector3(Math.cos(azimuth) * horizontal, height, Math.sin(azimuth) * horizontal);
    const center = direction.scale(radius);
    const right = Vector3.Cross(direction, Vector3.Up()).normalize();
    const up = Vector3.Cross(right, direction).normalize();
    const size = 12 + Math.pow(rng(), 3) * 24, brightness = .55 + rng() * .4;
    const warm = i % 7 === 0;
    for (const [x, y] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const vertex = center.add(right.scale(x! * size)).add(up.scale(y! * size));
      positions.push(vertex.x, vertex.y, vertex.z);
      normals.push(-direction.x, -direction.y, -direction.z);
      colors.push(brightness * (warm ? 1 : .84), brightness * .92, brightness * (warm ? .78 : 1), 1);
      uvs.push((x! + 1) / 2, (y! + 1) / 2);
    }
    const first = i * 4; indices.push(first, first + 1, first + 2, first, first + 2, first + 3);
  }
  vertices.positions = positions; vertices.normals = normals; vertices.colors = colors; vertices.uvs = uvs; vertices.indices = indices; vertices.applyToMesh(mesh);
  mesh.material = material;
  mesh.infiniteDistance = true; mesh.isPickable = false; mesh.applyFog = false; mesh.alwaysSelectAsActiveMesh = true;
  mesh.setEnabled(false);
  return { mesh, material };
}

/** Clear spring nights gain a quiet focal point; daytime and indoor rendering stay unchanged. */
export class EveningAtmosphere {
  private readonly moon: Mesh;
  private readonly moonMaterial: StandardMaterial;
  private readonly stars: ReturnType<typeof starField>;

  constructor(scene: Scene) {
    this.moonMaterial = skyMaterial(scene, 'evening-moon-material', moonTexture(scene));
    this.moon = MeshBuilder.CreatePlane('evening-moon', { size: 1600 }, scene);
    this.moon.position.set(-5300, 4200, 14900);
    this.moon.billboardMode = Mesh.BILLBOARDMODE_ALL;
    this.moon.infiniteDistance = true; this.moon.isPickable = false; this.moon.applyFog = false;
    this.moon.material = this.moonMaterial; this.moon.setEnabled(false);
    this.stars = starField(scene);
    scene.onDisposeObservable.addOnce(() => this.dispose());
  }

  update(life: LifeState, indoors: boolean): void {
    const hour = life.minute / 60;
    // Dawn and dusk fade over an hour instead of appearing suddenly with the streetlights.
    const darkness = hour < 12 ? 1 - smooth((hour - 5) / 1.5) : smooth((hour - 17.5) / 1.5);
    const visible = !indoors && life.weather === 'clear' && darkness > .001;
    this.moon.setEnabled(visible); this.stars.mesh.setEnabled(visible);
    this.moonMaterial.alpha = darkness;
    this.stars.material.alpha = darkness * .82;
  }

  dispose(): void {
    this.moon.dispose(false, true);
    this.stars.mesh.dispose(false, true);
  }
}
