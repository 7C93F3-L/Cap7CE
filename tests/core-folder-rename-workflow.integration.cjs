const assert = require("node:assert/strict"), fs = require("node:fs/promises"), path = require("node:path"), os = require("node:os");
const { FavoriteDirectoryStore } = require("../dist-electron/favoriteDirectories/favoriteDirectoryStore.js");
const { requestCoreFolderRename } = require("../dist-electron/core/coreFolderRename.js");
const { requestWindowsFileOperation } = require("../dist-electron/core/coreWindowsFileOperations.js");
(async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "Cap7CE-Core-Rename-"));
  try {
    const config = path.join(root, "config/favorites.json"), journal = config + ".rename-pending", store = new FavoriteDirectoryStore(config);
    const original = path.join(root, "Original"), child = path.join(original, "Nested"), neighbor = original + "-neighbor";
    await fs.mkdir(child, { recursive: true }); await fs.writeFile(path.join(child, "content.bin"), "preserved source bytes");
    const initial = await store.add(original); const id = initial[0].id; await store.add(child); await store.add(neighbor);
    const request = (action, body) => requestCoreFolderRename({}, config, action, body);
    const stat = await fs.lstat(original, { bigint: true });
    let state = await request("prepare", { id, name: "Moved" }); assert.equal(state.kind, "prepared");
    const record = JSON.parse(await fs.readFile(journal, "utf8"));
    assert.deepEqual(Object.keys(record).sort(), ["dev", "ino", "newPath", "oldPath"]);
    assert.equal(record.dev, String(stat.dev)); assert.equal(record.ino, String(stat.ino), "native identity matches legacy Node journal fields");
    assert.equal((await request("recover")).kind, "none", "crash before physical action retires only its own unused journal");
    await assert.rejects(fs.stat(journal), { code: "ENOENT" }); assert.ok(await fs.stat(original));
    state = await request("prepare", { id, name: "Moved" });
    const outcome = await requestWindowsFileOperation({}, { operation: "rename", path: original, name: "Moved", owner: "0" });
    state = await request("observe", { outcome }); assert.equal(state.kind, "moved");
    const moved = path.join(root, "Moved");
    assert.equal((await store.list()).find(v => v.id === id).path, original, "favorite publication waits for Shell preference acknowledgement");
    assert.equal(state.directories.find(v => v.id === id).path, moved, "pending result reports the real moved location");
    const before = await fs.readFile(config), pending = await fs.readFile(journal);
    await assert.rejects(request("complete", { ticket: "0".repeat(64) }), /recovery-needed/);
    assert.deepEqual(await fs.readFile(config), before); assert.deepEqual(await fs.readFile(journal), pending, "stale acknowledgement cannot consume the recovery point");
    const recovered = await request("recover"); assert.equal(recovered.ticket, state.ticket);
    await request("complete", { ticket: recovered.ticket }); await assert.rejects(fs.stat(journal), { code: "ENOENT" });
    let items = await store.list(); assert.equal(items[0].id, id); assert.equal(items[0].path, moved);
    assert.equal(items[1].path, path.join(moved, "Nested")); assert.equal(items[2].path, neighbor);
    // A journal written by the previous Node implementation remains recoverable.
    const movedStat = await fs.lstat(moved, { bigint: true }), legacyTarget = path.join(root, "LegacyRecovered");
    await fs.writeFile(journal, JSON.stringify({ oldPath: moved, newPath: legacyTarget, dev: String(movedStat.dev), ino: String(movedStat.ino) }));
    await fs.rename(moved, legacyTarget); state = await request("recover"); assert.equal(state.kind, "moved");
    await request("complete", { ticket: state.ticket });
    assert.equal(await fs.readFile(path.join(legacyTarget, "Nested/content.bin"), "utf8"), "preserved source bytes");
    await request("prepare", { id, name: "Cancelled" });
    assert.equal((await request("observe", { outcome: { status: "cancelled" } })).kind, "none");
    await assert.rejects(fs.stat(journal), { code: "ENOENT" }); assert.ok(await fs.stat(legacyTarget));
    const protectedId = (await store.add(root)).at(-1).id;
    await assert.rejects(request("prepare", { id: protectedId, name: "Protected" }), /protected/); await store.remove(protectedId);
    // Unknown filesystem outcomes retain the journal and the last published configuration.
    await request("prepare", { id, name: "Ambiguous" }); const cfg = await fs.readFile(config), checkpoint = await fs.readFile(journal);
    const preserved = path.join(root, "PreservedElsewhere"); await fs.rename(legacyTarget, preserved); await fs.mkdir(path.join(root, "Ambiguous"));
    await assert.rejects(request("recover"), /recovery-needed/); assert.deepEqual(await fs.readFile(config), cfg); assert.deepEqual(await fs.readFile(journal), checkpoint);
    assert.equal(await fs.readFile(path.join(preserved, "Nested/content.bin"), "utf8"), "preserved source bytes");
    for (const invalid of ["{broken", "x".repeat(256 * 1024 + 1)]) {
      await fs.writeFile(journal, invalid); await assert.rejects(request("recover"));
      assert.equal(await fs.readFile(journal, "utf8"), invalid, "invalid recovery data must never be deleted"); assert.deepEqual(await fs.readFile(config), cfg);
    }
    console.log("Core rename workflow: native/Node identity compatibility, interrupted phases, acknowledgement fence, legacy recovery, nested favorites, protected configuration and ambiguous-state preservation passed.");
  } finally {
    assert.equal(path.dirname(path.resolve(root)).toLowerCase(), path.resolve(os.tmpdir()).toLowerCase()); assert.ok(path.basename(root).startsWith("Cap7CE-Core-Rename-"));
    await fs.rm(root, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
