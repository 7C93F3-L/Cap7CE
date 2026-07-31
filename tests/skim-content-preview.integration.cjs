const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { app } = require("electron");

const testRoot = path.join(os.tmpdir(), `cap7ce-skim-content-${process.pid}-${Date.now()}`);

app.whenReady().then(async () => {
  const {
    getSkimMediaMimeType,
    maximumSkimTextPreviewBytes,
    parseSkimMediaByteRange,
    readSkimTextPreview
  } = require("../dist-electron/skimContentPreviewService.js");

  try {
    await fs.mkdir(testRoot, { recursive: true });
    const utf8Path = path.join(testRoot, "notes.txt");
    const utf16Path = path.join(testRoot, "readme.md");
    const binaryPath = path.join(testRoot, "binary.txt");
    const largePath = path.join(testRoot, "large.txt");
    await fs.writeFile(utf8Path, "Hello 世界\nplain text");
    await fs.writeFile(utf16Path, Buffer.concat([
      Buffer.from([0xff, 0xfe]),
      Buffer.from("UTF-16 内容", "utf16le")
    ]));
    await fs.writeFile(binaryPath, Buffer.from([0x41, 0x00, 0x42, 0xff]));
    await fs.writeFile(largePath, "x".repeat(maximumSkimTextPreviewBytes + 128));

    const utf8 = await readSkimTextPreview(utf8Path);
    assert.equal(utf8.encoding, "utf-8");
    assert.equal(utf8.content, "Hello 世界\nplain text");
    assert.equal(utf8.truncated, false);

    const utf16 = await readSkimTextPreview(utf16Path);
    assert.equal(utf16.encoding, "utf-16le");
    assert.equal(utf16.content, "UTF-16 内容");

    await assert.rejects(
      () => readSkimTextPreview(binaryPath),
      (error) => error?.code === "EUNSUPPORTED_ENCODING"
    );
    const large = await readSkimTextPreview(largePath);
    assert.equal(large.truncated, true);
    assert.equal(Buffer.byteLength(large.content, "utf8"), maximumSkimTextPreviewBytes);

    assert.deepEqual(parseSkimMediaByteRange(1000, null), { start: 0, end: 999, status: 200 });
    assert.deepEqual(parseSkimMediaByteRange(1000, "bytes=100-199"), { start: 100, end: 199, status: 206 });
    assert.deepEqual(parseSkimMediaByteRange(1000, "bytes=-100"), { start: 900, end: 999, status: 206 });
    assert.equal(parseSkimMediaByteRange(1000, "bytes=1000-"), null);
    assert.equal(parseSkimMediaByteRange(1000, "bytes=0-1,4-5"), null);
    assert.equal(getSkimMediaMimeType(".mp3"), "audio/mpeg");
    assert.equal(getSkimMediaMimeType(".wav"), "audio/wav");
    assert.equal(getSkimMediaMimeType(".mp4"), "video/mp4");
    assert.equal(getSkimMediaMimeType(".mov"), "video/quicktime");

    console.log(JSON.stringify({
      utf8AndUtf16TextSupported: true,
      binaryEncodingRejected: true,
      textSizeBoundaryApplied: true,
      mediaRangeRequestsValidated: true,
      mediaMimeTypesMapped: true
    }));
  } finally {
    await fs.rm(testRoot, { recursive: true, force: true });
    app.quit();
  }
}).catch(async (error) => {
  console.error(error);
  await fs.rm(testRoot, { recursive: true, force: true });
  app.exit(1);
});
