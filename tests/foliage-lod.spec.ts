import { expect, test } from '@playwright/test';
import { MeshBatch } from '../src/town/batch';
import { foliageCluster } from '../src/town/leaf';
import { distantFoliageGeometry } from '../src/town/lod';
const data=(b:MeshBatch)=>({positions:b.pos,normals:b.nor,colors:b.col,indices:b.idx,uvs:b.uvs,surfaces:b.surf});
function area(b:MeshBatch):number {let sum=0;for(let i=0;i<b.idx.length;i+=3){const a=b.idx[i]!*2,c=b.idx[i+1]!*2,d=b.idx[i+2]!*2;sum+=Math.abs((b.uvs[c]!-b.uvs[a]!)*(b.uvs[d+1]!-b.uvs[a+1]!)-(b.uvs[c+1]!-b.uvs[a+1]!)*(b.uvs[d]!-b.uvs[a]!))/2;}return sum;}
test('distant foliage retains every painted region and its full outline while reducing flower subdivisions',()=>{
 const b=new MeshBatch(true);
 for(let i=0;i<9;i++)foliageCluster(b,i*50,40+i,15,12+i,.6+i*.03,'bloomA',i*.29);
 const nonFlower=new MeshBatch(true);foliageCluster(nonFlower,400,25,0,14,.8,'hedgeC',.4);
 const original=data(b),far=distantFoliageGeometry(original),greenFar=distantFoliageGeometry(data(nonFlower));
 expect(far.triangleCount).toBeLessThan(b.triangleCount*.4);expect(far.vertexCount).toBeLessThan(b.vertexCount);
 expect(area(far)).toBeCloseTo(area(b),10);expect(area(greenFar)).toBeCloseTo(area(nonFlower),10);expect(greenFar.triangleCount).toBe(nonFlower.triangleCount);
 for(let axis=0;axis<3;axis++){expect(Math.min(...far.pos.filter((_,i)=>i%3===axis))).toBeCloseTo(Math.min(...b.pos.filter((_,i)=>i%3===axis)),8);expect(Math.max(...far.pos.filter((_,i)=>i%3===axis))).toBeCloseTo(Math.max(...b.pos.filter((_,i)=>i%3===axis)),8);}
 const signature=(m:MeshBatch,i:number)=>JSON.stringify([m.pos.slice(i*3,i*3+3),m.nor.slice(i*3,i*3+3),m.col.slice(i*4,i*4+4),m.uvs.slice(i*2,i*2+2),m.surf[i]]),old=new Set(Array.from({length:b.vertexCount},(_,i)=>signature(b,i)));
 expect(Array.from({length:far.vertexCount},(_,i)=>old.has(signature(far,i))).every(Boolean)).toBe(true);
 expect(Math.max(...far.idx)).toBeLessThan(far.vertexCount);expect(far.nor.every(Number.isFinite)).toBe(true);expect(far.uvs).toHaveLength(far.vertexCount*2);expect(far.col).toHaveLength(far.vertexCount*4);expect(far.surf).toHaveLength(far.vertexCount);
});
