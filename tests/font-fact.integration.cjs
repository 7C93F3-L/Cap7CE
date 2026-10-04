const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const opentype = require("opentype.js");
const { app } = require("electron");

const testRoot = path.join(os.tmpdir(), `cap7ce-font-fact-${process.pid}-${Date.now()}`);
const userDataPath = path.join(testRoot, "user-data");
const directoryPath = path.join(testRoot, "fonts");
const timestamp = new Date("2026-10-04T00:00:00.000Z").toISOString();
app.setPath("userData", userDataPath);

const createFont = (familyName, styleName) => {
  const notdef = new opentype.Glyph({ name: ".notdef", advanceWidth: 500, path: new opentype.Path() });
  const glyphPath = new opentype.Path();
  glyphPath.moveTo(40, 0); glyphPath.lineTo(300, 700); glyphPath.lineTo(560, 0); glyphPath.close();
  const glyph = new opentype.Glyph({ name: "A", unicode: 65, advanceWidth: 600, path: glyphPath });
  return Buffer.from(new opentype.Font({ familyName, styleName, unitsPerEm: 1000, ascender: 800, descender: -200, glyphs: [notdef, glyph] }).toArrayBuffer());
};

app.whenReady().then(async () => {
  try {
    await fs.mkdir(directoryPath, { recursive: true });
    const regularPath = path.join(directoryPath, "LiberationSans-Regular.ttf");
    const italicPath = path.join(directoryPath, "Cap7CE-Italic.otf");
    const invalidPath = path.join(directoryPath, "Invalid.ttf");
    await Promise.all([
      fs.copyFile(path.join(__dirname, "..", "node_modules", "pdfjs-dist", "standard_fonts", "LiberationSans-Regular.ttf"), regularPath),
      fs.writeFile(italicPath, createFont("Cap7CE Probe", "Italic")),
      fs.writeFile(invalidPath, "invalid font")
    ]);
    await Promise.all([regularPath, italicPath, invalidPath].map((filePath) => fs.utimes(filePath, new Date(timestamp), new Date(timestamp))));
    const directory = { id: "font-directory", name: "fonts", path: directoryPath, indexedCount: 0, createdAt: timestamp, updatedAt: timestamp };
    const { scanImageDirectories } = require("../dist-electron/imageScanner.js");
    const { ensureImageDatabase, listPendingFontFactCandidates, writeFontFactBatch, writeScannedImagesToIndex } = require("../dist-electron/sqliteImageIndex.js");
    const { inspectFontFactBatch } = require("../dist-electron/fontFactInspector.js");
    const { searchImagesWithAddedDirectories } = require("../dist-electron/imageSearchService.js");
    const { searchScanSnapshotService } = require("../dist-electron/searchScanSnapshotService.js");
    await ensureImageDatabase();
    const scan = await scanImageDirectories([directory]);
    await writeScannedImagesToIndex([directory.id], scan.images, scan.scannedAt, scan.files);
    const candidates = await listPendingFontFactCandidates([directory.id]);
    assert.equal(candidates.length, 3);
    const inspected = await inspectFontFactBatch(candidates);
    const regular = inspected[candidates.findIndex((candidate) => candidate.filePath === regularPath)];
    const italic = inspected[candidates.findIndex((candidate) => candidate.filePath === italicPath)];
    const invalid = inspected[candidates.findIndex((candidate) => candidate.filePath === invalidPath)];
    assert.equal(regular.status, "indexed");
    assert.equal(regular.weight, 400);
    assert.equal(regular.italic, false);
    assert.equal(regular.supportsLatin, true);
    assert.equal(regular.variable, false);
    assert.equal(italic.status, "indexed");
    assert.equal(italic.italic, true);
    assert.equal(invalid.status, "failed");
    assert.equal(await writeFontFactBatch(candidates.map((candidate, index) => ({ filePath: candidate.filePath, result: inspected[index] }))), 3);
    assert.deepEqual(await listPendingFontFactCandidates([directory.id]), []);

    searchScanSnapshotService.setActive(false);
    const search = async (facets) => (await searchImagesWithAddedDirectories({
      query: "", directoryId: "all", fileFormat: "all", sortField: "file_name", sortDirection: "asc",
      selectedExtensions: [".otf", ".ttf"], ...facets
    }, [directory])).images.map((item) => item.fileName);
    assert.deepEqual(await search({ fontWeights: ["regular"] }), ["LiberationSans-Regular.ttf"]);
    assert.deepEqual(await search({ fontStyles: ["italic"] }), ["Cap7CE-Italic.otf"]);
    assert.deepEqual(await search({ fontCharacterSets: ["latin"] }), ["LiberationSans-Regular.ttf"]);
    assert.deepEqual(await search({ fontCharacterSets: ["chinese"] }), []);
    assert.deepEqual(await search({ fontKinds: ["static"] }), ["Cap7CE-Italic.otf", "LiberationSans-Regular.ttf"]);

    await fs.appendFile(regularPath, Buffer.from([0]));
    const changedScan = await scanImageDirectories([directory]);
    await writeScannedImagesToIndex([directory.id], changedScan.images, changedScan.scannedAt, changedScan.files);
    assert.deepEqual(await search({ fontCharacterSets: ["latin"] }), [], "stale font facts must not satisfy filters");
    assert.equal((await listPendingFontFactCandidates([directory.id])).length, 1);
    console.log("Font fact extraction and filter integration tests passed.");
  } finally { await fs.rm(testRoot, { recursive: true, force: true }); }
}).then(() => app.exit(0)).catch((error) => { console.error(error); app.exit(1); });
