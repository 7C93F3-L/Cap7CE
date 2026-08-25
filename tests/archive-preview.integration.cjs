const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const {
  ArchivePreviewError,
  closeArchivePreviewSession,
  openArchivePreviewSession,
  parseArchiveListOutput
} = require("../dist-electron/archivePreviewService.js");

const sevenZipCliPath = path.join(__dirname, "..", "node_modules", "7z-wasm", "cli.js");

const createArchive = (cwd, args) => {
  const result = spawnSync(process.execPath, [sevenZipCliPath, ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, LANG: "C.UTF-8", LC_ALL: "C.UTF-8" },
    windowsHide: true
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
};

const expectReason = async (promise, reason) => {
  await assert.rejects(promise, (error) => (
    error instanceof ArchivePreviewError && error.reason === reason
  ));
};

const run = async () => {
  const testRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cap7ce-archive-preview-"));
  const payloadRoot = path.join(testRoot, "压缩包内容");
  const nestedRoot = path.join(payloadRoot, "子目录");
  const zipPath = path.join(testRoot, "普通.zip");
  const sevenZipPath = path.join(testRoot, "普通.7z");
  const encryptedPath = path.join(testRoot, "加密.7z");
  const corruptPath = path.join(testRoot, "损坏.zip");
  const unsupportedPath = path.join(testRoot, "未接入.tar");
  try {
    await fs.mkdir(nestedRoot, { recursive: true });
    await Promise.all([
      fs.writeFile(path.join(payloadRoot, "使用说明.txt"), "Cap7CE archive preview"),
      fs.writeFile(path.join(nestedRoot, "sample.bin"), Buffer.from([0, 1, 2, 3])),
      fs.writeFile(corruptPath, "not an archive"),
      fs.writeFile(unsupportedPath, "unsupported")
    ]);
    createArchive(testRoot, ["a", "-tzip", path.basename(zipPath), path.basename(payloadRoot)]);
    createArchive(testRoot, ["a", "-t7z", path.basename(sevenZipPath), path.basename(payloadRoot)]);
    createArchive(testRoot, ["a", "-t7z", "-pCap7CEProbe", "-mhe=on", path.basename(encryptedPath), path.basename(payloadRoot)]);

    const zipBefore = await fs.readFile(zipPath);
    const zipPreview = await openArchivePreviewSession("zip", zipPath);
    assert.equal(zipPreview.entries.some((entry) => entry.path.includes("使用说明.txt")), true);
    assert.equal(zipPreview.entries.some((entry) => entry.directory), true);
    assert.equal(zipPreview.totalUncompressedSize >= 25, true);
    assert.deepEqual(await fs.readFile(zipPath), zipBefore);

    const sevenZipPreview = await openArchivePreviewSession("7z", sevenZipPath);
    assert.equal(sevenZipPreview.entries.some((entry) => entry.path.includes("子目录/sample.bin")), true);
    assert.equal(sevenZipPreview.truncated, false);

    await expectReason(openArchivePreviewSession("encrypted", encryptedPath), "passwordRequired");
    await expectReason(openArchivePreviewSession("corrupt", corruptPath), "invalidArchive");
    await expectReason(openArchivePreviewSession("unsupported", unsupportedPath), "unsupportedArchive");

    const parsedRarStyleOutput = parseArchiveListOutput([
      "Path = 示例.rar",
      "Type = Rar5",
      "",
      "Path = 文件夹/预览.txt",
      "Size = 12",
      "Packed Size = 8",
      "Attributes = A"
    ].join("\n"));
    assert.deepEqual(parsedRarStyleOutput.entries, [{
      path: "文件夹/预览.txt",
      size: 12,
      compressedSize: 8,
      directory: false
    }]);
    assert.equal(parseArchiveListOutput([
      "Path = first.txt\nSize = 1\nPacked Size = 1",
      "Path = second.txt\nSize = 2\nPacked Size = 2"
    ].join("\n\n"), true).truncated, true);

    console.log(JSON.stringify({
      zipAndSevenZipListed: true,
      unicodePathsPreserved: true,
      sourceArchiveUnchanged: true,
      encryptedArchiveRejected: true,
      damagedArchiveRejected: true,
      unsupportedArchiveRejected: true,
      rarStyleListingParsed: true,
      truncationReported: true
    }));
  } finally {
    closeArchivePreviewSession();
    await fs.rm(testRoot, { recursive: true, force: true });
  }
};

void run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
