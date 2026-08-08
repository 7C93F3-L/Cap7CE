const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { app, nativeImage } = require("electron");
const {
  parseProbeArguments,
  probeThumbnailAttempt,
  runShellThumbnailProbe
} = require("../scripts/shell-thumbnail-probe-core.cjs");

const testRoot = path.join(os.tmpdir(), `cap7ce-shell-thumbnail-probe-${process.pid}-${Date.now()}`);
const sourcePath = path.join(testRoot, "sample image.png");
const secondSourcePath = path.join(testRoot, "second sample.png");
const outputDirectory = path.join(testRoot, "report");
const directoryOutput = path.join(testRoot, "directory-report");

app.whenReady().then(async () => {
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64"
  );

  try {
    await fs.mkdir(testRoot, { recursive: true });
    await fs.writeFile(sourcePath, png);
    await fs.writeFile(secondSourcePath, png);

    const parsed = parseProbeArguments([
      sourcePath,
      "--output",
      outputDirectory,
      "--timeout-ms",
      "5000",
      "--max-files",
      "2"
    ], testRoot);
    assert.equal(parsed.inputPath, sourcePath);
    assert.equal(parsed.outputDirectory, outputDirectory);
    assert.equal(parsed.timeoutMs, 5000);
    assert.equal(parsed.maxFiles, 2);
    assert.throws(() => parseProbeArguments([], testRoot), /required/);
    assert.throws(() => parseProbeArguments([sourcePath, "--timeout-ms", "0"], testRoot), /integer/);

    const timedOut = await probeThumbnailAttempt(
      () => new Promise((resolve) => setTimeout(() => resolve(nativeImage.createEmpty()), 150)),
      sourcePath,
      256,
      50
    );
    assert.equal(timedOut.status, "timeout");
    assert.match(timedOut.error, /underlying Shell request may still be running/);
    await new Promise((resolve) => setTimeout(resolve, 125));

    const result = await runShellThumbnailProbe({
      createThumbnail: (filePath, size) => nativeImage.createThumbnailFromPath(filePath, size),
      inputPath: sourcePath,
      outputDirectory,
      timeoutMs: 5000
    });

    assert.equal(result.report.inputKind, "file");
    assert.equal(result.report.samples.length, 1);
    assert.equal(result.report.samples[0].sizes.length, 2);
    assert.equal(result.report.abortedAfterTimeout, false);
    for (const sizeResult of result.report.samples[0].sizes) {
      assert.equal(sizeResult.firstAttempt.status, "success");
      assert.equal(sizeResult.secondAttempt.status, "success");
      assert.equal(sizeResult.firstAttempt.isEmpty, false);
      assert.ok(sizeResult.firstAttempt.durationMs >= 0);
      assert.ok(sizeResult.firstAttempt.pixelSize.width > 0);
      assert.match(sizeResult.imageSha256, /^[a-f0-9]{64}$/);
      await fs.access(path.join(outputDirectory, sizeResult.imageFile));
    }

    const reportJson = JSON.parse(await fs.readFile(result.jsonPath, "utf8"));
    const reportMarkdown = await fs.readFile(result.markdownPath, "utf8");
    assert.equal(reportJson.schemaVersion, 1);
    assert.match(reportMarkdown, /人工判断/);
    assert.match(reportMarkdown, /256/);
    assert.match(reportMarkdown, /300/);

    const directoryResult = await runShellThumbnailProbe({
      createThumbnail: (filePath, size) => nativeImage.createThumbnailFromPath(filePath, size),
      inputPath: testRoot,
      outputDirectory: directoryOutput,
      timeoutMs: 5000,
      maxFiles: 1
    });
    assert.equal(directoryResult.report.inputKind, "directory");
    assert.equal(directoryResult.report.discoveredFileCount, 2);
    assert.equal(directoryResult.report.selectedFileCount, 1);
    assert.equal(directoryResult.report.truncated, true);

    console.log(JSON.stringify({
      actualElectronThumbnailCallsVerified: 8,
      timeoutStatusVerified: true,
      fileAndDirectoryInputsVerified: true,
      jsonAndMarkdownReportsVerified: true,
      savedPngsVerified: 4
    }));
  } finally {
    await fs.rm(testRoot, { recursive: true, force: true });
  }
}).then(() => app.exit(0)).catch((error) => {
  console.error(error);
  app.exit(1);
});
