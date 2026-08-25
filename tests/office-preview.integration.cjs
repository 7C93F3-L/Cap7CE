const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { app } = require("electron");

const {
  closeOfficePreviewSession,
  openOfficePreviewSession,
  prepareOfficePreviewTemporaryRoot,
  setOfficePreviewConversionRunnerForTests
} = require("../dist-electron/officePreviewService.js");
const {
  closePdfPreviewSession,
  openPdfPreviewSession,
  renderPdfPreviewPage
} = require("../dist-electron/pdfPreviewService.js");

const createPdf = () => {
  const content = "BT /F1 24 Tf 72 720 Td (Office Preview) Tj ET";
  const objects = [
    null,
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"
  ];
  let source = "%PDF-1.4\n";
  const offsets = [0];
  for (let index = 1; index < objects.length; index += 1) {
    offsets[index] = Buffer.byteLength(source);
    source += `${index} 0 obj\n${objects[index]}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(source);
  source += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let index = 1; index < objects.length; index += 1) {
    source += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }
  source += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(source);
};

const isPng = (buffer) => buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));

const waitForMissing = async (filePath) => {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      await fs.access(filePath);
    } catch {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return false;
};

const run = async () => {
  await app.whenReady();
  const testRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cap7ce-office-preview-test-"));
  const excelPath = path.join(testRoot, "workbook.xlsx");
  const presentationPath = path.join(testRoot, "slides.pptx");
  const unsupportedPath = path.join(testRoot, "notes.txt");
  try {
    await Promise.all([
      fs.writeFile(excelPath, "fake workbook"),
      fs.writeFile(presentationPath, "fake presentation"),
      fs.writeFile(unsupportedPath, "not Office")
    ]);
    await prepareOfficePreviewTemporaryRoot();

    const observedKinds = [];
    setOfficePreviewConversionRunnerForTests(async (_sourcePath, outputPath, kind) => {
      observedKinds.push(kind);
      await fs.writeFile(outputPath, createPdf());
    });

    const excelPreview = await openOfficePreviewSession("excel-session", excelPath);
    assert.equal(excelPreview.kind, "excel");
    assert.equal((await fs.readFile(excelPreview.pdfPath)).subarray(0, 5).toString("ascii"), "%PDF-");
    const metadata = await openPdfPreviewSession("excel-session", excelPreview.pdfPath, excelPath);
    assert.equal(metadata.pageCount, 1);
    assert.equal(isPng(await renderPdfPreviewPage("excel-session", excelPath, 1)), true);
    await assert.rejects(() => renderPdfPreviewPage("excel-session", excelPreview.pdfPath, 1));
    closePdfPreviewSession("excel-session");
    assert.equal(closeOfficePreviewSession("excel-session"), true);
    assert.equal(await waitForMissing(excelPreview.pdfPath), true);

    const cachedExcelPreview = await openOfficePreviewSession("cached-excel-session", excelPath);
    assert.equal(cachedExcelPreview.kind, "excel");
    assert.deepEqual(observedKinds, ["excel"]);
    assert.equal(closeOfficePreviewSession("cached-excel-session"), true);
    assert.equal(await waitForMissing(cachedExcelPreview.pdfPath), false);

    const presentationPreview = await openOfficePreviewSession("presentation-session", presentationPath);
    assert.equal(presentationPreview.kind, "powerpoint");
    assert.deepEqual(observedKinds, ["excel", "powerpoint"]);
    closeOfficePreviewSession("presentation-session");

    let markStarted;
    const started = new Promise((resolve) => { markStarted = resolve; });
    let conversionCall = 0;
    setOfficePreviewConversionRunnerForTests((_sourcePath, outputPath, _kind, signal) => {
      conversionCall += 1;
      if (conversionCall > 1) return fs.writeFile(outputPath, createPdf());
      markStarted();
      return new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(Object.assign(new Error("cancelled"), { code: "ECANCELED" })), { once: true });
      });
    });
    const superseded = openOfficePreviewSession("superseded", excelPath);
    await started;
    const winning = openOfficePreviewSession("winning", presentationPath);
    await assert.rejects(superseded, (error) => error?.code === "ECANCELED");
    await winning;
    closeOfficePreviewSession("winning");

    setOfficePreviewConversionRunnerForTests(async (_sourcePath, outputPath) => {
      await fs.writeFile(outputPath, "not a PDF");
    });
    await assert.rejects(() => openOfficePreviewSession("invalid-output", excelPath));
    await assert.rejects(() => openOfficePreviewSession("unsupported", unsupportedPath));

    console.log(JSON.stringify({
      excelAndPowerPointKindsMapped: true,
      convertedPdfValidated: true,
      repeatedConversionCacheReused: true,
      originalPathAuthorizationPreserved: true,
      temporaryOutputRemovedOnClose: true,
      supersededConversionCancelled: true,
      invalidOutputRejected: true,
      unsupportedFormatRejected: true
    }));
  } finally {
    closePdfPreviewSession();
    closeOfficePreviewSession();
    setOfficePreviewConversionRunnerForTests(null);
    await fs.rm(testRoot, { recursive: true, force: true });
  }
  app.quit();
};

void run().catch((error) => {
  console.error(error);
  app.exit(1);
});
