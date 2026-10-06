const assert = require("node:assert/strict");
const fs = require("node:fs/promises"), path = require("node:path"), os = require("node:os");
const { FavoriteDirectoryStore } = require("../dist-electron/favoriteDirectories/favoriteDirectoryStore.js");
const { registerFavoriteDirectoryIpc } = require("../dist-electron/favoriteDirectories/favoriteDirectoryIpc.js");
const { createFavoriteDirectoryBridge } = require("../dist-electron/favoriteDirectories/favoriteDirectoryBridge.js");
(async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "cap7ce-favorite-ipc-"));
  try {
    const config = path.join(root, "favorites.json"), handlers = new Map();
    const store = new FavoriteDirectoryStore(config); let choice = null, chooserCalls = 0;
    registerFavoriteDirectoryIpc({ handle(channel, fn) { handlers.set(channel, fn); }, on() {} }, event => event.allowed, store,
      async () => { chooserCalls++; return choice; });
    for (const handler of handlers.values()) await assert.rejects(handler({ allowed: false }, "X:\\Assets"), /not allowed/);
    assert.equal(chooserCalls, 0); await assert.rejects(fs.stat(config), { code: "ENOENT" });
    const bridge = createFavoriteDirectoryBridge({ invoke(channel, ...args) { return handlers.get(channel)({ allowed: true }, ...args); } });
    assert.deepEqual(await bridge.list(), []); assert.equal(chooserCalls, 0);
    assert.deepEqual(await bridge.choose(), []); assert.equal(chooserCalls, 1);
    await assert.rejects(fs.stat(config), { code: "ENOENT" }, "cancelled picker creates no configuration");
    let items = await bridge.add("x:/Assets"); assert.equal(items[0].path, "X:\\Assets");
    choice = "Y:\\OfflineFolder"; items = await bridge.choose(); assert.equal(items.length, 2);
    await bridge.rename(items[0].id, "常用素材"); await bridge.move(items[1].id, "up");
    assert.equal((await bridge.list())[0].id, items[1].id);
    const preserved = await fs.readFile(config);
    for (const request of [() => bridge.add("\\\\server\\share"), () => bridge.rename("not-an-id", "name"),
      () => bridge.rename(items[0].id, {}), () => bridge.remove([]), () => bridge.move(items[0].id, "drag")]) await assert.rejects(request());
    assert.deepEqual(await fs.readFile(config), preserved, "invalid Renderer requests cannot alter the registry");
    await bridge.remove(items[0].id); await store.waitForIdle(); assert.equal((await bridge.list()).length, 1);
    console.log("Favorite IPC sender gate, explicit/cancelled picker, shared bridge and configuration-only actions passed.");
  } finally {
    const resolved = path.resolve(root);
    assert.equal(path.dirname(resolved).toLowerCase(), path.resolve(os.tmpdir()).toLowerCase());
    assert.ok(path.basename(resolved).startsWith("cap7ce-favorite-ipc-"));
    await fs.rm(resolved, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
