const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { app } = require("electron");

const testRoot = path.join(os.tmpdir(), `cap7ce-archive-fact-${process.pid}-${Date.now()}`);
const userDataPath = path.join(testRoot, "user-data");
const directoryPath = path.join(testRoot, "archives");
const payloadPath = path.join(testRoot, "payload");
const sevenZipCliPath = path.join(__dirname, "..", "node_modules", "7z-wasm", "cli.js");
const timestamp = new Date("2026-10-04T00:00:00.000Z").toISOString();
app.setPath("userData", userDataPath);

const createArchive = (args) => {
  const result = spawnSync("node", [sevenZipCliPath, ...args], {
    cwd: payloadPath,
    encoding: "utf8",
    env: { ...process.env, LANG: "C.UTF-8", LC_ALL: "C.UTF-8" },
    windowsHide: true
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
};

app.whenReady().then(async () => {
  try {
    await fs.mkdir(path.join(payloadPath, "nested"), { recursive: true });
    await fs.mkdir(directoryPath, { recursive: true });
    const sourceFiles = [
      ["poster.jpg", "image"], ["clip.mp4", "video"], ["sound.mp3", "audio"], ["brief.docx", "document"],
      ["scene.blend", "project"], ["mesh.obj", "three d"], ["setup.exe", "program"], ["nested/unknown.xyz", "other"]
    ];
    await Promise.all(sourceFiles.map(async ([relativePath, content]) => {
      const filePath = path.join(payloadPath, relativePath);
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, content);
    }));
    await fs.writeFile(path.join(payloadPath, "loose.txt"), "flat");
    const nestedArchive = path.join(directoryPath, "mixed.zip");
    const flatArchive = path.join(directoryPath, "flat.zip");
    createArchive(["a", "-tzip", "mixed.zip", ...sourceFiles.map(([relativePath]) => relativePath)]);
    createArchive(["a", "-tzip", "flat.zip", "loose.txt"]);
    await fs.rename(path.join(payloadPath, "mixed.zip"), nestedArchive);
    await fs.rename(path.join(payloadPath, "flat.zip"), flatArchive);
    await Promise.all([nestedArchive, flatArchive].map((filePath) => fs.utimes(filePath, new Date(timestamp), new Date(timestamp))));

    const directory = { id: "archive-directory", name: "archives", path: directoryPath, indexedCount: 0, createdAt: timestamp, updatedAt: timestamp };
    const { scanImageDirectories } = require("../dist-electron/imageScanner.js");
    const { ensureImageDatabase, listPendingArchiveFactCandidates, writeArchiveFactBatch, writeScannedImagesToIndex } = require("../dist-electron/sqliteImageIndex.js");
    const { inspectArchiveFactBatch } = require("../dist-electron/archiveFactInspector.js");
    const { searchImagesWithAddedDirectories } = require("../dist-electron/imageSearchService.js");
    const { searchScanSnapshotService } = require("../dist-electron/searchScanSnapshotService.js");
    await ensureImageDatabase();
    const scan = await scanImageDirectories([directory]);
    await writeScannedImagesToIndex([directory.id], scan.images, scan.scannedAt, scan.files);
    const candidates = await listPendingArchiveFactCandidates([directory.id]);
    assert.equal(candidates.length, 2);
    const inspected = await inspectArchiveFactBatch(candidates);
    assert.ok(inspected.every((result) => result.status === "indexed"));
    const mixedFact = inspected[candidates.findIndex((candidate) => candidate.filePath === nestedArchive)];
    assert.equal(mixedFact.fileCount, 8);
    assert.equal(mixedFact.hasDirectories, true);
    assert.deepEqual(new Set(mixedFact.contentTypes), new Set(["image", "video", "audio", "document", "project", "threeD", "program", "other"]));
    assert.equal(await writeArchiveFactBatch(candidates.map((candidate, index) => ({ filePath: candidate.filePath, result: inspected[index] }))), 2);
    assert.deepEqual(await listPendingArchiveFactCandidates([directory.id]), []);

    searchScanSnapshotService.setActive(false);
    const search = async (facets) => (await searchImagesWithAddedDirectories({
      query: "", directoryId: "all", fileFormat: "all", sortField: "file_name", sortDirection: "asc",
      selectedExtensions: [".zip"], ...facets
    }, [directory])).images.map((item) => item.fileName);
    assert.deepEqual(await search({ archiveContentTypes: ["program"] }), ["mixed.zip"]);
    assert.deepEqual(await search({ archiveContentTypes: ["image", "program"] }), ["mixed.zip"]);
    assert.deepEqual(await search({ archiveEntryCountPreset: "under-10" }), ["flat.zip", "mixed.zip"]);
    assert.deepEqual(await search({ archiveEntryCountRange: { minCount: 8, maxCount: 8 } }), ["mixed.zip"]);
    assert.deepEqual(await search({ archiveStructures: ["flat"] }), ["flat.zip"]);
    assert.deepEqual(await search({ archiveStructures: ["nested"] }), ["mixed.zip"]);

    await fs.appendFile(nestedArchive, Buffer.from([0]));
    const changedScan = await scanImageDirectories([directory]);
    await writeScannedImagesToIndex([directory.id], changedScan.images, changedScan.scannedAt, changedScan.files);
    assert.deepEqual(await search({ archiveContentTypes: ["program"] }), [], "stale archive facts must not satisfy filters");
    assert.equal((await listPendingArchiveFactCandidates([directory.id])).length, 1);
    console.log("Archive fact extraction and filter integration tests passed.");
  } finally {
    await fs.rm(testRoot, { recursive: true, force: true });
  }
}).then(() => app.exit(0)).catch((error) => { console.error(error); app.exit(1); });
