const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const sharp = require("sharp");
const { createImageDimensionService } = require("../dist-electron/imageDimensionService.js");

class FakeWorker extends EventEmitter {
  postMessage(request) {
    setImmediate(() => this.emit("message", {
      id: request.id,
      result: {
        sourceRevision: request.sourceRevision,
        extractorVersion: 1,
        status: request.filePath.includes("failed") ? "failed" : "indexed",
        width: request.filePath.includes("failed") ? 0 : 1600,
        height: request.filePath.includes("failed") ? 0 : 900,
        errorCode: request.filePath.includes("failed") ? "image-dimensions-read-failed" : ""
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
  throw new Error("Timed out waiting for image dimension service.");
};

const run = async () => {
  const writes = [];
  let candidates = [];
  const service = createImageDimensionService({
    listPendingCandidates: async () => candidates,
    writeBatch: async (records) => { writes.push(...records); return records.length; },
    createWorker: () => new FakeWorker(),
    initialDelayMs: 0,
    yieldMs: 0,
    foregroundYieldMs: 0,
    writeBatchSize: 2
  });
  const candidate = (name, revision = `revision:${name}`) => ({
    filePath: `C:\\Samples\\${name}.png`,
    sourceRevision: revision
  });

  candidates = [candidate("foreground-paused")];
  service.setForegroundActive(true);
  assert.equal(await service.enqueueDirectories(["samples"]), 1);
  await waitFor(() => service.status().phase === "completed");
  assert.equal(service.status().processedCount, 1);
  writes.length = 0;
  service.setForegroundActive(false);

  candidates = [candidate("one"), candidate("one"), candidate("failed")];
  assert.equal(await service.enqueueDirectories(["samples"]), 2);
  candidates = [candidate("one", "revision:one-updated")];
  assert.equal(await service.enqueueDirectories(["samples"]), 1, "a newer source revision should replace its queued predecessor");
  await waitFor(() => service.status().phase === "completed");
  assert.equal(writes.length, 2);
  assert.equal(service.status().indexedCount, 2);
  assert.equal(service.status().failedCount, 1);
  assert.equal(writes.find((write) => write.filePath.endsWith("one.png")).result.sourceRevision, "revision:one-updated");

  candidates = [candidate("discarded")];
  await service.enqueueDirectories(["samples"]);
  service.discardDirectory("C:\\Samples");
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(writes.length, 2, "discarded directory candidates must not be written");
  await service.shutdown();

  const workerRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cap7ce-dimension-worker-"));
  const imagePath = path.join(workerRoot, "landscape.png");
  await sharp({ create: { width: 16, height: 9, channels: 3, background: "red" } }).png().toFile(imagePath);
  const workerWrites = [];
  const workerService = createImageDimensionService({
    listPendingCandidates: async () => [{ filePath: imagePath, sourceRevision: "worker-v1" }],
    writeBatch: async (records) => { workerWrites.push(...records); return records.length; },
    initialDelayMs: 0,
    yieldMs: 0
  });
  await workerService.enqueueDirectories(["worker"]);
  await waitFor(() => workerService.status().phase === "completed");
  assert.equal(workerWrites[0].result.status, "indexed");
  assert.deepEqual(
    { width: workerWrites[0].result.width, height: workerWrites[0].result.height },
    { width: 16, height: 9 }
  );
  await workerService.shutdown();
  await fs.rm(workerRoot, { recursive: true, force: true });
  console.log("Image dimension service integration tests passed.");
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
