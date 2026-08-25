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

const makeMobi = ({ encryption = 0, version = 6, textLengthOverride, invalidSecondOffset = false } = {}) => {
  const title = Buffer.from("测试 MOBI", "utf8");
  const text = Buffer.from("<html><head></head><body><h1>第一章</h1><p>安全正文内容</p></body></html>", "utf8");
  const record0 = Buffer.alloc(260 + title.length);
  record0.writeUInt16BE(1, 0);
  record0.writeUInt32BE(textLengthOverride ?? text.length, 4);
  record0.writeUInt16BE(1, 8);
  record0.writeUInt16BE(4096, 10);
  record0.writeUInt16BE(encryption, 12);
  record0.write("MOBI", 16, "ascii");
  record0.writeUInt32BE(232, 20);
  record0.writeUInt32BE(2, 24);
  record0.writeUInt32BE(65001, 28);
  record0.writeUInt32BE(123456, 32);
  record0.writeUInt32BE(version, 36);
  record0.writeUInt32BE(260, 84);
  record0.writeUInt32BE(title.length, 88);
  record0.writeUInt32BE(2, 108);
  record0.writeUInt32BE(0, 112);
  record0.writeUInt32BE(0, 116);
  record0.writeUInt32BE(64, 128);
  record0.writeUInt32BE(0, 240);
  record0.writeUInt32BE(0xffffffff, 244);
  record0.write("EXTH", 248, "ascii");
  record0.writeUInt32BE(12, 252);
  record0.writeUInt32BE(0, 256);
  title.copy(record0, 260);

  const header = Buffer.alloc(94);
  header.write("Test_Mobi", 0, "ascii");
  header.write("BOOK", 60, "ascii");
  header.write("MOBI", 64, "ascii");
  header.writeUInt16BE(2, 76);
  header.writeUInt32BE(94, 78);
  header.writeUInt32BE(invalidSecondOffset ? 0xffffffff : 94 + record0.length, 86);
  return Buffer.concat([header, record0, text]);
};

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
