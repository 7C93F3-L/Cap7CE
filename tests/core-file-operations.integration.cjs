const assert = require("node:assert/strict"), fs = require("node:fs/promises"), os = require("node:os"), path = require("node:path");
const { spawn } = require("node:child_process");
const { requestWindowsFileOperation } = require("../dist-electron/core/coreWindowsFileOperations.js");
const host = path.resolve("core/artifacts/file-operations-host/Cap7CE.Core.FileOperations.Host.exe");
const invoke = (executable, input, args = []) => new Promise((resolve, reject) => {
  const child = spawn(executable, args, { windowsHide: true, shell: false, stdio: ["pipe", "pipe", "pipe"], env: { ...process.env, DOTNET_ROOT: "C:\\Cap7CE-no-runtime", DOTNET_MULTILEVEL_LOOKUP: "0" } });
  const chunks = [], errors = []; child.on("error", reject); child.stdout.on("data", chunk => chunks.push(chunk)); child.stderr.on("data", chunk => errors.push(chunk));
  child.stdin.on("error", () => {}); child.on("close", code => resolve({ code, bytes: Buffer.concat(chunks), error: Buffer.concat(errors) })); child.stdin.end(input);
});
const frame = request => { const bytes = Buffer.from(JSON.stringify({ version: 1, ...request })), header = Buffer.alloc(4); header.writeInt32LE(bytes.length); return Buffer.concat([header, bytes]); };
(async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "Cap7CE-Core-Operations-"));
  try {
    const resourcesPath = path.join(root, "resources"), resource = path.join(resourcesPath, "core-file-operations/v1");
    await fs.mkdir(resource, { recursive: true });
    for (const name of ["Cap7CE.Core.FileOperations.Host.exe", "Cap7CE.Core.FileOperations.Native.dll"]) await fs.copyFile(path.join(path.dirname(host), name), path.join(resource, name));
    const target = path.join(resource, path.basename(host)), options = { packaged: true, resourcesPath };
    const describe = await invoke(target, Buffer.alloc(0), ["--describe"]); assert.equal(describe.code, 0); assert.equal(JSON.parse(describe.bytes).runtimeRequired, false);
    const image = await fs.readFile(target), pe = image.readUInt32LE(0x3c);
    assert.equal(image.readUInt32LE(pe + 24 + 112 + 14 * 8), 0, "standalone native host has no CLR data directory");
    const original = path.join(root, "Original"), content = "original bytes unchanged\n";
    await fs.mkdir(original); await fs.writeFile(path.join(original, "keep.txt"), content);
    const label = "素材 $() '` folder", expected = path.join(root, label);
    const renamed = await requestWindowsFileOperation(options, { operation: "rename", path: original, name: label, owner: "0" });
    assert.equal(renamed.status, "renamed"); assert.equal(renamed.path, expected); await assert.rejects(fs.stat(original), { code: "ENOENT" });
    assert.equal(await fs.readFile(path.join(expected, "keep.txt"), "utf8"), content);
    for (const request of [{ operation: "rename", path: expected, name: "NUL.txt", owner: "0" },
      { operation: "rename", path: expected, name: "..", owner: "0" }, { operation: "rename", path: expected, name: "bad\0suffix", owner: "0" },
      { operation: "trash", path: path.parse(root).root }, { operation: "trash", path: path.join(path.parse(root).root, "temporary", "..") },
      { operation: "unsupported", path: expected }]) {
      const result = await invoke(target, frame(request)); assert.notEqual(result.code, 0); assert.equal(result.error.length, 0);
      assert.equal(await fs.readFile(path.join(expected, "keep.txt"), "utf8"), content, "rejected request preserves its source");
    }
    for (const bytes of [Buffer.from([0, 0, 0, 0]), Buffer.from([1, 0, 16, 0]), Buffer.from([4, 0, 0, 0, 1])]) assert.notEqual((await invoke(target, bytes)).code, 0);
    const trash = path.join(root, "owned-recycle.txt"); await fs.writeFile(trash, "only this disposable file is recycled");
    assert.equal((await requestWindowsFileOperation(options, { operation: "trash", path: trash })).status, "deleted");
    await assert.rejects(fs.stat(trash), { code: "ENOENT" });
    const missing = await requestWindowsFileOperation(options, { operation: "trash", path: path.join(root, "missing.txt") }); assert.equal(missing.status, "failed");
    assert.equal(await fs.readFile(path.join(expected, "keep.txt"), "utf8"), content);
    console.log("Core Windows operations: independent native packaged host, literal Unicode rename, original bytes, invalid/root/frame rejection and disposable recycle passed.");
  } finally {
    assert.equal(path.dirname(path.resolve(root)).toLowerCase(), path.resolve(os.tmpdir()).toLowerCase()); assert.ok(path.basename(root).startsWith("Cap7CE-Core-Operations-"));
    await fs.rm(root, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
