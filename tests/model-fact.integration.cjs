const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { app } = require("electron");

const testRoot = path.join(os.tmpdir(), `cap7ce-model-fact-${process.pid}-${Date.now()}`);
const userDataPath = path.join(testRoot, "user-data");
const directoryPath = path.join(testRoot, "models");
const timestamp = new Date("2026-10-05T00:00:00.000Z").toISOString();
app.setPath("userData", userDataPath);

const u64 = (value) => { const buffer = Buffer.alloc(8); buffer.writeBigUInt64LE(BigInt(value)); return buffer; };
const u32 = (value) => { const buffer = Buffer.alloc(4); buffer.writeUInt32LE(value); return buffer; };
const ggufString = (value) => { const bytes = Buffer.from(value); return Buffer.concat([u64(bytes.length), bytes]); };
const ggufTensor = (name, shape, type) => Buffer.concat([
  ggufString(name), u32(shape.length), ...shape.map(u64), u32(type), u64(0)
]);
const createGguf = () => Buffer.concat([
  Buffer.from("GGUF"), u32(3), u64(2), u64(0),
  ggufTensor("weight", [1_000_000_000, 4], 12),
  ggufTensor("scale", [1_000_000], 1)
]);
const createSafeTensors = () => {
  const header = Buffer.from(JSON.stringify({
    weight: { dtype: "I8", shape: [7_100_000_000], data_offsets: [0, 7_100_000_000] },
    scale: { dtype: "F32", shape: [1024], data_offsets: [7_100_000_000, 7_100_004_096] },
    __metadata__: { format: "pt" }
  }));
  return Buffer.concat([u64(header.length), header]);
};

app.whenReady().then(async () => {
  try {
    await fs.mkdir(directoryPath, { recursive: true });
    const ggufPath = path.join(directoryPath, "four-billion-q4.gguf");
    const safePath = path.join(directoryPath, "seven-billion-int8.safetensors");
    const invalidPath = path.join(directoryPath, "invalid.gguf");
    await Promise.all([
      fs.writeFile(ggufPath, createGguf()),
      fs.writeFile(safePath, createSafeTensors()),
      fs.writeFile(invalidPath, "invalid model")
    ]);
    await Promise.all([ggufPath, safePath, invalidPath].map((filePath) => fs.utimes(filePath, new Date(timestamp), new Date(timestamp))));
    const directory = { id: "model-directory", name: "models", path: directoryPath, indexedCount: 0, createdAt: timestamp, updatedAt: timestamp };
    const { scanImageDirectories } = require("../dist-electron/imageScanner.js");
    const { ensureImageDatabase, listPendingModelFactCandidates, writeModelFactBatch, writeScannedImagesToIndex } = require("../dist-electron/sqliteImageIndex.js");
    const { inspectModelFactBatch } = require("../dist-electron/modelFactInspector.js");
    const { searchImagesWithAddedDirectories } = require("../dist-electron/imageSearchService.js");
    const { searchScanSnapshotService } = require("../dist-electron/searchScanSnapshotService.js");
    await ensureImageDatabase();
    const scan = await scanImageDirectories([directory]);
    await writeScannedImagesToIndex([directory.id], scan.images, scan.scannedAt, scan.files);
    const candidates = await listPendingModelFactCandidates([directory.id]);
    assert.equal(candidates.length, 3);
    const inspected = await inspectModelFactBatch(candidates);
    const gguf = inspected[candidates.findIndex((candidate) => candidate.filePath === ggufPath)];
    const safe = inspected[candidates.findIndex((candidate) => candidate.filePath === safePath)];
    const invalid = inspected[candidates.findIndex((candidate) => candidate.filePath === invalidPath)];
    assert.deepEqual({ status: gguf.status, parameterCount: gguf.parameterCount, precision: gguf.precision }, { status: "indexed", parameterCount: 4_001_000_000, precision: "4bit" });
    assert.deepEqual({ status: safe.status, parameterCount: safe.parameterCount, precision: safe.precision }, { status: "indexed", parameterCount: 7_100_001_024, precision: "8bit" });
    assert.equal(invalid.status, "failed");
    assert.equal(await writeModelFactBatch(candidates.map((candidate, index) => ({ filePath: candidate.filePath, result: inspected[index] }))), 3);
    assert.deepEqual(await listPendingModelFactCandidates([directory.id]), []);

    searchScanSnapshotService.setActive(false);
    const search = async (facets) => (await searchImagesWithAddedDirectories({
      query: "", directoryId: "all", fileFormat: "all", sortField: "file_name", sortDirection: "asc",
      selectedExtensions: [".gguf", ".safetensors"], ...facets
    }, [directory])).images.map((item) => item.fileName);
    assert.deepEqual(await search({ modelParameterCounts: ["3b-7b"] }), ["four-billion-q4.gguf"]);
    assert.deepEqual(await search({ modelParameterCounts: ["7b-14b"] }), ["seven-billion-int8.safetensors"]);
    assert.deepEqual(await search({ modelPrecisions: ["4bit"] }), ["four-billion-q4.gguf"]);
    assert.deepEqual(await search({ modelPrecisions: ["8bit"] }), ["seven-billion-int8.safetensors"]);

    await fs.appendFile(ggufPath, Buffer.from([0]));
    const changedScan = await scanImageDirectories([directory]);
    await writeScannedImagesToIndex([directory.id], changedScan.images, changedScan.scannedAt, changedScan.files);
    assert.deepEqual(await search({ modelPrecisions: ["4bit"] }), [], "stale model facts must not satisfy filters");
    assert.equal((await listPendingModelFactCandidates([directory.id])).length, 1);
    console.log("Model fact extraction and filter integration tests passed.");
  } finally { await fs.rm(testRoot, { recursive: true, force: true }); }
}).then(() => app.exit(0)).catch((error) => { console.error(error); app.exit(1); });
