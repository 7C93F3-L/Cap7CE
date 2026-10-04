const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { app } = require("electron");

const testRoot = path.join(os.tmpdir(), `cap7ce-text-data-fact-${process.pid}-${Date.now()}`);
const userDataPath = path.join(testRoot, "user-data");
const directoryPath = path.join(testRoot, "content");
const timestamp = new Date("2026-10-04T00:00:00.000Z").toISOString();
app.setPath("userData", userDataPath);

app.whenReady().then(async () => {
  try {
    await fs.mkdir(directoryPath, { recursive: true });
    const files = {
      text: path.join(directoryPath, "three-lines.txt"),
      utf16: path.join(directoryPath, "two-lines.md"),
      csv: path.join(directoryPath, "records.csv"),
      array: path.join(directoryPath, "array.json"),
      object: path.join(directoryPath, "object.json")
    };
    await fs.writeFile(files.text, "你好🙂\r\nsecond\nthird", "utf8");
    await fs.writeFile(files.utf16, Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from("one\r\ntwo", "utf16le")]));
    await fs.writeFile(files.csv, '"name","note"\r\n"A","line 1\nline 2"\r\n"B","x",3', "utf8");
    await fs.writeFile(files.array, "[1,2,3]", "utf8");
    await fs.writeFile(files.object, '{"first":1,"second":2}', "utf8");
    await Promise.all(Object.values(files).map((filePath) => fs.utimes(filePath, new Date(timestamp), new Date(timestamp))));

    const { readTextDataFact } = require("../dist-electron/textDataFactExtractor.js");
    assert.deepEqual(await readTextDataFact(files.text), {
      factKind: "text", characterCount: 17, lineCount: 3, recordCount: 0, columnCount: 0, jsonRootKind: "none"
    });
    assert.deepEqual(await readTextDataFact(files.utf16), {
      factKind: "text", characterCount: 8, lineCount: 2, recordCount: 0, columnCount: 0, jsonRootKind: "none"
    });
    assert.deepEqual(await readTextDataFact(files.csv), {
      factKind: "csv", characterCount: 0, lineCount: 0, recordCount: 3, columnCount: 3, jsonRootKind: "none"
    });
    assert.deepEqual(await readTextDataFact(files.array), {
      factKind: "json", characterCount: 0, lineCount: 0, recordCount: 3, columnCount: 0, jsonRootKind: "array"
    });
    assert.deepEqual(await readTextDataFact(files.object), {
      factKind: "json", characterCount: 0, lineCount: 0, recordCount: 2, columnCount: 0, jsonRootKind: "object"
    });

    const directory = { id: "text-data-directory", name: "content", path: directoryPath, indexedCount: 0, createdAt: timestamp, updatedAt: timestamp };
    const { scanImageDirectories } = require("../dist-electron/imageScanner.js");
    const { inspectTextDataFactBatch } = require("../dist-electron/textDataFactInspector.js");
    const { ensureImageDatabase, listPendingTextDataFactCandidates, writeScannedImagesToIndex, writeTextDataFactBatch } = require("../dist-electron/sqliteImageIndex.js");
    const { searchImagesWithAddedDirectories } = require("../dist-electron/imageSearchService.js");
    const { searchScanSnapshotService } = require("../dist-electron/searchScanSnapshotService.js");
    await ensureImageDatabase();
    const scan = await scanImageDirectories([directory]);
    await writeScannedImagesToIndex([directory.id], scan.images, scan.scannedAt, scan.files);
    const candidates = await listPendingTextDataFactCandidates([directory.id]);
    assert.equal(candidates.length, 5);
    const inspected = await inspectTextDataFactBatch(candidates);
    assert.ok(inspected.every((result) => result.status === "indexed"));
    assert.equal(await writeTextDataFactBatch(candidates.map((candidate, index) => ({ filePath: candidate.filePath, result: inspected[index] }))), 5);
    assert.deepEqual(await listPendingTextDataFactCandidates([directory.id]), []);

    searchScanSnapshotService.setActive(false);
    const search = async (extensions, facets) => (await searchImagesWithAddedDirectories({
      query: "", directoryId: "all", fileFormat: "all", sortField: "file_name", sortDirection: "asc",
      selectedExtensions: extensions, ...facets
    }, [directory])).images.map((item) => item.fileName);
    assert.deepEqual(await search([".txt", ".md"], { textCharacterCountPreset: "up-to-100" }), ["three-lines.txt", "two-lines.md"]);
    assert.deepEqual(await search([".txt", ".md"], { textLineCountRange: { minCount: 3, maxCount: 3 } }), ["three-lines.txt"]);
    assert.deepEqual(await search([".csv"], { csvRecordCountRange: { minCount: 3, maxCount: 3 } }), ["records.csv"]);
    assert.deepEqual(await search([".csv"], { csvColumnCountPreset: "2-5" }), ["records.csv"]);
    assert.deepEqual(await search([".json"], { jsonItemCountRange: { minCount: 2, maxCount: 2 } }), ["object.json"]);
    assert.deepEqual(await search([".json"], { jsonRootKind: "array" }), ["array.json"]);

    const liveOnlyPath = path.join(directoryPath, "live-only.txt");
    await fs.writeFile(liveOnlyPath, "one\ntwo\nthree", "utf8");
    searchScanSnapshotService.setActive(true);
    assert.deepEqual(await search([".txt"], { textLineCountRange: { minCount: 3, maxCount: 3 } }), ["three-lines.txt"], "live scan files without facts must not bypass text filters");
    await fs.rm(liveOnlyPath);
    searchScanSnapshotService.invalidate();
    searchScanSnapshotService.setActive(false);

    await fs.appendFile(files.text, "changed");
    const changedScan = await scanImageDirectories([directory]);
    await writeScannedImagesToIndex([directory.id], changedScan.images, changedScan.scannedAt, changedScan.files);
    assert.deepEqual(await search([".txt"], { textLineCountRange: { minCount: 3, maxCount: 3 } }), [], "stale facts must not satisfy text filters");
    assert.equal((await listPendingTextDataFactCandidates([directory.id])).length, 1);
    console.log("Text and data fact extraction and filter integration tests passed.");
  } finally {
    await fs.rm(testRoot, { recursive: true, force: true });
  }
}).then(() => app.exit(0)).catch((error) => { console.error(error); app.exit(1); });
