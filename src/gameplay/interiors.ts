import { buildFused } from '../life/people';
import { STAFF } from '../life/outfits';
import { smoothBevels } from '../town/smooth';
import { applySurfaceDetailTo } from '../surface';
import { shopGoods } from './room-goods';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer.js';
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { PointLight } from '@babylonjs/core/Lights/pointLight.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { type Mesh } from '@babylonjs/core/Meshes/mesh.js';
import type { GameScene } from '../scene';
import type { Player, Footprint } from '../player/player';
import type { RestPlace } from './rest';
import type { Contact } from './world';

export class Interiors {
  private root: TransformNode | null = null;
  private oldCamera = { radius: 60, upper: 400, beta: 1.25 };
  current: Contact | null = null;
  readonly origin = { x: 16000, y: 2000, z: 16000 };
  private solids: Footprint[] = [];
  private seats: RestPlace[] = [];
  constructor(private readonly game: GameScene, private readonly player: Player) {}
  get indoor(): boolean { return !!this.current; }
  enter(contact: Contact): void {
    if (this.current) return;
    this.current = contact;
    const scene = this.game.scene;
    const root = this.root = new TransformNode('interior-room', scene); root.position.set(this.origin.x, this.origin.y, this.origin.z);
    this.solids = []; this.seats = [];
    const palette = contact.id === 'w-cafe' ? ['#8d6548', '#f1dfc3', '#526c60'] : contact.id === 'e-wagashi' ? ['#705747', '#e9e2c4', '#8e485b'] : ['#caaf8b', '#f6f0e3', '#487c79'];
    const colors = palette.map(color => Color3.FromHexString(color));
    const mats = palette.map((_, i) => { const m = new StandardMaterial(`room-material-${i}`, scene); m.diffuseColor = Color3.White(); m.specularColor.set(.07, .07, .07); applySurfaceDetailTo(m); return m; });
    const box = (name: string, x: number, y: number, z: number, w: number, h: number, d: number, material = 0, solid = false): Mesh => {
      const m = MeshBuilder.CreateBox(`room-${name}`, { width: w, height: h, depth: d }, scene); m.parent = root; m.position.set(x, y, z); m.material = mats[material]!;
      const color = colors[material]!, values = new Float32Array(m.getTotalVertices() * 4);
      for (let v = 0; v < values.length; v += 4) values.set([color.r, color.g, color.b, 1], v);
      m.setVerticesData(VertexBuffer.ColorKind, values); m.receiveShadows = true;
      if (solid) this.solids.push({ minX: this.origin.x + x - w / 2, maxX: this.origin.x + x + w / 2, minZ: this.origin.z + z - d / 2, maxZ: this.origin.z + z + d / 2 });
      this.game.rendering.addShadowCaster(m); return m;
    };
    box('floor', 0, -1, 0, 130, 2, 130);
    box('back', 0, 20, 65, 134, 40, 3, 1, true);
    box('left', -65, 20, 0, 3, 40, 130, 1, true); box('right', 65, 20, 0, 3, 40, 130, 1, true);
    box('front-left', -43, 20, -65, 43, 40, 3, 1, true); box('front-right', 43, 20, -65, 43, 40, 3, 1, true);
    // Invisible boundary across the doorway; E provides an intentional exit back to the same doorstep.
    this.solids.push({ minX: this.origin.x - 66, maxX: this.origin.x + 66, minZ: this.origin.z - 69, maxZ: this.origin.z - 65 });
    box('door-mat', 0, .1, -53, 24, .2, 18, 2);
    for (const x of [-44, 44]) {
      box('window-frame', x, 25, 63, 27, 20, 1, 0); const glass = box('window', x, 25, 62.3, 23, 16, 1, 2);
      glass.setVerticesData(VertexBuffer.ColorKind, new Float32Array(glass.getTotalVertices() * 4).fill(1));
      const m = new StandardMaterial('room-window-light', scene); m.disableLighting = true; m.emissiveColor.set(.68, .82, .88); glass.material = m;
    }
    if (contact.id === 'home') {
      box('bed-frame', -38, 4, 28, 30, 8, 47, 0, true); box('futon', -38, 9, 28, 29, 3, 45, 1); box('blanket', -38, 11, 20, 29, 2, 28, 2);
      box('table', 26, 8, 15, 28, 16, 24, 0, true); box('rug', 13, .2, -7, 44, .2, 36, 2);
      box('cabinet', 42, 15, 51, 30, 30, 16, 0, true);
    } else {
      box('counter', 5, 6, 32, 82, 12, 15, 0, true);
      for (const x of [-20, 0, 20]) {
        box('display', x, 14, 32, 12, 4, 8, 1);
      }
      for (const z of [-10, 18]) {
        box('shelf', -53, 12, z, 13, 24, 22, 0, true);
        for (const y of [8, 17, 25]) box('shelf-goods', -53, y, z, 12, 3, 17, 2);
      }
      box('table-top', 36, 10.5, -14, 22, 1.4, 22, 0, true);
      for (const x of [27, 45]) for (const z of [-23, -5]) box('table-leg', x, 5, z, 1.6, 10, 1.6);
      for (const z of [-30, 2]) {
        box('stool', 36, 3.5, z, 8, 7, 8, 2, true);
        const fz = z < 0 ? -1 : 1;
        this.seats.push({ id: `room-seat-${z}`, name: '店内の椅子', x: this.origin.x + 36, y: this.origin.y, z: this.origin.z + z, fx: 0, fz, seatHeight: 7,
          exit: { x: this.origin.x + 36, y: this.origin.y, z: this.origin.z + z + fz * 14 } });
      }
    }
    if (contact.id !== 'home') {
      shopGoods(scene, root, contact.id, mesh => this.game.rendering.addShadowCaster(mesh));
      const outfit = STAFF[contact.id === 'w-cafe' ? 'cafe' : contact.id === 'e-wagashi' ? 'wagashi' : 'conbini']!;
      const data = buildFused(outfit); smoothBevels(data);
      const cloth = new StandardMaterial('room-staff-material', scene); cloth.diffuseColor = Color3.White(); cloth.specularColor = Color3.Black();
      const person = data.toMesh('room-shopkeeper', scene, cloth); person.unfreezeWorldMatrix(); person.parent = root; person.position.set(5, 0, 48); person.rotation.y = Math.PI;
      this.game.rendering.addShadowCaster(person);
    }
    const light = new PointLight('room-light', new Vector3(0, 34, 6), scene); light.parent = root;
    light.diffuse.set(1, .88, .7); light.intensity = .45; light.range = 160;
    light.includedOnlyMeshes = [...root.getChildMeshes(), this.player.root, ...this.player.root.getChildMeshes()];
    for (const mesh of root.getChildMeshes()) mesh.isPickable = false;
    this.oldCamera = { radius: this.game.camera.radius, upper: this.game.camera.upperRadiusLimit!, beta: this.game.camera.beta };
    this.player.enterRoom(this.origin.x, this.origin.z - 24, this.origin.y, this.solids);
    this.game.camera.upperRadiusLimit = 80; this.game.camera.radius = 48; this.game.camera.beta = 1.1;
    this.game.town.root.setEnabled(false);
  }
  get rest(): RestPlace | undefined {
    return this.seats.find(s => Math.hypot(this.player.position.x - s.x, this.player.position.z - s.z) <= 22
      && (this.player.position.z - s.z) * s.fz >= 4 && Math.abs(this.player.position.y - s.y) < 6);
  }
  get action(): 'exit' | 'sleep' | 'shop' | 'seat' | null {
    if (!this.current) return null;
    const x = this.player.position.x - this.origin.x, z = this.player.position.z - this.origin.z;
    if (z < -35 && Math.abs(x) < 26) return 'exit';
    if (this.rest) return 'seat';
    if (this.current.id === 'home') return Math.hypot(x + 38, z - 28) < 39 ? 'sleep' : null;
    return Math.abs(x - 5) < 54 && z > -2 && z < 24 ? 'shop' : null;
  }
  leave(): void {
    if (!this.current) return;
    this.player.leaveRoom(); this.current = null;
    this.root?.dispose(false, true); this.root = null; this.seats = [];
    this.game.town.root.setEnabled(true);
    this.game.camera.upperRadiusLimit = this.oldCamera.upper; this.game.camera.radius = this.oldCamera.radius; this.game.camera.beta = this.oldCamera.beta;
  }
}
