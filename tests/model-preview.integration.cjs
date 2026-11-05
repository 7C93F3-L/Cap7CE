const assert = require('node:assert/strict'), path = require('node:path');
const { buildSync } = require('esbuild');
const result = buildSync({ stdin: { resolveDir: path.resolve(__dirname, '..'), contents: `
import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { Scene } from '@babylonjs/core/scene.js';
import { OBJFileLoader } from '@babylonjs/loaders/OBJ/objFileLoader.js';
import { geometryOnly } from './shell/Cap7CE.WinUI/Controls/ModelPreview/modelLoader.js';
import { sceneControls } from './shell/Cap7CE.WinUI/Controls/ModelPreview/modelScene.js';
export async function check(assert) {
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
  } finally {scene.dispose();engine.dispose();}
}` }, bundle: true, platform: 'node', format: 'cjs', write: false, logLevel: 'error' });
const target = { exports: {} };
new Function('module', 'exports', 'require', result.outputFiles[0].text)(target, target.exports, require);
target.exports.check(assert).then(() => console.log('3D OBJ geometry fallback, scene fit, reset and material toggle passed.')).catch(error => { console.error(error); process.exitCode=1; });
