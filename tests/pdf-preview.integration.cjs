const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { app } = require("electron");

const {
  closePdfPreviewSession,
  openPdfPreviewSession,
  renderPdfPreviewPage
} = require("../dist-electron/pdfPreviewService.js");

const createPdf = (pageCount) => {
  const objects = [];
  const pageObjectNumbers = [];
  const fontObjectNumber = 3 + pageCount * 2;
  for (let index = 0; index < pageCount; index += 1) {
    pageObjectNumbers.push(3 + index * 2);
  }
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = `<< /Type /Pages /Kids [${pageObjectNumbers.map((number) => `${number} 0 R`).join(" ")}] /Count ${pageCount} >>`;
  for (let index = 0; index < pageCount; index += 1) {
    const pageObjectNumber = pageObjectNumbers[index];
    const contentObjectNumber = pageObjectNumber + 1;
    const content = `BT /F1 24 Tf 72 720 Td (Page ${index + 1}) Tj ET`;
    objects[pageObjectNumber] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontObjectNumber} 0 R >> >> /Contents ${contentObjectNumber} 0 R >>`;
    objects[contentObjectNumber] = `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`;
  }
  objects[fontObjectNumber] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";

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

const run = async () => {
  await app.whenReady();
  const tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "cap7ce-pdf-preview-"));
  const multiPagePath = path.join(tempDirectory, "three-pages.pdf");
  const replacementPath = path.join(tempDirectory, "replacement.pdf");
  const corruptPath = path.join(tempDirectory, "corrupt.pdf");
  try {
    await fs.writeFile(multiPagePath, createPdf(3));
    await fs.writeFile(replacementPath, createPdf(1));
    await fs.writeFile(corruptPath, "not a valid PDF");

    const supersededOpen = openPdfPreviewSession("session-race-a", multiPagePath);
    const winningOpen = openPdfPreviewSession("session-race-b", replacementPath);
    await assert.rejects(supersededOpen, (error) => error?.code === "ECANCELED");
    assert.equal((await winningOpen).pageCount, 1);

    const metadata = await openPdfPreviewSession("session-1", multiPagePath);
    assert.equal(metadata.pageCount, 3);
    assert.ok(metadata.defaultPageWidth > 0);
    assert.ok(metadata.defaultPageHeight > metadata.defaultPageWidth);

    const [firstPage, secondPage] = await Promise.all([
      renderPdfPreviewPage("session-1", multiPagePath, 1),
      renderPdfPreviewPage("session-1", multiPagePath, 2)
    ]);
    assert.equal(isPng(firstPage), true);
    assert.equal(isPng(secondPage), true);
    assert.deepEqual(await renderPdfPreviewPage("session-1", multiPagePath, 1), firstPage);
    await assert.rejects(() => renderPdfPreviewPage("session-1", multiPagePath, 4));
    await assert.rejects(() => renderPdfPreviewPage("wrong-session", multiPagePath, 1));

    const replacementMetadata = await openPdfPreviewSession("session-2", replacementPath);
    assert.equal(replacementMetadata.pageCount, 1);
    await assert.rejects(() => renderPdfPreviewPage("session-1", multiPagePath, 1));
    assert.equal(closePdfPreviewSession("session-2"), true);
    await assert.rejects(() => renderPdfPreviewPage("session-2", replacementPath, 1));
    await assert.rejects(() => openPdfPreviewSession("corrupt", corruptPath));
    assert.equal(closePdfPreviewSession(), false);

    console.log(JSON.stringify({
      concurrentOpenSuperseded: true,
      multiPageMetadataRead: true,
      pagesRenderedSerially: 2,
      cachedPageReused: true,
      invalidPageRejected: true,
      replacedSessionRejected: true,
      closedSessionRejected: true,
      corruptPdfRejected: true
    }));
  } finally {
    closePdfPreviewSession();
    await fs.rm(tempDirectory, { recursive: true, force: true });
  }
  app.quit();
};

void run().catch((error) => {
  console.error(error);
  app.exit(1);
});
