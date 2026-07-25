const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { app } = require("electron");

const testRoot = path.join(
  os.tmpdir(),
  `cap7ce-file-drag-${process.pid}-${Date.now()}`
);
const userDataPath = path.join(testRoot, "user-data");
const sourceDirectory = path.join(testRoot, "sources");
const firstSourcePath = path.join(sourceDirectory, "first.png");
const secondSourcePath = path.join(sourceDirectory, "second.psd");
const cachePath = path.join(userDataPath, "thumbnails", "blocked.capth");

app.setPath("userData", userDataPath);

(async () => {
  try {
    await fs.mkdir(sourceDirectory, { recursive: true });
    await fs.mkdir(path.dirname(cachePath), { recursive: true });
    await fs.writeFile(firstSourcePath, "first");
    await fs.writeFile(secondSourcePath, "second");
    await fs.writeFile(cachePath, "cache");

    const {
      startNativeFileDrag,
      validateNativeDragFilePaths
    } = require("../dist-electron/fileDragService.js");

    const validatedPaths = validateNativeDragFilePaths([
      firstSourcePath,
      secondSourcePath,
      firstSourcePath
    ]);
    assert.deepEqual(validatedPaths, [
      path.resolve(firstSourcePath),
      path.resolve(secondSourcePath)
    ]);
    assert.throws(
      () => validateNativeDragFilePaths([cachePath]),
      /自身缓存/
    );
    assert.throws(
      () => validateNativeDragFilePaths([path.join(sourceDirectory, "missing.png")]),
      /不存在或无法访问/
    );

    let dragItem = null;
    startNativeFileDrag({
      startDrag: (item) => {
        dragItem = item;
      }
    }, [firstSourcePath, secondSourcePath]);
    assert.ok(dragItem);
    assert.equal(dragItem.file, path.resolve(firstSourcePath));
    assert.deepEqual(dragItem.files, [
      path.resolve(firstSourcePath),
      path.resolve(secondSourcePath)
    ]);
    assert.equal(dragItem.icon.isEmpty(), false);

    console.log(JSON.stringify({
      validatedSourceFiles: validatedPaths.length,
      duplicatePathsRemoved: true,
      cachePathRejected: true,
      missingPathRejected: true,
      nativeMultiFilePayload: dragItem.files.length
    }));
  } finally {
    await fs.rm(testRoot, { recursive: true, force: true });
  }
})().then(() => {
  app.exit(0);
}).catch((error) => {
  console.error(error);
  app.exit(1);
});
