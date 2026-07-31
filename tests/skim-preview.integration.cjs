const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { app } = require("electron");

const testRoot = path.join(os.tmpdir(), `cap7ce-skim-preview-${process.pid}-${Date.now()}`);
app.setPath("userData", path.join(testRoot, "user-data"));

(async () => {
  try {
    const { collectSkimFolderStats, inspectSkimEntry } = require("../dist-electron/skimPreviewService.js");
    const rootPath = path.join(testRoot, "root");
    const nestedPath = path.join(rootPath, "nested");
    const deeperPath = path.join(nestedPath, "deeper");
    await fs.mkdir(deeperPath, { recursive: true });
    await fs.writeFile(path.join(rootPath, "one.txt"), Buffer.alloc(3));
    await fs.writeFile(path.join(nestedPath, "two.bin"), Buffer.alloc(5));
    await fs.writeFile(path.join(deeperPath, "three.dat"), Buffer.alloc(7));

    const folderInfo = await inspectSkimEntry(nestedPath, "folder", [rootPath]);
    assert.equal(folderInfo.kind, "folder");
    assert.equal(folderInfo.withinAddedDirectory, true);

    const filePath = path.join(nestedPath, "two.bin");
    const fileInfo = await inspectSkimEntry(filePath, "file", [path.join(testRoot, "elsewhere")]);
    assert.equal(fileInfo.size, 5);
    assert.equal(fileInfo.extension, ".bin");
    assert.equal(fileInfo.withinAddedDirectory, false);

    const progressUpdates = [];
    const stats = await collectSkimFolderStats(rootPath, () => false, (update) => progressUpdates.push(update), {
      directoryConcurrency: 2,
      progressIntervalMs: 0
    });
    assert.deepEqual(stats, {
      fileCount: 3,
      folderCount: 2,
      totalSize: 15,
      skippedCount: 0,
      status: "completed"
    });
    assert.equal(progressUpdates.at(-1).status, "completed");

    let cancellationChecks = 0;
    const cancelled = await collectSkimFolderStats(rootPath, () => {
      cancellationChecks += 1;
      return cancellationChecks >= 3;
    }, () => undefined, { progressIntervalMs: 0 });
    assert.equal(cancelled.status, "cancelled");

    await assert.rejects(() => inspectSkimEntry(filePath, "folder", []), /type changed/);
    console.log(JSON.stringify({
      metadataInspected: true,
      addedScopeDetected: true,
      descendantStatsComplete: true,
      progressReported: true,
      cancellationHonored: true
    }));
  } finally {
    await fs.rm(testRoot, { recursive: true, force: true });
  }
})().then(() => app.exit(0)).catch((error) => {
  console.error(error);
  app.exit(1);
});
