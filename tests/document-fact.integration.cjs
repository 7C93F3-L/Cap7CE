const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { app } = require("electron");
const { strToU8, zipSync } = require("fflate");

const createPdf = (pageCount) => {
  const objects = [];
  const pages = Array.from({ length: pageCount }, (_, index) => 3 + index * 2);
  const font = 3 + pageCount * 2;
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = `<< /Type /Pages /Kids [${pages.map((number) => `${number} 0 R`).join(" ")}] /Count ${pageCount} >>`;
  pages.forEach((page, index) => {
    const content = `BT /F1 24 Tf 72 720 Td (Page ${index + 1}) Tj ET`;
    objects[page] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${page + 1} 0 R >>`;
    objects[page + 1] = `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`;
  });
  objects[font] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
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
    await fs.mkdir(directoryPath, { recursive: true });
    const files = {
      pdf: path.join(directoryPath, "three-pages.pdf"),
      docx: path.join(directoryPath, "seven-pages.docx"),
      pptx: path.join(directoryPath, "twelve-slides.pptx"),
      xlsx: path.join(directoryPath, "three-sheets.xlsx")
    };
    await fs.writeFile(files.pdf, createPdf(3));
    await fs.writeFile(files.docx, zipSync({ "docProps/app.xml": strToU8("<Properties><Pages>7</Pages></Properties>") }));
    await fs.writeFile(files.pptx, zipSync({ "ppt/presentation.xml": strToU8(`<p:presentation xmlns:p="p"><p:sldIdLst>${Array.from({ length: 12 }, (_, index) => `<p:sldId id="${index + 1}"/>`).join("")}</p:sldIdLst></p:presentation>`) }));
    await fs.writeFile(files.xlsx, zipSync({ "xl/workbook.xml": strToU8("<workbook><sheets><sheet name=\"A\"/><sheet name=\"B\"/><sheet name=\"C\"/></sheets></workbook>") }));
    await Promise.all(Object.values(files).map((filePath) => fs.utimes(filePath, new Date(timestamp), new Date(timestamp))));

    const { readDocumentContentCount } = require("../dist-electron/documentFactExtractor.js");
    const { inspectDocumentFactBatch } = require("../dist-electron/documentFactInspector.js");
    assert.deepEqual(await readDocumentContentCount(files.pdf), { contentCount: 3, countKind: "pages" });
    assert.deepEqual(await readDocumentContentCount(files.docx), { contentCount: 7, countKind: "pages" });
    assert.deepEqual(await readDocumentContentCount(files.pptx), { contentCount: 12, countKind: "slides" });
    assert.deepEqual(await readDocumentContentCount(files.xlsx), { contentCount: 3, countKind: "sheets" });

    const directory = { id: "document-directory", name: "documents", path: directoryPath, indexedCount: 0, createdAt: timestamp, updatedAt: timestamp };
    const { scanImageDirectories } = require("../dist-electron/imageScanner.js");
    const { ensureImageDatabase, listPendingDocumentFactCandidates, writeDocumentFactBatch, writeScannedImagesToIndex } = require("../dist-electron/sqliteImageIndex.js");
    const { searchImagesWithAddedDirectories } = require("../dist-electron/imageSearchService.js");
    const { searchScanSnapshotService } = require("../dist-electron/searchScanSnapshotService.js");
    await ensureImageDatabase();
    const scan = await scanImageDirectories([directory]);
    await writeScannedImagesToIndex([directory.id], scan.images, scan.scannedAt, scan.files);
    const candidates = await listPendingDocumentFactCandidates([directory.id]);
    assert.equal(candidates.length, 4);
    const inspected = await inspectDocumentFactBatch(candidates);
    const records = candidates.map((candidate, index) => ({ filePath: candidate.filePath, result: inspected[index] }));
    assert.ok(inspected.every((result) => result.status === "indexed"));
    assert.equal(await writeDocumentFactBatch(records), 4);
    assert.deepEqual(await listPendingDocumentFactCandidates([directory.id]), []);

    searchScanSnapshotService.setActive(false);
    const search = async (facets) => (await searchImagesWithAddedDirectories({
      query: "", directoryId: "all", fileFormat: "all", sortField: "file_name", sortDirection: "asc",
      selectedExtensions: [".pdf", ".docx", ".pptx", ".xlsx"], ...facets
    }, [directory])).images.map((item) => item.fileName);
    assert.deepEqual(await search({ documentContentCountPreset: "2-10" }), ["seven-pages.docx", "three-pages.pdf", "three-sheets.xlsx"]);
    assert.deepEqual(await search({ documentContentCountPreset: "11-50" }), ["twelve-slides.pptx"]);
    assert.deepEqual(await search({ documentContentCountRange: { minCount: 3, maxCount: 3 } }), ["three-pages.pdf", "three-sheets.xlsx"]);

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
