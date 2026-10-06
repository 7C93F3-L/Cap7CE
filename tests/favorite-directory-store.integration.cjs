const assert = require("node:assert/strict");
const fs = require("node:fs/promises"), path = require("node:path"), os = require("node:os");
const { FavoriteDirectoryStore } = require("../dist-electron/favoriteDirectories/favoriteDirectoryStore.js");
(async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "cap7ce-favorites-"));
  const config = path.join(root, "settings", "favorites.json");
  const source = path.join(root, "original-synthetic.bin"), catalog = path.join(root, "catalog-synthetic.bin");
  const content = Buffer.from("synthetic source and catalog untouched by shortcut removal");
  await fs.writeFile(source, content); await fs.writeFile(catalog, content);
  try {
    const store = new FavoriteDirectoryStore(config);
    assert.deepEqual(await store.list(), []); await assert.rejects(fs.stat(config), { code: "ENOENT" });
    await Promise.all([store.add("x:/Assets/", "素材"), store.add("X:\\Assets\\Icons"), store.add("Y:\\")]);
    let items = await store.list(); assert.equal(items.length, 3); assert.equal(items[0].path, "X:\\Assets");
    assert.equal(items[2].name, "Y:"); assert.equal((await store.add("X:\\ASSETS", "duplicate alias")).length, 3);
    assert.equal((await store.list())[0].name, "素材", "duplicate shortcut does not overwrite its alias");
    assert.equal((await store.move(items[1].id, "up"))[0].id, items[1].id);
    assert.equal((await store.move(items[1].id, "up"))[0].id, items[1].id, "edge move is a no-op");
    await store.rename(items[0].id, "常用素材");
    await store.remove(items[0].id); assert.equal((await store.list()).length, 2);
    assert.deepEqual(await fs.readFile(source), content); assert.deepEqual(await fs.readFile(catalog), content);
    assert.deepEqual(await new FavoriteDirectoryStore(config).list(), await store.list(), "restart preserves order independently of a Catalog");
    const snapshot = await store.list(); snapshot[0].name = "changed"; assert.notEqual((await store.list())[0].name, "changed");
    const preserved = await fs.readFile(config);
    for (const bad of ["\\\\server\\assets", "C:relative", "X:\\Assets:stream", "X:\\bad\0folder", "X:\\" + "a".repeat(300)]) await assert.rejects(store.add(bad));
    await assert.rejects(store.rename(items[1].id, "   ")); await assert.rejects(store.move(items[1].id, "sideways"));
    await assert.rejects(store.remove("unknown")); assert.deepEqual(await fs.readFile(config), preserved);
    assert.deepEqual(await fs.readdir(path.dirname(config)), ["favorites.json"], "successful and rejected edits leave no staging files");
    const rename = fs.rename;
    fs.rename = async (from, to) => { if (to === config) throw Object.assign(Error("locked"), { code: "EPERM" }); return rename(from, to); };
    try { await assert.rejects(store.add("Z:\\AtomicFailure"), { code: "EPERM" }); } finally { fs.rename = rename; }
    assert.deepEqual(await fs.readFile(config), preserved, "failed replacement preserves the previous configuration");
    assert.equal((await store.list()).length, 2, "failed replacement does not publish an in-memory edit");
    assert.deepEqual(await fs.readdir(path.dirname(config)), ["favorites.json"]);
    const open = fs.open; let collision;
    fs.open = async (file, flags, ...rest) => {
      if (flags === "wx" && String(file).endsWith(".pending")) {
        collision = file; const existing = await open(file, "wx");
        try { await existing.writeFile(content); } finally { await existing.close(); }
        throw Object.assign(Error("collision"), { code: "EEXIST" });
      }
      return open(file, flags, ...rest);
    };
    try { await assert.rejects(store.add("Z:\\Collision"), { code: "EEXIST" }); } finally { fs.open = open; }
    assert.deepEqual(await fs.readFile(collision), content, "failed exclusive creation never deletes an existing file");
    assert.deepEqual(await fs.readFile(config), preserved);
    for (const corrupted of ["{broken", JSON.stringify({ version: 1, directories: [items[1], items[1]] }),
      JSON.stringify({ version: 1, directories: [], extra: true }), Buffer.from([0xff]), " ".repeat(1024 * 1024 + 1)]) {
      await fs.writeFile(config, corrupted); const invalid = new FavoriteDirectoryStore(config);
      await assert.rejects(invalid.list()); await assert.rejects(invalid.add("Z:\\New"));
      assert.deepEqual(await fs.readFile(config), Buffer.from(corrupted), "malformed existing configuration is never silently overwritten");
    }
    console.log("Favorite shortcut persistence, ordering, concurrent edits and original/Catalog preservation passed.");
  } finally {
    const resolved = path.resolve(root);
    assert.equal(path.dirname(resolved).toLowerCase(), path.resolve(os.tmpdir()).toLowerCase());
    assert.ok(path.basename(resolved).startsWith("cap7ce-favorites-"));
    await fs.rm(resolved, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
