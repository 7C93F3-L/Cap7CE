const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { fork, execFileSync } = require("node:child_process");
const sharp = require("sharp");
const { zipSync, strToU8 } = require("fflate");
const project = path.resolve(__dirname, ".."), manifest = require("../third_party/node-runtime/manifest.json");
const hash = bytes => crypto.createHash("sha256").update(bytes).digest("hex");

(async () => {
  // The copied application resources have no ancestor node_modules or Electron executable.
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "cap7ce-standalone-metadata-"));
  let child;
  try {
    const runtime = path.join(root, "runtime");
    await fs.cp(path.join(project, "artifacts/metadata-worker/v1"), runtime, { recursive: true });
    const executable = path.join(runtime, "node.exe");
    assert.equal(hash(await fs.readFile(executable)), manifest.sha256);
    const env = { SystemRoot: process.env.SystemRoot, TEMP: root, TMP: root, PATH: "", NODE_OPTIONS: "", NODE_PATH: "" };
    assert.deepEqual(JSON.parse(execFileSync(executable, ["-p", "JSON.stringify([process.version,process.versions.electron??null])"], { env, encoding: "utf8" })), ["v24.15.0", null]);
    child = fork(path.join(runtime, "worker.cjs"), [], { execPath: executable, execArgv: ["--max-old-space-size=256"],
      env, cwd: root, windowsHide: true, stdio: ["ignore", "ignore", "ignore", "ipc"] });
    let sequence = 0;
    const extract = task => new Promise((resolve, reject) => {
      const id = ++sequence;
      const cleanup = () => { clearTimeout(timer); child.off("message", receive); child.off("exit", exited); };
      const receive = response => { cleanup(); try { assert.equal(response.id, id); resolve(response.result); } catch (error) { reject(error); } };
      const exited = () => { cleanup(); reject(new Error("Standalone parser exited.")); };
      const timer = setTimeout(() => { cleanup(); reject(new Error("Standalone parser timed out.")); }, 15_000);
      child.once("message", receive); child.once("exit", exited); child.send({ type: "extract", id, task });
    });
    const fixtures = [
      ["unicode.txt", "text-data", Buffer.from("你好🙂\nend"), { textDataProperties: { factKind: "text", characterCount: 7, lineCount: 2 } }],
      ["empty.zip", "archive", Buffer.from(zipSync({})), { archiveProperties: { listingComplete: true, fileCount: 0, hasDirectories: false, contentTypes: [] } }],
      ["slides.pptx", "document", Buffer.from(zipSync({ "ppt/presentation.xml": strToU8("<p:presentation><p:sldId/><p:sldId/><p:sldId/></p:presentation>") })), { documentProperties: { contentCount: 3, countKind: "slides", hasEmbeddedImages: false } }],
      ["photo.png", "image-dimensions", await sharp({ create: { width: 13, height: 7, channels: 3, background: "red" } }).png().toBuffer(), { width: 13, height: 7 }],
      ["font.ttf", "font", await fs.readFile(path.join(project, "node_modules/pdfjs-dist/standard_fonts/LiberationSans-Regular.ttf")), { fontProperties: { weight: 400, italic: false, supportsLatin: true, supportsChinese: false, variable: false } }],
      ["artboard.psd", "document", Buffer.from(require("ag-psd").writePsd({ width: 1, height: 1, children: [] })), { documentProperties: { artboardCount: 0 } }]
    ];
    const objects = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>", "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 10 10] /Resources <<>> >>"];
    let pdf = "%PDF-1.4\n", offsets = [];
    objects.forEach((object, index) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
    const xref = Buffer.byteLength(pdf);
    pdf += `xref\n0 4\n0000000000 65535 f \n${offsets.map(offset => String(offset).padStart(10, "0") + " 00000 n \n").join("")}trailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    fixtures.push(["document.pdf", "document", Buffer.from(pdf), { documentProperties: { contentCount: 1, countKind: "pages", hasEmbeddedImages: false } }]);
    const header = Buffer.from('{"weight":{"dtype":"F16","shape":[16],"data_offsets":[0,32]}}'), length = Buffer.alloc(8);
    length.writeBigUInt64LE(BigInt(header.length));
    fixtures.push(["model.safetensors", "model", Buffer.concat([length, header]), { modelProperties: { parameterCount: 16, precision: "f16-bf16" } }]);
    for (const [name, kind, source, expected] of fixtures) {
      const filePath = path.join(root, name); await fs.writeFile(filePath, source);
      const result = await extract({ kind, filePath });
      assert.equal(result.state, "indexed", `${name} works without development dependencies`);
      for (const [key, value] of Object.entries(expected)) assert.deepEqual(result[key], value, `${name}: ${key}`);
      assert.equal(hash(await fs.readFile(filePath)), hash(source), "Source bytes are unchanged.");
    }
    console.log("Pinned metadata runtime works outside Electron, PATH and the repository.");
  } finally {
    if (child && child.exitCode === null) {
      const exited = new Promise(resolve => child.once("exit", resolve));
      child.kill(); await exited;
    }
    await fs.rm(root, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
