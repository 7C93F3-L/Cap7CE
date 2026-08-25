const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const zlib = require("node:zlib");
const initSqlJs = require("sql.js");

const {
  extractEmbeddedMetadata
} = require("../dist-electron/embeddedMetadataExtractor.js");
const {
  selectHighValueEmbeddedMetadata
} = require("../dist-electron/embeddedMetadataPolicy.js");
const {
  ensureEmbeddedMetadataSchema,
  readEmbeddedMetadataState,
  readEmbeddedSearchEvidence,
  replaceEmbeddedMetadata
} = require("../dist-electron/embeddedMetadataStore.js");

const pngChunk = (type, data) => {
  const typeBuffer = Buffer.from(type, "ascii");
  const output = Buffer.alloc(12 + data.length);
  output.writeUInt32BE(data.length, 0);
  typeBuffer.copy(output, 4);
  data.copy(output, 8);
  return output;
};

const pngTextChunk = (key, value) => pngChunk("tEXt", Buffer.from(`${key}\0${value}`, "utf8"));
const pngCompressedTextChunk = (key, value) => pngChunk("zTXt", Buffer.concat([
  Buffer.from(`${key}\0\0`, "latin1"),
  zlib.deflateSync(Buffer.from(value, "utf8"))
]));

const run = async () => {
  const testRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cap7ce-embedded-metadata-"));
  const pngPath = path.join(testRoot, "comfy-sample.png");
  const pdfPath = path.join(testRoot, "poster.pdf");
  try {
    const prompt = JSON.stringify({
      "1": { class_type: "CLIPTextEncode", inputs: { text: "米黄色 上衣 长发 女性 哥特式 建筑 台阶" } },
      "2": { class_type: "CLIPTextEncode", inputs: { text: "模糊 低质量" } },
      "3": {
        class_type: "KSampler",
        inputs: { positive: ["1", 0], negative: ["2", 0], sampler_name: "euler", ckpt_name: "z-image-turbo.safetensors" }
      }
    });
    const pngBytes = Buffer.concat([
      Buffer.from("89504e470d0a1a0a", "hex"),
      pngCompressedTextChunk("prompt", prompt),
      pngTextChunk("workflow", JSON.stringify({ nodes: [{ type: "KSampler", seed: 123456 }] })),
      pngChunk("IEND", Buffer.alloc(0))
    ]);
    await fs.writeFile(pngPath, pngBytes);
    const pngBefore = await fs.readFile(pngPath);
    const png = await extractEmbeddedMetadata(pngPath);
    assert.equal(png.status, "indexed");
    assert.equal(png.extractorVersion, 1);
    const visualContent = png.evidence.find((item) => item.kind === "visual_content")?.searchText ?? "";
    assert.match(visualContent, /米黄色/u);
    assert.match(visualContent, /哥特式/u);
    assert.doesNotMatch(visualContent, /模糊|euler|z-image|123456/iu);
    assert.deepEqual(await fs.readFile(pngPath), pngBefore);

    const xmp = `<?xpacket begin="﻿"?><x:xmpmeta xmlns:x="adobe:ns:meta/">
      <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
        xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:xmp="http://ns.adobe.com/xap/1.0/">
        <rdf:Description xmp:CreatorTool="Adobe Photoshop 27.0 (Windows)">
          <dc:title><rdf:Alt><rdf:li xml:lang="x-default">红色手机海报</rdf:li></rdf:Alt></dc:title>
          <dc:subject><rdf:Bag><rdf:li>产品宣传</rdf:li></rdf:Bag></dc:subject>
        </rdf:Description>
      </rdf:RDF></x:xmpmeta><?xpacket end="w"?>`;
    await fs.writeFile(pdfPath, `%PDF-1.7\n${xmp}\n%%EOF`, "utf8");
    const pdf = await extractEmbeddedMetadata(pdfPath);
    assert.equal(pdf.status, "indexed");
    assert.equal(pdf.evidence.find((item) => item.kind === "embedded_title")?.searchText.includes("红色手机海报"), true);
    assert.equal(pdf.evidence.find((item) => item.kind === "software_family")?.searchText, "photoshop");
    assert.equal(pdf.evidence.some((item) => item.searchText.includes("27.0") || item.searchText.includes("windows")), false);

    const document = selectHighValueEmbeddedMetadata("report.docx", {
      titles: ["2025 年终总结"],
      software: ["Microsoft Word 2025"],
      cameraMake: "Example Camera"
    });
    assert.deepEqual(document.evidence, [{ kind: "embedded_title", searchText: "2025 年终总结" }]);

    const audio = selectHighValueEmbeddedMetadata("concert.flac", {
      mediaTitle: "Live Session",
      mediaArtist: "Example Artist",
      mediaAlbum: "Archive",
      software: ["Encoder 1.0"]
    });
    assert.deepEqual(audio.evidence.map((item) => item.kind), ["media_title", "media_artist", "media_album"]);

    const font = selectHighValueEmbeddedMetadata("font.ttf", {
      fontFamily: "Source Han Sans",
      fontStyle: "Bold",
      titles: ["ignored title"]
    });
    assert.deepEqual(font.evidence.map((item) => item.kind), ["font_family", "font_style"]);

    const photo = selectHighValueEmbeddedMetadata("photo.jpg", {
      visualDescriptions: ["海边 夜景"],
      software: ["Adobe Photoshop 26.2", "Generic Encoder"],
      cameraMake: "Sony",
      cameraModel: "ILCE-7M4",
      capturedAt: new Date("2025-03-01T12:00:00.000Z")
    });
    assert.equal(photo.evidence.find((item) => item.kind === "software_family")?.searchText, "photoshop");
    assert.equal(photo.evidence.find((item) => item.kind === "capture_device")?.searchText, "sony ilce-7m4");
    assert.equal(photo.capturedAt, "2025-03-01T12:00:00.000Z");

    const SQL = await initSqlJs({ locateFile: (fileName) => require.resolve(`sql.js/dist/${fileName}`) });
    const database = new SQL.Database();
    database.exec(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE files (
        id INTEGER PRIMARY KEY,
        file_path TEXT NOT NULL UNIQUE,
        indexed_at TEXT NOT NULL
      );
      INSERT INTO files VALUES (1, 'sample.png', '2026-08-22T11:59:00.000Z');
    `);
    ensureEmbeddedMetadataSchema(database);
    replaceEmbeddedMetadata(database, "sample.png", png, "2026-08-22T12:00:00.000Z");
    assert.equal(readEmbeddedMetadataState(database, "sample.png").status, "indexed");
    assert.deepEqual(readEmbeddedSearchEvidence(database, "sample.png").map((item) => item.kind), ["visual_content"]);

    replaceEmbeddedMetadata(database, "sample.png", {
      ...png,
      status: "failed",
      evidence: [],
      capturedAt: null,
      errorCode: "Parser timed out!"
    }, "2026-08-22T12:01:00.000Z");
    assert.equal(readEmbeddedMetadataState(database, "sample.png").errorCode, "parser-timed-out");
    assert.deepEqual(readEmbeddedSearchEvidence(database, "sample.png"), []);

    database.run("DELETE FROM files WHERE file_path = 'sample.png'");
    assert.equal(readEmbeddedMetadataState(database, "sample.png"), null);
    database.close();

    console.log(JSON.stringify({
      positivePromptOnly: true,
      rawWorkflowAndGenerationSettingsExcluded: true,
      softwareFamilyNormalized: true,
      fileTypeSpecificPolicyVerified: true,
      sparseStoreReplacementAndCascadeVerified: true,
      sourceFilesUnchanged: true
    }));
  } finally {
    await fs.rm(testRoot, { recursive: true, force: true });
  }
};

void run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
