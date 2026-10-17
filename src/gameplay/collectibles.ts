import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { type Mesh } from '@babylonjs/core/Meshes/mesh.js';
import type { GameScene } from '../scene';
import type { Contact } from './world';
import type { LifeState } from './calendar';
import { mapToWorld } from '../town/layout';
import { coastZ, BEACH_WIDTH } from '../town/heights';
import { blocked } from './world';

export class Collectibles {
  private readonly drops: { contact: Contact; mesh: Mesh }[] = [];
  constructor(game: GameScene) {
    const petal = new StandardMaterial('collect-petal', game.scene); petal.diffuseColor = new Color3(1, .65, .77); petal.emissiveColor.set(.25, .09, .12);
    const shell = new StandardMaterial('collect-shell', game.scene); shell.diffuseColor = new Color3(1, .9, .7); shell.emissiveColor.set(.17, .13, .07);
    for (let i = 0; i < 18; i++) {
      const isPetal = i < 12;
      const x = isPetal ? [-43, 43][i % 2]! : mapToWorld(310 + (i - 12) * 55, 0).x;
      const z = isPetal ? -220 + Math.floor(i / 2) * 105 : coastZ(x) - BEACH_WIDTH * .65;
      if (blocked(x, z, game.town.obstacles)) continue;
      const id = `${isPetal ? 'petal' : 'shell'}-${i}`;
      const y = game.town.heightAt(x, z);
      const mesh = MeshBuilder.CreateSphere(`collect-${id}`, { diameter: 3.5, segments: 8 }, game.scene);
      mesh.scaling.set(1, .3, isPetal ? 1.5 : 1); mesh.position.set(x, y + 1, z); mesh.material = isPetal ? petal : shell;
      this.drops.push({ mesh, contact: { id, kind: 'resident', name: isPetal ? '桜の花びら' : '貝がら', line: '', x, y, z } });
    }
  }
  update(l: LifeState, indoor: boolean): void { for (const { contact, mesh } of this.drops) mesh.setEnabled(!indoor && !l.collected.includes(contact.id)); }
  contacts(l: LifeState): Contact[] { return this.drops.filter(d => !l.collected.includes(d.contact.id)).map(d => d.contact); }
}
