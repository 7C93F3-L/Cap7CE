const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { app } = require("electron");

const testRoot = path.join(os.tmpdir(), `cap7ce-video-fact-${process.pid}-${Date.now()}`);
const userDataPath = path.join(testRoot, "user-data");
const directoryPath = path.join(testRoot, "videos");
const videoPath = path.join(directoryPath, "sample.mp4");
const timestamp = new Date("2026-10-04T00:00:00.000Z").toISOString();
app.setPath("userData", userDataPath);

const waitFor = async (predicate) => {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("Timed out waiting for video fact service.");
};

app.whenReady().then(async () => {
  try {
    await fs.mkdir(directoryPath, { recursive: true });
    await fs.writeFile(videoPath, "synthetic-video-container");
    await fs.utimes(videoPath, new Date(timestamp), new Date(timestamp));
    const directory = { id: "video-directory", name: "videos", path: directoryPath, indexedCount: 0, createdAt: timestamp, updatedAt: timestamp };
    const { scanImageDirectories } = require("../dist-electron/imageScanner.js");
    const {
      ensureImageDatabase,
      listPendingVideoColorCandidates,
      listPendingVideoFactCandidates,
      writeScannedImagesToIndex,
      writeVideoColorBatch,
      writeVideoFactBatch
    } = require("../dist-electron/sqliteImageIndex.js");
    const { searchImagesWithAddedDirectories } = require("../dist-electron/imageSearchService.js");
    const { searchScanSnapshotService } = require("../dist-electron/searchScanSnapshotService.js");
    const { createVideoFactService } = require("../dist-electron/videoFactService.js");
    const { createVideoColorService } = require("../dist-electron/videoColorService.js");

    await ensureImageDatabase();
    const scan = await scanImageDirectories([directory]);
    await writeScannedImagesToIndex([directory.id], scan.images, scan.scannedAt, scan.files);
    const candidate = (await listPendingVideoFactCandidates([directory.id]))[0];
    assert.equal(candidate.filePath, videoPath);
    assert.equal(await writeVideoFactBatch([{
      filePath: videoPath,
      result: { sourceRevision: candidate.sourceRevision, extractorVersion: 2, status: "indexed", durationMs: 90_000, width: 1920, height: 1080, errorCode: "" }
    }]), 1);
    assert.deepEqual(await listPendingVideoFactCandidates([directory.id]), []);
    const colorCandidate = (await listPendingVideoColorCandidates([directory.id]))[0];
    const redProperties = {
      transparentRatio: 0, semitransparentRatio: 0, borderTransparentRatio: 0,
      brightnessMean: 5000, brightnessMedian: 5000, darkRatio: 0, highlightRatio: 0,
      saturationMean: 9000, highSaturationRatio: 9000, lowSaturationRatio: 0,
      borderWhiteRatio: 0, borderBlackRatio: 0, borderUniformity: 5000,
      colorRatios: { red: 10000, orange: 0, yellow: 0, green: 0, cyan: 0, blue: 0, purple: 0, pink: 0 },
      colorBlockRatios: { red: 10000, orange: 0, yellow: 0, green: 0, cyan: 0, blue: 0, purple: 0, pink: 0 }
    };
    assert.equal(await writeVideoColorBatch([{
      filePath: videoPath,
      record: { sourceRevision: colorCandidate.sourceRevision, analyzerVersion: 1, status: "indexed", properties: redProperties, errorCode: "" }
    }]), 1);
    assert.deepEqual(await listPendingVideoColorCandidates([directory.id]), []);

    searchScanSnapshotService.setActive(false);
    const search = async (facets) => (await searchImagesWithAddedDirectories({
      query: "", directoryId: "all", fileFormat: "all", sortField: "file_name", sortDirection: "asc",
      selectedExtensions: [".mp4"], ...facets
    }, [directory])).images.map((item) => item.fileName);
    assert.deepEqual(await search({ videoDurationPreset: "1m-5m" }), ["sample.mp4"]);
    assert.deepEqual(await search({ videoDurationPreset: "under-15s" }), []);
    assert.deepEqual(await search({ videoDurationRange: { minSeconds: 80, maxSeconds: 100 } }), ["sample.mp4"]);
    assert.deepEqual(await search({ videoAspectRatios: ["landscape"] }), ["sample.mp4"]);
    assert.deepEqual(await search({ videoAspectRatios: ["portrait"] }), []);
    assert.deepEqual(await search({ videoAspectRatioValues: [{ width: 16, height: 9 }] }), ["sample.mp4"]);
    assert.deepEqual(await search({ videoResolutions: ["1080p"] }), ["sample.mp4"]);
    assert.deepEqual(await search({ videoResolutions: ["4k"] }), []);
    assert.deepEqual(await search({ videoDimensionFilter: { mode: "range", minWidth: 1900, minHeight: 1000 } }), ["sample.mp4"]);
    assert.deepEqual(await search({ videoDimensionFilter: { mode: "exact", width: 1920, height: 1080 } }), ["sample.mp4"]);
    assert.deepEqual(await search({ videoVisualColors: ["red"] }), ["sample.mp4"]);
    assert.deepEqual(await search({ videoVisualColors: ["blue"] }), []);
    assert.deepEqual(await search({ videoColorTraits: ["vivid-image"] }), ["sample.mp4"]);

    await fs.appendFile(videoPath, "changed");
    const changedScan = await scanImageDirectories([directory]);
    await writeScannedImagesToIndex([directory.id], changedScan.images, changedScan.scannedAt, changedScan.files);
    assert.deepEqual(await search({ videoDurationPreset: "1m-5m" }), [], "stale facts must not satisfy video filters");
    assert.deepEqual(await search({ videoVisualColors: ["red"] }), [], "stale representative colors must not satisfy video filters");
    assert.equal((await listPendingVideoFactCandidates([directory.id])).length, 1);
    assert.equal((await listPendingVideoColorCandidates([directory.id])).length, 1);

    const writes = [];
    let serviceCandidates = [{ filePath: "C:\\videos\\one.mp4", sourceRevision: "one" }];
    const service = createVideoFactService({
      listPendingCandidates: async () => serviceCandidates,
      inspectBatch: async (items) => items.map((item) => ({ sourceRevision: item.sourceRevision, extractorVersion: 2, status: "indexed", durationMs: 10_000, width: 1280, height: 720, errorCode: "" })),
      writeBatch: async (records) => { writes.push(...records); return records.length; },
      batchSize: 2, initialDelayMs: 0, yieldMs: 0, foregroundYieldMs: 0
    });
    await service.enqueueDirectories(["video-directory"]);
    await waitFor(() => writes.length === 1);
    serviceCandidates = [{ filePath: "C:\\videos\\discarded.mp4", sourceRevision: "discarded" }];
    await service.enqueueDirectories(["video-directory"]);
    service.discardDirectory("C:\\videos");
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(writes.length, 1);
    service.shutdown();

    const analysisCandidates = [];
    const colorFailures = [];
    let colorServiceCandidates = [{ filePath: "C:\\videos\\color.mp4", sourceRevision: "color" }];
    const colorService = createVideoColorService({
      listPendingCandidates: async () => colorServiceCandidates,
      ensureThumbnailPath: async (filePath) => filePath.includes("failed") ? Promise.reject(Object.assign(new Error("missing"), { code: "ENOENT" })) : "C:\\cache\\color.capshth",
      enqueueAnalysis: (candidate) => { analysisCandidates.push(candidate); return true; },
      writeBatch: async (records) => { colorFailures.push(...records); return records.length; },
      initialDelayMs: 0, yieldMs: 0, foregroundYieldMs: 0
    });
    await colorService.enqueueDirectories(["video-directory"]);
    await waitFor(() => analysisCandidates.length === 1);
    assert.equal(analysisCandidates[0].sourceRevision, "color");
    colorServiceCandidates = [{ filePath: "C:\\videos\\failed.mp4", sourceRevision: "failed" }];
    await colorService.enqueueDirectories(["video-directory"]);
    await waitFor(() => colorFailures.length === 1);
    assert.equal(colorFailures[0].record.status, "failed");
    assert.equal(colorFailures[0].record.errorCode, "video-thumbnail-enoent");
    colorService.shutdown();
    console.log("Video fact, representative color, and filter integration tests passed.");
  } finally {
    await fs.rm(testRoot, { recursive: true, force: true });
  }
}).then(() => app.exit(0)).catch((error) => { console.error(error); app.exit(1); });
