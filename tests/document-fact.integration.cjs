const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { app } = require("electron");
const { strToU8, zipSync } = require("fflate");
const { writePsd } = require("ag-psd");

const createPdf = (pageCount, withImage = false) => {
  const objects = [];
  const pages = Array.from({ length: pageCount }, (_, index) => 3 + index * 2);
  const font = 3 + pageCount * 2;
  const image = font + 1;
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = `<< /Type /Pages /Kids [${pages.map((number) => `${number} 0 R`).join(" ")}] /Count ${pageCount} >>`;
  pages.forEach((page, index) => {
    const content = `${withImage && index === 0 ? "q 20 0 0 20 72 680 cm /Im0 Do Q " : ""}BT /F1 24 Tf 72 720 Td (Page ${index + 1}) Tj ET`;
    const imageResource = withImage && index === 0 ? ` /XObject << /Im0 ${image} 0 R >>` : "";
    objects[page] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${font} 0 R >>${imageResource} >> /Contents ${page + 1} 0 R >>`;
    objects[page + 1] = `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`;
  });
  objects[font] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  if (withImage) objects[image] = "<< /Type /XObject /Subtype /Image /Width 1 /Height 1 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /ASCIIHexDecode /Length 7 >>\nstream\nFF0000>\nendstream";
  let source = "%PDF-1.4\n";
  const offsets = [0];
  for (let index = 1; index < objects.length; index += 1) {
    offsets[index] = Buffer.byteLength(source);
    source += `${index} 0 obj\n${objects[index]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(source);
  source += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let index = 1; index < objects.length; index += 1) source += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  source += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(source);
};

const testRoot = path.join(os.tmpdir(), `cap7ce-document-fact-${process.pid}-${Date.now()}`);
const userDataPath = path.join(testRoot, "user-data");
const directoryPath = path.join(testRoot, "documents");
const timestamp = new Date("2026-10-04T00:00:00.000Z").toISOString();
app.setPath("userData", userDataPath);

app.whenReady().then(async () => {
  try {
    const initSqlJs = require("sql.js");
    const SQL = await initSqlJs({ locateFile: (file) => require.resolve(`sql.js/dist/${file}`) });
    const migrationDatabase = new SQL.Database();
    migrationDatabase.exec("CREATE TABLE files (id INTEGER PRIMARY KEY, file_path TEXT); CREATE TABLE file_document_facts (file_id INTEGER PRIMARY KEY, source_revision TEXT NOT NULL, extractor_version INTEGER NOT NULL, status TEXT NOT NULL, content_count INTEGER NOT NULL DEFAULT 0, count_kind TEXT NOT NULL DEFAULT 'pages', error_code TEXT NOT NULL DEFAULT '', indexed_at TEXT NOT NULL)");
    require("../dist-electron/documentFactStore.js").ensureDocumentFactSchema(migrationDatabase);
    const migratedColumns = migrationDatabase.exec("PRAGMA table_info(file_document_facts)")[0]?.values ?? [];
    assert.ok(migratedColumns.some((row) => row[1] === "has_embedded_images"));
    assert.ok(migratedColumns.some((row) => row[1] === "image_composition_known"));
    assert.ok(migratedColumns.some((row) => row[1] === "artboard_count_known"));
    assert.ok(migratedColumns.some((row) => row[1] === "artboard_count"));
    migrationDatabase.close();

    await fs.mkdir(directoryPath, { recursive: true });
    const files = {
      pdf: path.join(directoryPath, "three-pages.pdf"),
      imagePdf: path.join(directoryPath, "image-page.pdf"),
      longPdf: path.join(directoryPath, "long-document.pdf"),
      docx: path.join(directoryPath, "seven-pages.docx"),
      pptx: path.join(directoryPath, "twelve-slides.pptx"),
      xlsx: path.join(directoryPath, "three-sheets.xlsx"),
      ai: path.join(directoryPath, "four-artboards.ai"),
      cdr: path.join(directoryPath, "three-pages.cdr"),
      psd: path.join(directoryPath, "two-artboards.psd")
    };
    await fs.writeFile(files.pdf, createPdf(3));
    await fs.writeFile(files.imagePdf, createPdf(1, true));
    await fs.writeFile(files.longPdf, createPdf(65));
    await fs.writeFile(files.docx, zipSync({ "docProps/app.xml": strToU8("<Properties><Pages>7</Pages></Properties>"), "word/media/image1.png": strToU8("image") }));
    await fs.writeFile(files.pptx, zipSync({ "ppt/presentation.xml": strToU8(`<p:presentation xmlns:p="p"><p:sldIdLst>${Array.from({ length: 12 }, (_, index) => `<p:sldId id="${index + 1}"/>`).join("")}</p:sldIdLst></p:presentation>`) }));
    await fs.writeFile(files.xlsx, zipSync({ "xl/workbook.xml": strToU8("<workbook><sheets><sheet name=\"A\"/><sheet name=\"B\"/><sheet name=\"C\"/></sheets></workbook>"), "xl/media/image1.jpeg": strToU8("image") }));
    await fs.writeFile(files.ai, createPdf(4));
    await fs.writeFile(files.cdr, zipSync({ "previews/thumbnail.png": strToU8("thumbnail"), "previews/page1.png": strToU8("one"), "previews/page2.png": strToU8("two"), "previews/page3.png": strToU8("three") }));
    await fs.writeFile(files.psd, Buffer.from(writePsd({
      width: 200, height: 100, artboards: { count: 2 },
      children: [
        { name: "A", artboard: { rect: { top: 0, left: 0, bottom: 100, right: 100 } }, children: [] },
        { name: "B", artboard: { rect: { top: 0, left: 100, bottom: 100, right: 200 } }, children: [] }
      ]
    })));
    await Promise.all(Object.values(files).map((filePath) => fs.utimes(filePath, new Date(timestamp), new Date(timestamp))));

    const { readArtboardFact, readDocumentFact } = require("../dist-electron/documentFactExtractor.js");
    const { inspectDocumentFactBatch } = require("../dist-electron/documentFactInspector.js");
    assert.deepEqual(await readDocumentFact(files.pdf), { contentCount: 3, countKind: "pages", imageCompositionKnown: true, hasEmbeddedImages: false });
    assert.deepEqual(await readDocumentFact(files.imagePdf), { contentCount: 1, countKind: "pages", imageCompositionKnown: true, hasEmbeddedImages: true });
    assert.deepEqual(await readDocumentFact(files.longPdf), { contentCount: 65, countKind: "pages", imageCompositionKnown: false, hasEmbeddedImages: false });
    assert.deepEqual(await readDocumentFact(files.docx), { contentCount: 7, countKind: "pages", imageCompositionKnown: true, hasEmbeddedImages: true });
    assert.deepEqual(await readDocumentFact(files.pptx), { contentCount: 12, countKind: "slides", imageCompositionKnown: true, hasEmbeddedImages: false });
    assert.deepEqual(await readDocumentFact(files.xlsx), { contentCount: 3, countKind: "sheets", imageCompositionKnown: true, hasEmbeddedImages: true });
    assert.equal(await readArtboardFact(files.ai), 4);
    assert.equal(await readArtboardFact(files.cdr), 3);
    assert.equal(await readArtboardFact(files.psd), 2);

    const directory = { id: "document-directory", name: "documents", path: directoryPath, indexedCount: 0, createdAt: timestamp, updatedAt: timestamp };
    const { scanImageDirectories } = require("../dist-electron/imageScanner.js");
    const { ensureImageDatabase, listPendingDocumentFactCandidates, writeDocumentFactBatch, writeScannedImagesToIndex } = require("../dist-electron/sqliteImageIndex.js");
    const { searchImagesWithAddedDirectories } = require("../dist-electron/imageSearchService.js");
    const { searchScanSnapshotService } = require("../dist-electron/searchScanSnapshotService.js");
    await ensureImageDatabase();
    const scan = await scanImageDirectories([directory]);
    await writeScannedImagesToIndex([directory.id], scan.images, scan.scannedAt, scan.files);
    const candidates = await listPendingDocumentFactCandidates([directory.id]);
    assert.equal(candidates.length, 9);
    const inspected = await inspectDocumentFactBatch(candidates);
    const records = candidates.map((candidate, index) => ({ filePath: candidate.filePath, result: inspected[index] }));
    assert.ok(inspected.every((result) => result.status === "indexed"));
    assert.equal(await writeDocumentFactBatch(records), 9);
    assert.deepEqual(await listPendingDocumentFactCandidates([directory.id]), []);

    searchScanSnapshotService.setActive(false);
    const search = async (facets) => (await searchImagesWithAddedDirectories({
      query: "", directoryId: "all", fileFormat: "all", sortField: "file_name", sortDirection: "asc",
      selectedExtensions: [".pdf", ".docx", ".pptx", ".xlsx"], ...facets
    }, [directory])).images.map((item) => item.fileName);
    assert.deepEqual(await search({ documentContentCountPreset: "2-10" }), ["seven-pages.docx", "three-pages.pdf", "three-sheets.xlsx"]);
    assert.deepEqual(await search({ documentContentCountPreset: "11-50" }), ["twelve-slides.pptx"]);
    assert.deepEqual(await search({ documentContentCountRange: { minCount: 3, maxCount: 3 } }), ["three-pages.pdf", "three-sheets.xlsx"]);
    assert.deepEqual(await search({ documentImageComposition: "with-images" }), ["image-page.pdf", "seven-pages.docx", "three-sheets.xlsx"]);
    assert.deepEqual(await search({ documentImageComposition: "without-images" }), ["three-pages.pdf", "twelve-slides.pptx"]);
    const searchArtboards = async (facets) => (await searchImagesWithAddedDirectories({
      query: "", directoryId: "all", fileFormat: "all", sortField: "file_name", sortDirection: "asc",
      selectedExtensions: [".ai", ".cdr", ".psd"], ...facets
    }, [directory])).images.map((item) => item.fileName);
    assert.deepEqual(await searchArtboards({ artboardCountPreset: "one" }), []);
    assert.deepEqual(await searchArtboards({ artboardCountPreset: "2-5" }), ["four-artboards.ai", "three-pages.cdr", "two-artboards.psd"]);
    assert.deepEqual(await searchArtboards({ artboardCountRange: { minCount: 3, maxCount: 3 } }), ["three-pages.cdr"]);

    await fs.appendFile(files.docx, "changed");
    const changedScan = await scanImageDirectories([directory]);
    await writeScannedImagesToIndex([directory.id], changedScan.images, changedScan.scannedAt, changedScan.files);
    assert.deepEqual(await search({ documentContentCountRange: { minCount: 7, maxCount: 7 } }), [], "stale facts must not satisfy document filters");
    assert.equal((await listPendingDocumentFactCandidates([directory.id])).length, 1);
    console.log("Document fact extraction and filter integration tests passed.");
  } finally {
    await fs.rm(testRoot, { recursive: true, force: true });
  }
}).then(() => app.exit(0)).catch((error) => { console.error(error); app.exit(1); });
