const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { app } = require("electron");

const testRoot = path.join(os.tmpdir(), `cap7ce-audio-fact-${process.pid}-${Date.now()}`);
const userDataPath = path.join(testRoot, "user-data");
const directoryPath = path.join(testRoot, "audio");
const audioPath = path.join(directoryPath, "sample.mp3");
const timestamp = new Date("2026-10-04T00:00:00.000Z").toISOString();
app.setPath("userData", userDataPath);

const waitFor = async (predicate) => {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("Timed out waiting for audio fact service.");
};

app.whenReady().then(async () => {
  try {
    await fs.mkdir(directoryPath, { recursive: true });
    await fs.writeFile(audioPath, "synthetic-audio-container");
    await fs.utimes(audioPath, new Date(timestamp), new Date(timestamp));
    const directory = { id: "audio-directory", name: "audio", path: directoryPath, indexedCount: 0, createdAt: timestamp, updatedAt: timestamp };
    const { scanImageDirectories } = require("../dist-electron/imageScanner.js");
    const { ensureImageDatabase, listPendingAudioFactCandidates, writeAudioFactBatch, writeScannedImagesToIndex } = require("../dist-electron/sqliteImageIndex.js");
    const { searchImagesWithAddedDirectories } = require("../dist-electron/imageSearchService.js");
    const { searchScanSnapshotService } = require("../dist-electron/searchScanSnapshotService.js");
    const { createAudioFactService } = require("../dist-electron/audioFactService.js");

    await ensureImageDatabase();
    const scan = await scanImageDirectories([directory]);
    await writeScannedImagesToIndex([directory.id], scan.images, scan.scannedAt, scan.files);
    const candidate = (await listPendingAudioFactCandidates([directory.id]))[0];
    assert.equal(candidate.filePath, audioPath);
    assert.equal(await writeAudioFactBatch([{
      filePath: audioPath,
      result: { sourceRevision: candidate.sourceRevision, extractorVersion: 1, status: "indexed", durationMs: 90_000, channelCount: 2, errorCode: "" }
    }]), 1);
    assert.deepEqual(await listPendingAudioFactCandidates([directory.id]), []);

    searchScanSnapshotService.setActive(false);
    const search = async (facets) => (await searchImagesWithAddedDirectories({
      query: "", directoryId: "all", fileFormat: "all", sortField: "file_name", sortDirection: "asc",
      selectedExtensions: [".mp3"], ...facets
    }, [directory])).images.map((item) => item.fileName);
    assert.deepEqual(await search({ audioDurationPreset: "30s-5m" }), ["sample.mp3"]);
    assert.deepEqual(await search({ audioDurationPreset: "under-5s" }), []);
    assert.deepEqual(await search({ audioDurationRange: { minSeconds: 80, maxSeconds: 100 } }), ["sample.mp3"]);
    assert.deepEqual(await search({ audioChannels: ["stereo"] }), ["sample.mp3"]);
    assert.deepEqual(await search({ audioChannels: ["mono"] }), []);
    assert.deepEqual(await search({ audioChannels: ["multichannel"] }), []);

    await fs.appendFile(audioPath, "changed");
    const changedScan = await scanImageDirectories([directory]);
    await writeScannedImagesToIndex([directory.id], changedScan.images, changedScan.scannedAt, changedScan.files);
    assert.deepEqual(await search({ audioChannels: ["stereo"] }), [], "stale facts must not satisfy audio filters");
    assert.equal((await listPendingAudioFactCandidates([directory.id])).length, 1);

    const writes = [];
    let serviceCandidates = [{ filePath: "C:\\audio\\one.mp3", sourceRevision: "one" }];
    const service = createAudioFactService({
      listPendingCandidates: async () => serviceCandidates,
      inspectBatch: async (items) => items.map((item) => ({ sourceRevision: item.sourceRevision, extractorVersion: 1, status: "indexed", durationMs: 10_000, channelCount: 2, errorCode: "" })),
      writeBatch: async (records) => { writes.push(...records); return records.length; },
      batchSize: 2, initialDelayMs: 0, yieldMs: 0, foregroundYieldMs: 0
    });
    await service.enqueueDirectories(["audio-directory"]);
    await waitFor(() => writes.length === 1);
    serviceCandidates = [{ filePath: "C:\\audio\\discarded.mp3", sourceRevision: "discarded" }];
    await service.enqueueDirectories(["audio-directory"]);
    service.discardDirectory("C:\\audio");
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(writes.length, 1);
    service.shutdown();
    console.log("Audio fact and filter integration tests passed.");
  } finally {
    await fs.rm(testRoot, { recursive: true, force: true });
  }
}).then(() => app.exit(0)).catch((error) => { console.error(error); app.exit(1); });
