const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const sharp = require("sharp");
const { createVisualPropertyService } = require("../dist-electron/visualPropertyService.js");

const properties = {
  transparentRatio: 0, semitransparentRatio: 0, borderTransparentRatio: 0,
  brightnessMean: 5000, brightnessMedian: 5000, darkRatio: 0, highlightRatio: 0,
  saturationMean: 5000, highSaturationRatio: 0, lowSaturationRatio: 0,
  borderWhiteRatio: 0, borderBlackRatio: 0, borderUniformity: 5000,
  colorRatios: { red: 10000, orange: 0, yellow: 0, green: 0, cyan: 0, blue: 0, purple: 0, pink: 0 },
  colorBlockRatios: { red: 10000, orange: 0, yellow: 0, green: 0, cyan: 0, blue: 0, purple: 0, pink: 0 }
};

class FakeWorker extends EventEmitter {
  postMessage(request) {
    setImmediate(() => this.emit("message", {
      id: request.id,
      record: {
        sourceRevision: request.sourceRevision,
        analyzerVersion: 1,
        status: request.thumbnailPath.includes("failed") ? "failed" : "indexed",
        properties: request.thumbnailPath.includes("failed") ? null : properties,
        errorCode: request.thumbnailPath.includes("failed") ? "thumbnail-analysis-failed" : ""
      }
    }));
  }
  unref() {}
  async terminate() { this.emit("exit", 0); return 0; }
}

const waitFor = async (predicate) => {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("Timed out waiting for visual property service.");
};

const run = async () => {
  const writes = [];
  const filteredBatches = [];
  const service = createVisualPropertyService({
    filterPendingCandidates: async (candidates) => {
      filteredBatches.push(candidates.map((candidate) => candidate.filePath));
      return candidates.filter((candidate) => !candidate.filePath.includes("current"));
    },
    writeBatch: async (records) => { writes.push(...records); return records.length; },
    createWorker: () => new FakeWorker(),
    initialDelayMs: 0,
    yieldMs: 0,
    foregroundYieldMs: 0,
    writeBatchSize: 2
  });

  const candidate = (name) => ({
    filePath: `C:\\Samples\\${name}.png`,
    thumbnailPath: `C:\\Cache\\${name}.capth`,
    sourceRevision: `revision:${name}`
  });
  service.setForegroundActive(true);
  service.enqueue(candidate("foreground-paused"));
  await waitFor(() => service.status().phase === "completed");
  assert.equal(service.status().processedCount, 1);
  writes.length = 0;
  filteredBatches.length = 0;
  service.setForegroundActive(false);
  assert.equal(service.enqueue(candidate("one")), true);
  assert.equal(service.enqueue(candidate("one")), false);
  const updatedOne = { ...candidate("one"), sourceRevision: "revision:one-updated" };
  assert.equal(service.enqueue(updatedOne), true, "a newer source revision should replace its queued predecessor");
  service.enqueue(candidate("current"));
  service.enqueue(candidate("failed"));
  await waitFor(() => service.status().phase === "completed");
  assert.equal(filteredBatches.length, 1, "availability bursts should share one database filter pass");
  assert.equal(writes.length, 2);
  assert.equal(service.status().indexedCount, 2);
  assert.equal(service.status().failedCount, 1);
  assert.equal(writes.find((write) => write.filePath.endsWith("one.png")).record.sourceRevision, "revision:one-updated");

  service.enqueue(candidate("discarded"));
  service.discardDirectory("C:\\Samples");
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(writes.length, 2, "discarded directory candidates must not be written");
  await service.shutdown();

  const workerRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cap7ce-visual-worker-"));
  const thumbnailPath = path.join(workerRoot, "transparent.png");
  await sharp({ create: { width: 12, height: 8, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 0 } } })
    .png()
    .toFile(thumbnailPath);
  const workerWrites = [];
  const workerService = createVisualPropertyService({
    filterPendingCandidates: async (candidates) => candidates,
    writeBatch: async (records) => { workerWrites.push(...records); return records.length; },
    initialDelayMs: 0,
    yieldMs: 0
  });
  workerService.enqueue({ filePath: path.join(workerRoot, "source.png"), thumbnailPath, sourceRevision: "worker-v1" });
  await waitFor(() => workerService.status().phase === "completed");
  assert.equal(workerWrites[0].record.status, "indexed");
  assert.equal(workerWrites[0].record.properties.transparentRatio, 10000);
  await workerService.shutdown();
  await fs.rm(workerRoot, { recursive: true, force: true });
  console.log("Visual property service integration tests passed.");
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
