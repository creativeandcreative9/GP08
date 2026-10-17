import fs from 'node:fs';
import { expect, test } from '@playwright/test';

test('distant flower LOD preserves the full painted surface instead of deleting half its faces', async ({page}) => {
  test.setTimeout(60000);
  await page.route('**/src/main.ts*', route => route.fulfill({contentType:'application/javascript',body:''}));
  await page.goto('/?gfx=high');const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  const result=await page.evaluate(async()=>{
    const load=async(path:string):Promise<Record<string,any>>=>import(/* @vite-ignore */path);
    const {Engine}=await load('/node_modules/@babylonjs/core/Engines/engine.js');
    const {Scene}=await load('/node_modules/@babylonjs/core/scene.js');
    const {FreeCamera}=await load('/node_modules/@babylonjs/core/Cameras/freeCamera.js');
    const {Camera}=await load('/node_modules/@babylonjs/core/Cameras/camera.js');
    const {Vector3}=await load('/node_modules/@babylonjs/core/Maths/math.vector.js');
    const {Color3,Color4}=await load('/node_modules/@babylonjs/core/Maths/math.color.js');
    const {StandardMaterial}=await load('/node_modules/@babylonjs/core/Materials/standardMaterial.js');
    const {TransformNode}=await load('/node_modules/@babylonjs/core/Meshes/transformNode.js');
    const {MeshBatch}=await load('/src/town/batch.ts'),{addDistanceDetail}=await load('/src/town/atmosphere.ts');
    const canvas=document.createElement('canvas');canvas.width=canvas.height=128;canvas.style.cssText='width:128px;height:128px';document.body.append(canvas);
    const engine=new Engine(canvas,false,{preserveDrawingBuffer:true}),scene=new Scene(engine);engine.setSize(128,128);scene.clearColor=new Color4(0,0,0,1);
    const camera=new FreeCamera('leaf-camera',new Vector3(0,0,-11),scene);camera.mode=Camera.ORTHOGRAPHIC_CAMERA;camera.orthoLeft=camera.orthoBottom=-2;camera.orthoRight=camera.orthoTop=2;camera.setTarget(Vector3.Zero());scene.activeCamera=camera;
    const material=new StandardMaterial('leaf-test',scene);material.disableLighting=true;material.diffuseColor=Color3.White();material.emissiveColor=Color3.White();material.backFaceCulling=false;
    const root=new TransformNode('test-town',scene),batch=new MeshBatch(true);
    for(let row=0;row<3;row++)for(let col=0;col<3;col++){batch.pos.push(col-1,row-1,0);batch.nor.push(0,0,-1);batch.col.push(1,1,1,1);batch.uvs.push(col/2,row/2);}
    batch.appendSurface(9);
    for(let row=0;row<2;row++)for(let col=0;col<2;col++){const i=row*3+col;batch.idx.push(i,i+1,i+4,i,i+4,i+3);}
    const mesh=batch.toMesh('foliage_test',scene,material);mesh.parent=root;mesh.computeWorldMatrix(true);addDistanceDetail(scene,root);
    const capture=async(distance:number)=>{
      // Babylon selects orthographic LOD from minZ; keep the quad's projected size fixed.
      camera.position.z=-(distance+10);camera.minZ=distance;camera.maxZ=distance+100;camera.getViewMatrix(true);camera.getProjectionMatrix(true);
      scene.render();await scene.whenReadyAsync();scene.render();const pixels=await engine.readPixels(0,0,128,128);let filled=0;
      for(let i=0;i<pixels.length;i+=4)if(pixels[i]>100&&pixels[i+1]>100&&pixels[i+2]>100)filled++;
      const selected=mesh.getLOD(camera);return{filled,name:selected.name,triangles:selected.getTotalIndices()/3,image:canvas.toDataURL()};
    };
    const near=await capture(1),far=await capture(2500);scene.dispose();engine.dispose();return{near,far};
  });
  fs.mkdirSync('screenshots',{recursive:true});for(const name of ['near','far']as const)fs.writeFileSync(`screenshots/foliage-distance-${name}.png`,Buffer.from(result[name].image.split(',')[1]!,'base64'));
  console.log(JSON.stringify({near:{filled:result.near.filled,triangles:result.near.triangles,name:result.near.name},far:{filled:result.far.filled,triangles:result.far.triangles,name:result.far.name}}));
  expect(errors).toEqual([]);expect(result.near.filled).toBeGreaterThan(1000);expect(result.far.name).toContain('-distant');expect(result.far.triangles).toBeLessThan(result.near.triangles);
  expect(result.far.filled).toBeGreaterThanOrEqual(result.near.filled*.98);expect(result.far.filled).toBeLessThanOrEqual(result.near.filled*1.02);
});
