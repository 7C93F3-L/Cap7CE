const assert = require('node:assert/strict'), fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os');
const { app, BrowserWindow } = require('electron');
const { FavoriteDirectoryStore } = require('../dist-electron/favoriteDirectories/favoriteDirectoryStore.js');
const { FavoriteFolderRenameService } = require('../dist-electron/favoriteDirectories/favoriteFolderRenameService.js');
const { renameDirectoryWithWindowsShell } = require('../dist-electron/windowsShellRename.js');
const { CatalogGridPreferenceStore } = require('../dist-electron/catalogGridPreferenceStore.js');
const { readCatalogGridSizes, isCatalogGridSize } = require('../dist-electron/catalogGridSizeRules.js');
const { registerFavoriteDirectoryIpc } = require('../dist-electron/favoriteDirectories/favoriteDirectoryIpc.js');
app.whenReady().then(async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'Cap7CE-folder-rename-')); let win;
  try {
    await fs.mkdir(root + '-profile'); app.setPath('userData', root + '-profile');
    win = new BrowserWindow({ show: false }); const handle = win.getNativeWindowHandle(), owner = handle.readBigUInt64LE().toString();
    const registry = new FavoriteDirectoryStore(path.join(root, 'config', 'favorites.json'));
    const modes = new CatalogGridPreferenceStore(() => path.join(root, 'config', 'modes.json'));
    const sizes = new CatalogGridPreferenceStore(() => path.join(root, 'config', 'sizes.json'), { read: readCatalogGridSizes, valid: isCatalogGridSize });
    const original = path.join(root, 'Original'), child = path.join(original, 'Nested');
    await fs.mkdir(child, { recursive: true }); await fs.writeFile(path.join(child, 'asset.txt'), 'preserved');
    let items = await registry.add(original); const id = items[0].id; await registry.add(child); await registry.add(original + '-neighbor');
    await modes.update(original, 'square'); await modes.update(child, 'gallery'); await sizes.update(original, 145);
    const migrate = async change => { await modes.relocate(change); await sizes.relocate(change); };
    const service = new FavoriteFolderRenameService(registry, renameDirectoryWithWindowsShell, migrate, async () => {});
    // A real IFileOperation rename, including input that must never be evaluated as shell code.
    const label = "素材 $() '& ` 文件夹", renamed = path.join(root, label);
    const result = await service.rename(id, label, owner);
    assert.equal(result.change.newPath, renamed); assert.equal(result.warning, undefined);
    await assert.rejects(fs.stat(original), { code: 'ENOENT' });
    assert.equal(await fs.readFile(path.join(renamed, 'Nested', 'asset.txt'), 'utf8'), 'preserved');
    const reloaded = new FavoriteDirectoryStore(path.join(root, 'config', 'favorites.json'));
    items = await reloaded.list(); assert.equal(items.find(v => v.id === id).path, renamed);
    assert.ok(items.some(v => v.path === path.join(renamed, 'Nested'))); assert.ok(items.some(v => v.path === original + '-neighbor'));
    const key = value => 'favorite:' + value.toLowerCase();
    assert.equal((await modes.get())[key(renamed)], 'square'); assert.equal((await modes.get())[key(path.join(renamed, 'Nested'))], 'gallery');
    assert.equal((await sizes.get())[key(renamed)], 145); assert.equal((await modes.get())[key(original)], undefined);
    await assert.rejects(fs.stat(registry.renameJournalPath), { code: 'ENOENT' });
    let shellCalls = 0;
    const cancelled = new FavoriteFolderRenameService(registry, async () => { shellCalls++; return { status: 'cancelled' }; }, migrate, async () => {});
    assert.equal((await cancelled.rename(id, 'Cancelled', owner)).change, null); assert.equal(shellCalls, 1);
    assert.equal((await registry.list()).find(v => v.id === id).path, renamed);
    for (const name of ['../escape', 'a\\b', 'CON.txt', 'NUL', 'bad.', 'bad ', '', 'a:b']) await assert.rejects(cancelled.rename(id, name, owner));
    assert.equal(shellCalls, 1, 'invalid names never enter Shell');
    const rootFavorite = (await registry.add(path.parse(root).root)).at(-1);
    await assert.rejects(cancelled.rename(rootFavorite.id, 'Root', owner), /root/); await registry.remove(rootFavorite.id);
    const junction = path.join(root, 'Junction'); await fs.symlink(renamed, junction, 'junction');
    const linkFavorite = (await registry.add(junction)).at(-1);
    await assert.rejects(cancelled.rename(linkFavorite.id, 'Link', owner), /not-directory/); await registry.remove(linkFavorite.id);
    const duplicate = (await registry.add(path.join(root, 'AlreadyFavorited'))).at(-1);
    await assert.rejects(cancelled.rename(id, 'AlreadyFavorited', owner), /favorite-conflict/); await registry.remove(duplicate.id);
    assert.equal(shellCalls, 1, 'roots, junctions and duplicate favorite paths never enter Shell');
    const failing = new FavoriteFolderRenameService(registry, async () => ({ status: 'failed', error: -2147024891 }), migrate, async () => {});
    await assert.rejects(failing.rename(id, 'Denied', owner), /shell-failed/); assert.ok(await fs.stat(renamed));
    // Persist failures after a successful native rename remain recoverable across a fresh registry instance.
    const pending = new FavoriteFolderRenameService(registry, renameDirectoryWithWindowsShell, async () => { throw Error('disk full'); }, async () => {});
    const moved = await pending.rename(id, 'Recovered', owner);
    assert.equal(moved.warning, 'folder-rename-save-pending'); assert.equal(moved.directories.find(v => v.id === id).path, path.join(root, 'Recovered'));
    const recovery = new FavoriteFolderRenameService(reloaded, renameDirectoryWithWindowsShell, migrate, async () => {});
    await recovery.recover(); assert.equal((await reloaded.list()).find(v => v.id === id).path, path.join(root, 'Recovered'));
    assert.equal((await sizes.get())[key(path.join(root, 'Recovered'))], 145);
    const caseOnly = await recovery.rename(id, 'recovered', owner);
    assert.equal(caseOnly.change.newPath, path.join(root, 'recovered'));
    assert.equal((await reloaded.list()).find(v => v.id === id).name, 'recovered');
    // The old process's store is intentionally discarded after this simulated restart.
    const handlers = new Map(); let release, entered;
    const started = new Promise(resolve => { entered = resolve; });
    const controlled = { recover: async () => {}, rename: async () => { entered(); return new Promise(resolve => { release = resolve; }); } };
    registerFavoriteDirectoryIpc({ handle: (channel, fn) => handlers.set(channel, fn), on() {} }, event => event.allowed, reloaded, async () => null, controlled);
    const event = { allowed: true, sender: win.webContents };
    await assert.rejects(handlers.get('favoriteDirectories:renameFolder')({ allowed: false }, id, 'Forbidden'), /not allowed/);
    const operation = handlers.get('favoriteDirectories:renameFolder')(event, id, 'Pending'); await started;
    await assert.rejects(handlers.get('favoriteDirectories:remove')(event, id), /busy/);
    release({ change: null, directories: await reloaded.list() }); await operation;
    assert.equal((await handlers.get('favoriteDirectories:list')(event)).length, 3);
    console.log('Real Windows Shell folder rename, Unicode/literal input, nested favorites, grid preferences, cancellation, failure recovery and IPC serialization passed.');
  } catch (error) { console.error(error); process.exitCode = 1; } finally {
    win?.destroy(); assert.equal(path.dirname(path.resolve(root)).toLowerCase(), path.resolve(os.tmpdir()).toLowerCase());
    assert.ok(path.basename(root).startsWith('Cap7CE-folder-rename-')); await fs.rm(root, { recursive: true, force: true }); app.exit(process.exitCode ?? 0);
  }
}).catch(error => { console.error(error); app.exit(1); });
