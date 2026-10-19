const assert = require("node:assert/strict"), fs = require("node:fs/promises"), path = require("node:path"), os = require("node:os");
const { spawn } = require("node:child_process");
const { FavoriteDirectoryStore } = require("../dist-electron/favoriteDirectories/favoriteDirectoryStore.js");
const { favoritePath, favoriteName } = require("../dist-electron/favoriteDirectories/favoriteDirectoryRules.js");
const binary = path.resolve("core/artifacts/configuration-host/Cap7CE.Core.Configuration.Host.exe");
const invoke = (exe, args, input = Buffer.alloc(0), env = process.env) => new Promise((resolve, reject) => {
  const child = spawn(exe, args, { stdio: ["pipe", "pipe", "pipe"], windowsHide: true, shell: false, env });
  const out = [], errors = []; child.on("error", reject); child.stdout.on("data", b => out.push(b)); child.stderr.on("data", b => errors.push(b));
  child.stdin.on("error", () => {}); child.on("close", code => resolve({ code, bytes: Buffer.concat(out), stderr: Buffer.concat(errors) })); child.stdin.end(input);
});
(async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "Cap7CE-Configuration-"));
  try {
    const state = path.join(root, "favorites.json"), resourceRoot = path.join(root, "resources"), target = path.join(resourceRoot, "core-configuration/v1", path.basename(binary));
    await fs.mkdir(path.dirname(target), { recursive: true }); await fs.copyFile(binary, target);
    const executableBytes = await fs.readFile(target), pe = executableBytes.readUInt32LE(0x3c);
    assert.equal(executableBytes.readUInt32LE(pe), 0x4550); assert.equal(executableBytes.readUInt16LE(pe + 24), 0x20b);
    assert.equal(executableBytes.readUInt32LE(pe + 24 + 112 + 14 * 8), 0, "native host has no CLR data directory");
    const describe = await invoke(target, ["--describe"], undefined, { ...process.env, DOTNET_ROOT: path.join(root, "no-runtime"), DOTNET_MULTILEVEL_LOOKUP: "0" });
    assert.equal(describe.code, 0); assert.equal(JSON.parse(describe.bytes).runtimeRequired, false);
    const store = new FavoriteDirectoryStore(state, { packaged: true, resourcesPath: resourceRoot });
    assert.deepEqual(await store.list(), []); await assert.rejects(fs.stat(state), { code: "ENOENT" });
    for (const candidate of ["x:/Assets///Icons/..", "c:/../../../", "y:\\素材\\子目录\\..", "Z:\\ΟΣ", "Z:\\İ", "Z:\\a $() '` folder", "D:\\a.\\b ", "E:\\..a\\..\\x"])
      assert.equal((await store.add(candidate)).at(-1).path, favoritePath(candidate));
    for (const value of ["Z:\\ΟΣ", "Z:\\İ"]) {
      const before = await store.list(); assert.equal((await store.add(value.toLowerCase())).length, before.length, "Unicode duplicate keys match previous JavaScript rules");
    }
    const first = (await store.list())[0];
    for (const name of ["\ufeff 名称 \ufeff", "\u0085", "\u2000Label\u3000", "A😀"])
      assert.equal((await store.rename(first.id, name)).find(v => v.id === first.id).name, favoriteName(name));
    const preserved = await fs.readFile(state);
    for (const bytes of [Buffer.alloc(0), Buffer.from([1, 0, 0, 0]), Buffer.from([1, 0, 16, 0]), Buffer.from([4, 0, 0, 0, 0xff]), Buffer.from([2, 0, 0, 0, 0xff, 0xff])]) {
      const result = await invoke(target, ["--favorites-file", state], bytes);
      assert.equal(result.stderr.length, 0, "malformed requests never log private details");
      assert.deepEqual(await fs.readFile(state), preserved, "malformed frames cannot modify configuration");
    }
    const direct = await invoke(target, ["--favorites-file", "relative.json"]); assert.equal(direct.code, 2);
    assert.deepEqual(await fs.readdir(root), ["favorites.json", "resources"], "no database, source or lock files are created");
    console.log("Native configuration host: packaged resource path, no CLR/runtime requirement, legacy Unicode rules and malformed-frame preservation passed.");
  } finally {
    assert.equal(path.dirname(path.resolve(root)).toLowerCase(), path.resolve(os.tmpdir()).toLowerCase());
    assert.ok(path.basename(root).startsWith("Cap7CE-Configuration-")); await fs.rm(root, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
