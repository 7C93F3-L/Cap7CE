const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const {
  closeMobiPreviewSession,
  MobiPreviewError,
  openMobiPreviewSession
} = require("../dist-electron/mobiPreviewService.js");

const { makeMobi } = require("./provider-preview-fixtures.cjs");

const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");
const listTemporaryRoots = async () => new Set((await fs.readdir(os.tmpdir()))
  .filter((name) => name.startsWith("cap7ce-mobi-preview-")));

(async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "cap7ce-mobi-test-"));
  const file = path.join(root, "book.mobi");
  const encrypted = path.join(root, "encrypted.mobi");
  const unsupported = path.join(root, "unsupported.mobi");
  const oversized = path.join(root, "oversized.mobi");
  const invalidOffset = path.join(root, "invalid-offset.mobi");
  const truncated = path.join(root, "truncated.mobi");
  try {
    const source = makeMobi();
    await fs.writeFile(file, source);
    await fs.writeFile(encrypted, makeMobi({ encryption: 1 }));
    await fs.writeFile(unsupported, makeMobi({ version: 8 }));
    await fs.writeFile(oversized, makeMobi({ textLengthOverride: 9 * 1024 * 1024 }));
    await fs.writeFile(invalidOffset, makeMobi({ invalidSecondOffset: true }));
    await fs.writeFile(truncated, source.subarray(0, Math.floor(source.length / 2)));

    const temporaryRootsBefore = await listTemporaryRoots();
    const first = openMobiPreviewSession("same", file);
    const latest = openMobiPreviewSession("same", file);
    await assert.rejects(first, (error) => error.code === "ECANCELED");
    const data = await latest;
    assert.equal(data.title, "测试 MOBI");
    assert.equal(data.chapters.length, 1);
    assert.match(data.chapters[0].text, /安全正文内容/);
    assert.equal(data.coverDataUrl, null);
    assert.equal(hash(await fs.readFile(file)), hash(source));

    await assert.rejects(openMobiPreviewSession("encrypted", encrypted), (error) => (
      error instanceof MobiPreviewError && error.reason === "encrypted"
    ));
    await assert.rejects(openMobiPreviewSession("unsupported", unsupported), (error) => (
      error instanceof MobiPreviewError && error.reason === "unsupportedMobi"
    ));
    await assert.rejects(openMobiPreviewSession("oversized", oversized), (error) => (
      error instanceof MobiPreviewError && error.reason === "tooLarge"
    ));
    for (const [sessionId, invalidFile] of [["offset", invalidOffset], ["truncated", truncated]]) {
      await assert.rejects(openMobiPreviewSession(sessionId, invalidFile), (error) => (
        error instanceof MobiPreviewError && error.reason === "invalidMobi"
      ));
    }

    const temporaryRootsAfter = await listTemporaryRoots();
    assert.deepEqual(temporaryRootsAfter, temporaryRootsBefore);
    console.log(JSON.stringify({
      mobi6TextRead: true,
      duplicateOpenSupersessionIsolated: true,
      encryptedRejected: true,
      unsupportedVariantRejected: true,
      truncatedAndInvalidOffsetsRejected: true,
      temporaryResourcesCleaned: true,
      sourceFileUnchanged: true
    }));
  } finally {
    closeMobiPreviewSession();
    await fs.rm(root, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
