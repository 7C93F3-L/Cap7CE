const assert = require('node:assert/strict'), fs = require('node:fs/promises'), os = require('node:os'), path = require('node:path');
const { readThreeDFact } = require('../dist-electron/threeDFactExtractor.js');
(async () => {
 const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cap7ce-three-d-known-'));
 try {
  const source = path.join(root, 'generated.gltf');
  const read = async document => { await fs.writeFile(source, JSON.stringify({ asset: { version: '2.0' }, ...document })); return readThreeDFact(source); };
  const unknown = await read({ accessors: [], meshes: [{ primitives: [{ indices: 99 }] }], animations: [{}] });
  assert.equal(unknown.triangleCountKnown, false); assert.equal(unknown.hasAnimation, true); assert.equal(unknown.animationKnown, true);
  for (const document of [
   { meshes: [null] }, { meshes: [{ primitives: [] }] }, { meshes: [{ primitives: [null] }] },
   { accessors: [{ count: -1 }], meshes: [{ primitives: [{ indices: 0 }] }] },
   { accessors: [{ count: 4 }], meshes: [{ primitives: [{ indices: 0 }] }] },
   { accessors: [{ count: '6' }], meshes: [{ primitives: [{ indices: 0 }] }] },
   { accessors: [{ count: 6 }], meshes: [{ primitives: [{ indices: 0, mode: '4' }] }] },
   { accessors: [{ count: 6 }], meshes: [{ primitives: [{ indices: 0 }, { indices: 99 }] }] }
  ]) assert.equal((await read(document)).triangleCountKnown, false, 'missing or partial triangle metadata cannot become known zero/partial count');
  const empty = await read({ meshes: [] }); assert.equal(empty.triangleCountKnown, true); assert.equal(empty.triangleCount, 0);
  const points = await read({ meshes: [{ primitives: [{ mode: 0 }] }] }); assert.equal(points.triangleCountKnown, true); assert.equal(points.triangleCount, 0);
  const external = await read({ buffers: [{ uri: 'https://invalid.example/external.bin' }], accessors: [{ count: 6 }], meshes: [{ primitives: [{ indices: 0 }] }] });
  assert.equal(external.triangleCount, 2, 'declared counts do not require following external buffer URLs');
  const malformed = await read({ animations: {}, skins: {} }); assert.equal(malformed.animationKnown, false); assert.equal(malformed.rigKnown, false);
  const glb = Buffer.alloc(24); glb.writeUInt32LE(0x46546c67, 0); glb.writeUInt32LE(2, 4); glb.writeUInt32LE(999, 8);
  glb.writeUInt32LE(4, 12); glb.writeUInt32LE(0x4e4f534a, 16); glb.write('{}  ', 20);
  const glbPath = path.join(root, 'truncated.glb'); await fs.writeFile(glbPath, glb);
  await assert.rejects(readThreeDFact(glbPath), /incomplete-glb/);
  console.log('3D unknown fields stay unknown; partial counts and truncated containers do not become known geometry.');
 } finally { await fs.rm(root, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
