const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { app } = require("electron");

const testRoot = path.join(os.tmpdir(), `cap7ce-skim-content-${process.pid}-${Date.now()}`);

const crcTable = Array.from({ length: 256 }, (_, value) => {
  let current = value;
  for (let bit = 0; bit < 8; bit += 1) {
    current = (current & 1) ? (0xedb88320 ^ (current >>> 1)) : (current >>> 1);
  }
  return current >>> 0;
});

const crc32 = (buffer) => {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
};

const createStoredZip = (entries) => {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const [name, content] of entries) {
    const nameBuffer = Buffer.from(name);
    const contentBuffer = Buffer.from(content);
    const checksum = crc32(contentBuffer);
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(contentBuffer.length, 18);
    localHeader.writeUInt32LE(contentBuffer.length, 22);
    localHeader.writeUInt16LE(nameBuffer.length, 26);
    localParts.push(localHeader, nameBuffer, contentBuffer);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(contentBuffer.length, 20);
    centralHeader.writeUInt32LE(contentBuffer.length, 24);
    centralHeader.writeUInt16LE(nameBuffer.length, 28);
    centralHeader.writeUInt32LE(offset, 42);
    centralParts.push(centralHeader, nameBuffer);
    offset += localHeader.length + nameBuffer.length + contentBuffer.length;
  }
  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...localParts, centralDirectory, end]);
};

const createDocx = (bodyText) => createStoredZip([
  ["[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8"?>
    <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
      <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
    </Types>`],
  ["word/document.xml", `<?xml version="1.0" encoding="UTF-8"?>
    <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:body><w:p><w:r><w:t>${bodyText}</w:t></w:r></w:p></w:body>
    </w:document>`]
]);

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
    const docxPath = path.join(testRoot, "document.docx");
    const corruptDocPath = path.join(testRoot, "corrupt.doc");
    const safeSourcePreviews = new Map([
      ["settings.ini", "[app]\nname=Cap7CE"],
      ["page.html", "<script>not executed</script>"],
      ["table.csv", "name,value\nCap7CE,1"],
      ["data.json", '{"name":"Cap7CE"}'],
      ["data.xml", "<app>Cap7CE</app>"],
      ["data.yaml", "name: Cap7CE"],
      ["data.yml", "name: Cap7CE"]
    ]);
    await fs.writeFile(utf8Path, "Hello 世界\nplain text");
    await fs.writeFile(utf16Path, Buffer.concat([
      Buffer.from([0xff, 0xfe]),
      Buffer.from("UTF-16 内容", "utf16le")
    ]));
    await fs.writeFile(binaryPath, Buffer.from([0x41, 0x00, 0x42, 0xff]));
    await fs.writeFile(largePath, "x".repeat(maximumSkimTextPreviewBytes + 128));
    await fs.writeFile(docxPath, createDocx("Office 文档正文预览"));
    await fs.writeFile(corruptDocPath, "not a Word document");
    for (const [fileName, content] of safeSourcePreviews) {
      await fs.writeFile(path.join(testRoot, fileName), content);
    }

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
    for (const [fileName, content] of safeSourcePreviews) {
      const preview = await readSkimTextPreview(path.join(testRoot, fileName));
      assert.equal(preview.content, content);
      assert.equal(preview.encoding, "utf-8");
      assert.equal(preview.truncated, false);
    }
    await assert.rejects(
      () => readSkimTextPreview(path.join(testRoot, "document.rtf")),
      (error) => error?.code === "EUNSUPPORTED_ENCODING"
    );
    const docx = await readSkimTextPreview(docxPath);
    assert.equal(docx.content.trim(), "Office 文档正文预览");
    assert.equal(docx.encoding, "utf-8");
    assert.equal(docx.truncated, false);
    await assert.rejects(() => readSkimTextPreview(corruptDocPath));

    assert.deepEqual(parseSkimMediaByteRange(1000, null), { start: 0, end: 999, status: 200 });
    assert.deepEqual(parseSkimMediaByteRange(1000, "bytes=100-199"), { start: 100, end: 199, status: 206 });
    assert.deepEqual(parseSkimMediaByteRange(1000, "bytes=-100"), { start: 900, end: 999, status: 206 });
    assert.equal(parseSkimMediaByteRange(1000, "bytes=1000-"), null);
    assert.equal(parseSkimMediaByteRange(1000, "bytes=0-1,4-5"), null);
    assert.equal(getSkimMediaMimeType(".mp3"), "audio/mpeg");
    assert.equal(getSkimMediaMimeType(".wav"), "audio/wav");
    assert.equal(getSkimMediaMimeType(".m4a"), "audio/mp4");
    assert.equal(getSkimMediaMimeType(".mp4"), "video/mp4");
    assert.equal(getSkimMediaMimeType(".mov"), "video/quicktime");
    assert.equal(getSkimMediaMimeType(".webm"), "video/webm");

    console.log(JSON.stringify({
      utf8AndUtf16TextSupported: true,
      safeTextAndStructuredFormatsSupported: true,
      htmlReturnedAsLiteralSource: true,
      rtfRemainsOutsideRawTextPreview: true,
      wordDocumentTextExtracted: true,
      corruptWordDocumentRejected: true,
      binaryEncodingRejected: true,
      textSizeBoundaryApplied: true,
      mediaRangeRequestsValidated: true,
      mediaMimeTypesMapped: true,
      probedM4aAndWebmMapped: true
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
