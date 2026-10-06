const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const sharp = require("sharp");
const { MetadataWorkerClient } = require("../dist-electron/metadataExtraction/metadataWorkerClient.js");

const clients = [];
const create = (options) => { const client = new MetadataWorkerClient(options); clients.push(client); return client; };
const retryAfterRetirement = async (client, task) => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try { return await client.extract(task); }
    catch (error) {
      if (error.message !== "metadata-worker-busy") throw error;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }
  throw new Error("Worker did not retire.");
};
const createTinyPdf = () => {
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 10 10] /Resources <<>> /Contents 5 0 R >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 10 10] /Resources <<>> /Contents 5 0 R >>",
    "<< /Length 0 >>\nstream\n\nendstream"];
  let source = "%PDF-1.4\n"; const offsets = [0];
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(source)); source += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(source);
  source += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(offset => String(offset).padStart(10, "0") + " 00000 n \n").join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(source);
};

(async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "cap7ce-metadata-worker-"));
  try {
    const image = path.join(root, "中文图像.png");
    await sharp({ create: { width: 37, height: 23, channels: 3, background: "red" } }).png().toFile(image);
    const original = await fs.readFile(image);
    const client = create();
    const task = { kind: "image-dimensions", filePath: image };
    const imageMetadata = await client.extract(task);
    assert.equal(imageMetadata.state, "indexed"); assert.equal(imageMetadata.width, 37); assert.equal(imageMetadata.height, 23);
    assert.equal(imageMetadata.isAnimated, false); assert.equal(imageMetadata.visualProperties["colorRatio.red"], 10000);
    assert.deepEqual(await client.extract(task), imageMetadata);
    assert.deepEqual(await fs.readFile(image), original, "extractor must not write its source");
    const wave = Buffer.alloc(44 + 16000);
    wave.write("RIFF", 0); wave.writeUInt32LE(wave.length - 8, 4); wave.write("WAVEfmt ", 8);
    wave.writeUInt32LE(16, 16); wave.writeUInt16LE(1, 20); wave.writeUInt16LE(2, 22);
    wave.writeUInt32LE(8000, 24); wave.writeUInt32LE(32000, 28); wave.writeUInt16LE(4, 32);
    wave.writeUInt16LE(16, 34); wave.write("data", 36); wave.writeUInt32LE(16000, 40);
    const audioPath = path.join(root, "生成音频.wav"); await fs.writeFile(audioPath, wave);
    const audioMetadata = await client.extract({ kind: "audio", filePath: audioPath });
    assert.equal(audioMetadata.state, "indexed"); assert.equal(audioMetadata.channelCount, 2);
    assert.equal(audioMetadata.durationMilliseconds, 500); assert.equal(audioMetadata.width, undefined);
    assert.deepEqual(await fs.readFile(audioPath), wave, "audio reader cannot alter source");
    const fontPath = path.join(root, "生成测试字体.ttf");
    const fontSource = await fs.readFile(path.join(__dirname, "..", "node_modules", "pdfjs-dist", "standard_fonts", "LiberationSans-Regular.ttf"));
    await fs.writeFile(fontPath, fontSource);
    const fontMetadata = await client.extract({ kind: "font", filePath: fontPath });
    assert.equal(fontMetadata.state, "indexed"); assert.equal(fontMetadata.fontProperties.weight, 400);
    assert.equal(fontMetadata.fontProperties.italic, false); assert.equal(fontMetadata.fontProperties.supportsLatin, true);
    assert.equal(fontMetadata.width, undefined); assert.deepEqual(await fs.readFile(fontPath), fontSource);
    const modelHeader = Buffer.from(JSON.stringify({ weight: { dtype: "F16", shape: [3_000_000_001], data_offsets: [0, 6_000_000_002] } }));
    const modelLength = Buffer.alloc(8); modelLength.writeBigUInt64LE(BigInt(modelHeader.length));
    const modelSource = Buffer.concat([modelLength, modelHeader]);
    const modelPath = path.join(root, "生成模型.safetensors"); await fs.writeFile(modelPath, modelSource);
    const modelMetadata = await client.extract({ kind: "model", filePath: modelPath });
    assert.equal(modelMetadata.state, "indexed");
    assert.deepEqual(modelMetadata.modelProperties, { parameterCount: 3_000_000_001, precision: "f16-bf16" });
    assert.equal(modelMetadata.width, undefined); assert.deepEqual(await fs.readFile(modelPath), modelSource);
    const { zipSync, strToU8 } = require("fflate");
    const documentSource = Buffer.from(zipSync({ "docProps/app.xml": strToU8("<Properties><Pages>10</Pages></Properties>") }));
    const documentPath = path.join(root, "生成文档.docx"); await fs.writeFile(documentPath, documentSource);
    const documentMetadata = await client.extract({ kind: "document", filePath: documentPath });
    assert.equal(documentMetadata.state, "indexed");
    assert.deepEqual(documentMetadata.documentProperties, { contentCount: 10, countKind: "pages", hasEmbeddedImages: false });
    assert.deepEqual(await fs.readFile(documentPath), documentSource);
    const { writePsd } = require("ag-psd");
    const artboardSource = Buffer.from(writePsd({ width: 1, height: 1, children: [] }));
    const artboardPath = path.join(root, "零画板.psd"); await fs.writeFile(artboardPath, artboardSource);
    const artboardMetadata = await client.extract({ kind: "document", filePath: artboardPath });
    assert.equal(artboardMetadata.state, "indexed");
    assert.deepEqual(artboardMetadata.documentProperties, { artboardCount: 0 });
    assert.deepEqual(await fs.readFile(artboardPath), artboardSource);
    const pdfSource = createTinyPdf(), pdfPath = path.join(root, "连续解析.pdf"), aiPath = path.join(root, "连续画板.ai");
    await fs.writeFile(pdfPath, pdfSource); await fs.writeFile(aiPath, pdfSource);
    const documentRecycle = create({ recycleResidentBytes: 1 });
    for (let index = 0; index < 16; index++) {
      const pdf = index % 2 === 0;
      const parsed = await retryAfterRetirement(documentRecycle, { kind: "document", filePath: pdf ? pdfPath : aiPath });
      assert.equal(parsed.state, "indexed", "native PDF parser remains stable across owned process retirement");
      assert.deepEqual(parsed.documentProperties, pdf ? { contentCount: 2, countKind: "pages", hasEmbeddedImages: false } : { artboardCount: 2 });
    }
    assert.deepEqual(await fs.readFile(pdfPath), pdfSource); assert.deepEqual(await fs.readFile(aiPath), pdfSource);
    const threeDPath = path.join(root, "已知三维.gltf"), unknownThreeDPath = path.join(root, "未知三维.gltf");
    const threeDSource = Buffer.from(JSON.stringify({ asset: { version: "2.0" }, accessors: [{ count: 6 }], meshes: [{ primitives: [{ indices: 0 }] }], skins: [{}] }));
    await fs.writeFile(threeDPath, threeDSource);
    const threeDMetadata = await client.extract({ kind: "three-d", filePath: threeDPath });
    assert.deepEqual(threeDMetadata.threeDProperties, { triangleCount: 2, hasAnimation: false, hasRig: true });
    await fs.writeFile(unknownThreeDPath, JSON.stringify({ meshes: [{ primitives: [{}] }], animations: [{}] }));
    const unknownThreeDMetadata = await client.extract({ kind: "three-d", filePath: unknownThreeDPath });
    assert.deepEqual(unknownThreeDMetadata.threeDProperties, { hasAnimation: true, hasRig: false }, "unknown count cannot become zero");
    assert.deepEqual(await fs.readFile(threeDPath), threeDSource);
    for (const [filename, contents, expected] of [
      ["empty.txt", "", { factKind: "text", characterCount: 0, lineCount: 0 }],
      ["unicode.txt", "你好🙂\r\nend", { factKind: "text", characterCount: 8, lineCount: 2 }],
      ["empty.csv", "", { factKind: "csv", recordCount: 0, columnCount: 0 }],
      ["records.csv", 'a,b\n"quoted\nline",c', { factKind: "csv", recordCount: 2, columnCount: 2 }],
      ["empty.json", "[]", { factKind: "json", recordCount: 0, jsonRootKind: "array" }]
    ]) {
      const filePath = path.join(root, filename); await fs.writeFile(filePath, contents);
      assert.deepEqual(await client.extract({ kind: "text-data", filePath }), { state: "indexed", textDataProperties: expected });
      assert.equal(await fs.readFile(filePath, "utf8"), contents, "text/data reader cannot change source");
    }
    const malformedCsv = path.join(root, "ambiguous.csv"); await fs.writeFile(malformedCsv, '"a"trailing,b');
    assert.deepEqual(await client.extract({ kind: "text-data", filePath: malformedCsv }), { state: "failed", errorCode: "text-data-csv-invalid" });
    const archivePath = path.join(root, "empty.zip");
    const archiveBytes = require("fflate").zipSync({}); await fs.writeFile(archivePath, archiveBytes);
    assert.deepEqual(await client.extract({ kind: "archive", filePath: archivePath }), {
      state: "indexed", archiveProperties: { listingComplete: true, fileCount: 0, hasDirectories: false, contentTypes: [] }
    });
    assert.deepEqual(await fs.readFile(archivePath), Buffer.from(archiveBytes), "archive worker cannot change source");
    const missing = await client.extract({ ...task, filePath: path.join(root, "missing.png") });
    assert.equal(missing.state, "failed");
    assert.equal((await client.extract({ ...task, filePath: "\\\\server\\share\\file.png" })).errorCode, "metadata-path-rejected");

    const recycle = create({ recycleResidentBytes: 1 });
    assert.equal((await recycle.extract(task)).width, 37);
    assert.equal((await retryAfterRetirement(recycle, task)).height, 23);

    // Generated helper never reads files; it lets us exercise hang, crash and bad IPC recovery.
    const fixture = path.join(root, "helper.cjs");
    await fs.writeFile(fixture, `
process.on('message', (request) => {
  if (request.type === 'stop') return process.exit(0);
  if (request.task.filePath === 'crash') return process.exit(7);
  if (request.task.filePath === 'hang') return;
  if (request.task.filePath === 'healthy') return process.send({id:request.id,result:{state:'indexed',width:37,height:23},residentBytes:100});
  if (request.task.filePath === 'bad-vector') return process.send({id:request.id,result:{state:'indexed',width:37,height:23,visualProperties:{'colorRatio.red':10001}},residentBytes:100});
  if (request.task.filePath === 'bad-document') return process.send({id:request.id,result:{state:'indexed',documentProperties:{hasEmbeddedImages:false}},residentBytes:100});
  if (request.task.filePath === 'bad-model') return process.send({id:request.id,result:{state:'indexed',modelProperties:{parameterCount:9007199254740992,precision:'4bit'}},residentBytes:100});
  if (request.task.filePath === 'bad-three-d') return process.send({id:request.id,result:{state:'indexed',threeDProperties:{triangleCount:9007199254740992}},residentBytes:100});
  if (request.task.filePath === 'bad-text-data') return process.send({id:request.id,result:{state:'indexed',textDataProperties:{factKind:'json',recordCount:0,jsonRootKind:['array']}},residentBytes:100});
  process.send({id:request.id,result:{state:'indexed',width:-1,height:23},residentBytes:100});
});
`);
    const controlled = create({ workerPath: fixture, timeoutMs: 1000 });
    const abort = new AbortController();
    const pending = controlled.extract({ ...task, filePath: "hang" }, abort.signal);
    await assert.rejects(controlled.extract(task), /metadata-worker-busy/);
    abort.abort();
    await assert.rejects(pending, /metadata-worker-cancelled/);
    await assert.rejects(retryAfterRetirement(controlled, { ...task, filePath: "crash" }), /metadata-worker-exited/);
    assert.equal((await retryAfterRetirement(controlled, { ...task, filePath: "healthy" })).width, 37,
      "a crashed helper fully exits before another source starts in a replacement helper");
    await assert.rejects(retryAfterRetirement(controlled, task), /metadata-worker-invalid-response/);
    await assert.rejects(retryAfterRetirement(controlled, { ...task, filePath: "bad-vector" }), /metadata-worker-invalid-response/);
    await assert.rejects(retryAfterRetirement(controlled, { kind: "document", filePath: "bad-document" }), /metadata-worker-invalid-response/);
    await assert.rejects(retryAfterRetirement(controlled, { kind: "model", filePath: "bad-model" }), /metadata-worker-invalid-response/);
    await assert.rejects(retryAfterRetirement(controlled, { kind: "three-d", filePath: "bad-three-d" }), /metadata-worker-invalid-response/);
    await assert.rejects(retryAfterRetirement(controlled, { kind: "text-data", filePath: "bad-text-data" }), /metadata-worker-invalid-response/);
    await assert.rejects(retryAfterRetirement(controlled, { ...task, filePath: "hang" }), /metadata-worker-timeout/);
    assert.equal((await retryAfterRetirement(controlled, { ...task, filePath: "healthy" })).height, 23,
      "a timed-out helper can be replaced without leaving the client permanently busy");
    controlled.close();
    await assert.rejects(controlled.extract(task), /metadata-worker-closed/);
    console.log("Isolated metadata worker lifecycle tests passed.");
  } finally {
    for (const client of clients) client.close();
    // Allow owned helpers to release the generated fixture before cleanup on Windows.
    await new Promise((resolve) => setTimeout(resolve, 600));
    await fs.rm(root, { recursive: true, force: true });
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
