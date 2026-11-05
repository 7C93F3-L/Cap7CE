const assert = require('node:assert/strict'), path = require('node:path');
const { buildSync } = require('esbuild');
const fbx = `; FBX 7.4.0 project file
FBXHeaderExtension: {
  FBXVersion: 7400
}
Objects: {
  Geometry: 1, "Geometry::Triangle", "Mesh" {
    Vertices: *9 {
      a: 0,0,0,1,0,0,0,1,0
    }
    PolygonVertexIndex: *3 {
      a: 0,1,-3
    }
  }
  Model: 2, "Model::Triangle", "Mesh" {
    Version: 232
  }
}
Connections: {
  C: "OO",1,2
  C: "OO",2,0
}
`;
const result = buildSync({ stdin: { resolveDir: path.resolve(__dirname, '..'), contents: `
import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { Scene } from '@babylonjs/core/scene.js';
import { SceneLoader } from '@babylonjs/core/Loading/sceneLoader.js';
import { OBJFileLoader } from '@babylonjs/loaders/OBJ/objFileLoader.js';
import { geometryOnly } from './shell/Cap7CE.WinUI/Controls/ModelPreview/modelLoader.js';
import { sceneControls } from './shell/Cap7CE.WinUI/Controls/ModelPreview/modelScene.js';
import { fileFormatCapabilityByExtension } from './core/node/resourceCatalog/domain/formats/formatCapabilities.ts';
export async function check(assert,fbx) {
  for(const extension of ['.stl','.fbx']) {
    const format=fileFormatCapabilityByExtension.get(extension);
    assert.equal(format.previewKind,'threeD');assert.equal(format.canThumbnail,false);
  }
  assert.equal(fileFormatCapabilityByExtension.get('.step').previewKind,'fileInfo');
  const engine = new NullEngine(), scene = new Scene(engine);
  try {
    const source = 'mtllib absent.mtl\\nv 0 0 0\\nv 1 0 0\\nv 0 1 0\\nvt 0 0\\nvn 0 0 1\\nusemtl absent\\nf 1/99/99 2/99/99 3/99/99';
    const meshes = await new OBJFileLoader({skipMaterials:true,computeNormals:true}).importMeshAsync(null,scene,geometryOnly(source),'');
    assert.equal(meshes.meshes.length,1); assert.equal(meshes.meshes[0].getTotalVertices(),3);
    assert.equal(meshes.meshes[0].getIndices().length,3);
    const controls=sceneControls(scene,null); controls.fit();
    const radius=scene.activeCamera.radius; assert(radius>0 && Number.isFinite(radius));
    scene.activeCamera.radius*=2; controls.reset(); assert.equal(scene.activeCamera.radius,radius);
    const original=meshes.meshes[0].material; controls.gray(); assert.equal(meshes.meshes[0].material.name,'preview-gray');
    controls.gray(); assert.equal(meshes.meshes[0].material,original);
    assert(source.includes('1/99/99'),'fallback must leave the source unchanged');
    const stl = 'solid triangle\\nfacet normal 0 0 1\\nouter loop\\nvertex 0 0 0\\nvertex 1 0 0\\nvertex 0 1 0\\nendloop\\nendfacet\\nendsolid triangle';
    const binary=new ArrayBuffer(134), view=new DataView(binary);
    view.setUint32(80,1,true);view.setFloat32(92,1,true);
    view.setFloat32(108,1,true);view.setFloat32(124,1,true);
    for(const data of [stl,binary]) {
      const imported=[];
      assert(SceneLoader.GetPluginForExtension('.stl').importMesh(null,scene,data,'',imported));
      assert.equal(imported.length,1);assert.equal(imported[0].getTotalVertices(),3);
      assert.equal(imported[0].getIndices().length,3);
      for(const mesh of imported)mesh.dispose();
    }
    const imported=await SceneLoader.GetPluginForExtension('.fbx').importMeshAsync(null,scene,fbx,'');
    const geometry=imported.meshes.filter(mesh=>mesh.getTotalVertices()>0);
    assert.equal(geometry.length,1);assert.equal(geometry[0].getIndices().length,3);
    assert(geometry[0].getTotalVertices()>=3);
    controls.fit();assert(Number.isFinite(scene.activeCamera.radius));
  } finally {scene.dispose();engine.dispose();}
}` }, bundle: true, platform: 'node', format: 'cjs', write: false, logLevel: 'error' });
const target = { exports: {} };
new Function('module', 'exports', 'require', result.outputFiles[0].text)(target, target.exports, require);
target.exports.check(assert,fbx).then(() => console.log('3D OBJ fallback, ASCII/binary STL, FBX geometry, scene fit, reset and material toggle passed.')).catch(error => { console.error(error); process.exitCode=1; });
