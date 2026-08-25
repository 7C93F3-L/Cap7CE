const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { createEmbeddedMetadataService } = require("../dist-electron/embeddedMetadataService.js");
const { createEmbeddedMetadataPreviewCoordinator, startEmbeddedMetadataPreviewProbe } = require("../dist-electron/embeddedMetadataPreviewProbe.js");

class FakeWorker extends EventEmitter {
  constructor(delay = 1) {
    super();
    this.delay = delay;
    this.timer = null;
  }

  postMessage(request) {
    this.timer = setTimeout(() => this.emit("message", {
      id: request.id,
      extraction: {
        sourceRevision: `revision:${request.filePath}`,
        extractorVersion: 1,
        status: request.filePath.includes("empty") ? "empty" : "indexed",
        evidence: request.filePath.includes("empty") ? [] : [{ kind: "embedded_title", searchText: "sample" }],
        capturedAt: null,
        errorCode: ""
      }
    }), this.delay);
  }

  async terminate() {
    if (this.timer) clearTimeout(this.timer);
    this.emit("exit", 1);
    return 1;
  }
}

const waitFor = async (predicate) => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("Timed out waiting for embedded metadata service.");
};

const createPreviewData = (filePath) => ({
  sessionId: `skim:${filePath}`,
  itemId: filePath,
  filePath,
  fileName: filePath.split("\\").at(-1),
  fileSize: 1,
  previewUrl: "",
  thumbnailUrl: "",
  provider: "fileInfo",
  info: { kind: "file", path: filePath },
  skimActive: true,
  theme: "dark",
  language: "zh-CN",
  appearanceColors: { themeColor: "#000000", accentColor: "#ffffff" }
});

const run = async () => {
  const writes = [];
  let candidates = [
    { filePath: "C:\\Samples\\one.png", sourceRevision: "1:1" },
    { filePath: "C:\\Samples\\empty.jpg", sourceRevision: "2:2" }
  ];
  const workers = [];
  const service = createEmbeddedMetadataService({
    listPendingCandidates: async () => candidates,
    writeBatch: async (records) => {
      writes.push(...records);
      return records.length;
    },
    createWorker: () => {
      const worker = new FakeWorker();
      workers.push(worker);
      return worker;
    },
    batchSize: 2,
    yieldMs: 0
  });

  await service.startBackfill();
  await waitFor(() => service.status().phase === "completed");
  assert.equal(workers.length, 2, "each source should release its isolated worker after extraction");
  assert.deepEqual(service.status(), {
    phase: "completed",
    totalCount: 2,
    queuedCount: 0,
    processedCount: 2,
    indexedCount: 1,
    emptyCount: 1,
    failedCount: 0,
    activeDurationMs: service.status().activeDurationMs
  });
  assert.equal(writes.length, 2);

  candidates = [{ filePath: "C:\\Samples\\slow.png", sourceRevision: "3:3" }];
  const slowService = createEmbeddedMetadataService({
    listPendingCandidates: async () => candidates,
    writeBatch: async () => 1,
    createWorker: () => new FakeWorker(100),
    yieldMs: 0
  });
  await slowService.startBackfill();
  assert.equal(await slowService.cancel(), true);
  await waitFor(() => slowService.status().phase === "cancelled");
  assert.equal(slowService.status().queuedCount, 0);
  assert.equal(slowService.status().processedCount, 0);
  assert.equal(slowService.status().failedCount, 0);

  const foregroundCandidates = [
    { filePath: "C:\\Samples\\foreground-one.png", sourceRevision: "4:4" },
    { filePath: "C:\\Samples\\foreground-two.png", sourceRevision: "5:5" }
  ];
  const foregroundService = createEmbeddedMetadataService({
    listPendingCandidates: async () => foregroundCandidates,
    writeBatch: async (records) => records.length,
    createWorker: () => new FakeWorker(),
    batchSize: 1,
    yieldMs: 0,
    foregroundYieldMs: 80
  });
  foregroundService.setForegroundActive(true);
  await foregroundService.enqueueDirectories(["directory-1"]);
  await waitFor(() => foregroundService.status().processedCount === 1);
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(foregroundService.status().processedCount, 1, "automatic foreground work should yield between files");
  await waitFor(() => foregroundService.status().phase === "completed");

  const manualService = createEmbeddedMetadataService({
    listPendingCandidates: async () => foregroundCandidates,
    writeBatch: async (records) => records.length,
    createWorker: () => new FakeWorker(),
    batchSize: 1,
    yieldMs: 0,
    foregroundYieldMs: 500
  });
  manualService.setForegroundActive(true);
  await manualService.startBackfill();
  await Promise.race([
    waitFor(() => manualService.status().phase === "completed"),
    new Promise((_, reject) => setTimeout(() => reject(new Error("Manual backfill was foreground-throttled.")), 150))
  ]);

  const previewData = createPreviewData("C:\\Samples\\preview.png");
  const previewProbe = startEmbeddedMetadataPreviewProbe(previewData, { createWorker: () => new FakeWorker() });
  assert.ok(previewProbe, "supported skim files without stored metadata should start a temporary probe");
  assert.deepEqual(await previewProbe.result, {
    items: [{ kind: "embedded_title", text: "sample" }],
    capturedAt: null
  });
  assert.equal(startEmbeddedMetadataPreviewProbe({ ...previewData, skimActive: false }, { createWorker: () => new FakeWorker() }), null);
  assert.equal(startEmbeddedMetadataPreviewProbe({ ...previewData, embeddedMetadata: { items: [], capturedAt: "2026-01-01" } }, { createWorker: () => new FakeWorker() }), null);
  const timedOutProbe = startEmbeddedMetadataPreviewProbe(previewData, { createWorker: () => new FakeWorker(100), timeoutMs: 1 });
  assert.equal(await timedOutProbe.result, null, "a stalled temporary preview probe should time out without metadata");

  let activePreviewData = createPreviewData("C:\\Samples\\old.png");
  const publishedUpdates = [];
  const coordinator = createEmbeddedMetadataPreviewCoordinator({
    getActiveData: () => activePreviewData,
    publish: (update) => publishedUpdates.push(update),
    probeDependencies: { createWorker: () => new FakeWorker(20) }
  });
  coordinator.start(activePreviewData);
  activePreviewData = createPreviewData("C:\\Samples\\new.png");
  coordinator.start(activePreviewData);
  await waitFor(() => publishedUpdates.length === 1);
  assert.equal(publishedUpdates[0].filePath, activePreviewData.filePath, "a cancelled skim probe must not publish into the next preview");
  activePreviewData = createPreviewData("C:\\Samples\\stored-empty.png");
  coordinator.start(activePreviewData, false);
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(publishedUpdates.length, 1, "a current stored empty result should not reread the source file");
  coordinator.cancel();

  console.log("Embedded metadata service integration tests passed.");
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
