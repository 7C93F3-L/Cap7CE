const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { app } = require("electron");

const testRoot = path.join(os.tmpdir(), `cap7ce-three-d-fact-${process.pid}-${Date.now()}`);
const userDataPath = path.join(testRoot, "user-data");
const directoryPath = path.join(testRoot, "models");
const timestamp = new Date("2026-10-04T00:00:00.000Z").toISOString();
app.setPath("userData", userDataPath);

const createBinaryStl = (triangleCount) => {
  const output = Buffer.alloc(84 + triangleCount * 50);
  output.writeUInt32LE(triangleCount, 80);
  return output;
};

const createGlb = (document) => {
  const source = Buffer.from(JSON.stringify(document), "utf8");
  const paddedLength = Math.ceil(source.length / 4) * 4;
  const output = Buffer.alloc(20 + paddedLength, 0x20);
  output.writeUInt32LE(0x46546c67, 0);
  output.writeUInt32LE(2, 4);
  output.writeUInt32LE(output.length, 8);
  output.writeUInt32LE(paddedLength, 12);
  output.writeUInt32LE(0x4e4f534a, 16);
  source.copy(output, 20);
  return output;
};

app.whenReady().then(async () => {
  try {
    await fs.mkdir(directoryPath, { recursive: true });
    const files = {
      obj: path.join(directoryPath, "three-triangles.obj"),
      stl: path.join(directoryPath, "two-triangles.stl"),
      gltf: path.join(directoryPath, "animated-rigged.gltf"),
      glb: path.join(directoryPath, "static-strip.glb"),
      max: path.join(directoryPath, "scene.max")
    };
    await fs.writeFile(files.obj, "v 0 0 0\nv 1 0 0\nv 1 1 0\nv 0 1 0\nf 1 2 3 4\nf 1 3 4\n");
    await fs.writeFile(files.stl, createBinaryStl(2));
    await fs.writeFile(files.gltf, JSON.stringify({
      asset: { version: "2.0" }, accessors: [{ count: 6 }], meshes: [{ primitives: [{ indices: 0 }] }],
      animations: [{}], skins: [{}]
    }));
    await fs.writeFile(files.glb, createGlb({
      asset: { version: "2.0" }, accessors: [{ count: 4 }], meshes: [{ primitives: [{ attributes: { POSITION: 0 }, mode: 5 }] }]
    }));
    await fs.writeFile(files.max, "unsupported-proprietary-scene");
    await Promise.all(Object.values(files).map((filePath) => fs.utimes(filePath, new Date(timestamp), new Date(timestamp))));

    const { readThreeDFact } = require("../dist-electron/threeDFactExtractor.js");
    assert.deepEqual(await readThreeDFact(files.obj), { triangleCountKnown: true, triangleCount: 3, animationKnown: true, hasAnimation: false, rigKnown: true, hasRig: false });
    assert.deepEqual(await readThreeDFact(files.stl), { triangleCountKnown: true, triangleCount: 2, animationKnown: true, hasAnimation: false, rigKnown: true, hasRig: false });
    assert.deepEqual(await readThreeDFact(files.gltf), { triangleCountKnown: true, triangleCount: 2, animationKnown: true, hasAnimation: true, rigKnown: true, hasRig: true });
    assert.deepEqual(await readThreeDFact(files.glb), { triangleCountKnown: true, triangleCount: 2, animationKnown: true, hasAnimation: false, rigKnown: true, hasRig: false });

    const directory = { id: "three-d-directory", name: "models", path: directoryPath, indexedCount: 0, createdAt: timestamp, updatedAt: timestamp };
    const { scanImageDirectories } = require("../dist-electron/imageScanner.js");
    const { ensureImageDatabase, listPendingThreeDFactCandidates, writeThreeDFactBatch, writeScannedImagesToIndex } = require("../dist-electron/sqliteImageIndex.js");
    const { inspectThreeDFactBatch } = require("../dist-electron/threeDFactInspector.js");
    const { searchImagesWithAddedDirectories } = require("../dist-electron/imageSearchService.js");
    const { searchScanSnapshotService } = require("../dist-electron/searchScanSnapshotService.js");
    await ensureImageDatabase();
    const scan = await scanImageDirectories([directory]);
    await writeScannedImagesToIndex([directory.id], scan.images, scan.scannedAt, scan.files);
    const candidates = await listPendingThreeDFactCandidates([directory.id]);
    assert.equal(candidates.length, 4);
    const inspected = await inspectThreeDFactBatch(candidates);
    assert.ok(inspected.every((result) => result.status === "indexed"));
    assert.equal(await writeThreeDFactBatch(candidates.map((candidate, index) => ({ filePath: candidate.filePath, result: inspected[index] }))), 4);
    assert.deepEqual(await listPendingThreeDFactCandidates([directory.id]), []);

    searchScanSnapshotService.setActive(false);
    const search = async (facets) => (await searchImagesWithAddedDirectories({
      query: "", directoryId: "all", fileFormat: "all", sortField: "file_name", sortDirection: "asc",
      selectedExtensions: [".glb", ".gltf", ".max", ".obj", ".stl"], ...facets
    }, [directory])).images.map((item) => item.fileName);
    assert.deepEqual(await search({ threeDModelTypes: ["scene"] }), ["scene.max"]);
    assert.deepEqual(await search({ threeDModelTypes: ["polygon"] }), ["animated-rigged.gltf", "static-strip.glb", "three-triangles.obj", "two-triangles.stl"]);
    assert.deepEqual(await search({ threeDStructures: ["static"] }), ["static-strip.glb", "three-triangles.obj", "two-triangles.stl"]);
    assert.deepEqual(await search({ threeDStructures: ["animated"] }), ["animated-rigged.gltf"]);
    assert.deepEqual(await search({ threeDStructures: ["rigged"] }), ["animated-rigged.gltf"]);
    assert.deepEqual(await search({ threeDTriangleCountPreset: "under-10k" }), ["animated-rigged.gltf", "static-strip.glb", "three-triangles.obj", "two-triangles.stl"]);
    assert.deepEqual(await search({ threeDTriangleCountRange: { minCount: 3, maxCount: 3 } }), ["three-triangles.obj"]);

    await fs.appendFile(files.obj, "# changed\n");
    const changedScan = await scanImageDirectories([directory]);
    await writeScannedImagesToIndex([directory.id], changedScan.images, changedScan.scannedAt, changedScan.files);
    assert.deepEqual(await search({ threeDTriangleCountRange: { minCount: 3, maxCount: 3 } }), [], "stale facts must not satisfy 3D filters");
    assert.equal((await listPendingThreeDFactCandidates([directory.id])).length, 1);
    console.log("3D fact extraction and filter integration tests passed.");
  } finally {
    await fs.rm(testRoot, { recursive: true, force: true });
  }
}).then(() => app.exit(0)).catch((error) => { console.error(error); app.exit(1); });
