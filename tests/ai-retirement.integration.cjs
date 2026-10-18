const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { app, BrowserWindow, ipcMain } = require('electron');
const profile = path.join(os.tmpdir(), `Cap7CE-ai-retirement-${require('node:crypto').randomUUID()}`);
require('node:fs').mkdirSync(profile);
app.setPath('userData', profile);
app.setPath('sessionData', profile);

app.whenReady().then(async () => {
  let window;
  try {
    const preferences = require('../dist-electron/preferenceStore.js');
    const { setActiveLanguage } = require('../dist-electron/localization.js');
    const { createCatalogAutoKeywordService } = require('../dist-electron/catalogAutoKeywordService.js');
    const { registerCatalogAutoKeywordIpc } = require('../dist-electron/catalogAutoKeywordIpc.js');
    assert.equal(Object.hasOwn(await preferences.getUserPreferences(), 'aiRecognitionEnabled'), false);
    assert.equal(preferences.updateAiRecognitionEnabledPreference, undefined);
    const file = path.join(profile, 'config', 'preferences.json');
    await fs.mkdir(path.dirname(file), { recursive: true });
    const legacy = JSON.stringify({ aiRecognitionEnabled: false, themePreference: 'dark' });
    await fs.writeFile(file, legacy);
    assert.equal((await preferences.getUserPreferences()).aiRecognitionEnabled, false);
    assert.equal(await fs.readFile(file, 'utf8'), legacy, 'reading must not migrate the old preference');
    await preferences.updateThemePreference('light');
    assert.equal(JSON.parse(await fs.readFile(file, 'utf8')).aiRecognitionEnabled, false);

    const items = ['a', 'b'].map(id => ({ authorizationId: id, name: `${id}.png`, path: path.join(profile, `${id}.png`),
      extension: '.png', volumeId: 'synthetic', fileReference: id, isDirectory: false }));
    const words = new Map();
    let writes = 0, starts = 0, recognizes = 0, failStartup = false;
    const keywords = { prepare: async () => {}, read: async item => ({ keywords: words.get(item.name) ?? [], revision: '1' }),
      write: async (item, values) => { writes++; words.set(item.name, values); return { saved: true, current: { keywords: values, revision: '2' } }; } };
    const run = createCatalogAutoKeywordService({ keywords, fingerprint: async () => 'synthetic-revision', prepareImage: async () => 'synthetic-image',
      beginUse: async () => { starts++; if (failStartup) throw Error('missing-model'); }, endUse: () => {},
      recognize: async (_image, _signal, starting, generating) => { starting(); generating(); recognizes++; return ['测试关键词']; } });
    let sender;
    ipcMain.handle('preferences:get', () => preferences.getUserPreferences());
    registerCatalogAutoKeywordIpc({ registrar: ipcMain, isSenderAllowed: event => event.sender === sender, keywords, runtime: {},
      resolveItem: request => { const item = items.find(item => item.authorizationId === request.authorizationId); assert.ok(item); return item; },
      resolveItems: request => request.authorizationIds.map(id => { const item = items.find(item => item.authorizationId === id); assert.ok(item); return item; }),
      createService: async () => run });
    const errors = [];
    window = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false,
      preload: path.resolve(__dirname, '../dist-electron/preload.js') } });
    sender = window.webContents;
    sender.on('preload-error', (_event, _file, error) => errors.push(error.message));
    await window.loadURL('data:text/html,<meta charset="utf-8"><p>Isolated AI retirement fixture</p>');
    const bridge = await sender.executeJavaScript(`({ oldSearch: typeof window.cap7ce.aiSearch,
      oldToggle: typeof window.cap7ce.preferences.updateAiRecognitionEnabled,
      runtime: typeof window.cap7ce.llamaRuntime.start, models: typeof window.cap7ce.ggufModels.settings, node: typeof require })`);
    assert.deepEqual(bridge, { oldSearch: 'undefined', oldToggle: 'undefined', runtime: 'function', models: 'function', node: 'undefined' });
    const single = id => sender.executeJavaScript(`window.cap7ce.computerSearch.generateKeywords({ taskId: 'fixture', authorizationId: 'a', requestId: '${id}' })`);
    const batch = id => sender.executeJavaScript(`window.cap7ce.computerSearch.generateKeywordBatch({ taskId: 'fixture', authorizationIds: ['a', 'b'], requestId: '${id}' })`);
    assert.equal(starts, 0, 'startup and preference reads never invoke the model');
    assert.equal((await single('single')).status, 'saved', 'retired false setting must not block explicit recognition');
    assert.equal((await batch('batch')).succeeded, 2);
    assert.equal(recognizes, 3);
    const beforeWrites = writes, beforeRecognizes = recognizes;
    failStartup = true;
    setActiveLanguage('zh-CN');
    const failed = await single('missing-single');
    assert.equal(failed.status, 'failed'); assert.equal(failed.fatal, true); assert.match(failed.message, /搜索与 AI/);
    const beforeStarts = starts, failedBatch = await batch('missing-batch');
    assert.equal(failedBatch.status, 'failed'); assert.equal(failedBatch.total, 2); assert.equal(failedBatch.processed, 1);
    assert.equal(starts, beforeStarts + 1, 'missing model stops the remaining batch'); assert.match(failedBatch.message, /搜索与 AI/);
    setActiveLanguage('en-US');
    assert.match((await single('missing-english')).message, /Search & AI/);
    assert.equal(writes, beforeWrites); assert.equal(recognizes, beforeRecognizes);
    assert.deepEqual(errors, []);
    console.log('AI retirement: sandbox bridge removal, shared model APIs, preserved inert setting, explicit single/batch recognition and actionable startup failures passed.');
  } catch (error) { console.error(error); process.exitCode = 1; }
  finally {
    window?.destroy();
    try {
      assert.equal(path.dirname(profile), os.tmpdir());
      await fs.rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 150 });
    } catch (error) { console.error(error); process.exitCode = 1; }
    app.exit(process.exitCode ?? 0);
  }
});
