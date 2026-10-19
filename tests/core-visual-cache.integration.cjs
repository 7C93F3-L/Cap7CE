const assert = require('node:assert/strict'), fs = require('node:fs/promises'), os = require('node:os'), path = require('node:path');
const crypto = require('node:crypto'), { spawn } = require('node:child_process'), { build } = require('esbuild');
const { CoreVisualCacheClient } = require('../dist-electron/core/coreVisualCacheClient.js');
const { VisualCacheFrameReader } = require('../dist-electron/core/visualCacheFrames.js');
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
const types = ['search-thumbnail','search-shell-thumbnail','search-shell-preview','model-input-image','preview-image','skim-thumbnail','skim-preview','skim-shell-thumbnail','skim-shell-preview'];
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const alive = pid => { try { process.kill(pid, 0); return true; } catch { return false; } };
const clients = [];
(async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cap7ce-core-visual-cache-'));
  try {
    // The production bundle runs outside the repository with just the fixed Node and builtin modules.
    const supervisor = path.join(root, 'Cap7CE.Core.Visuals.exe');
    await fs.copyFile(path.resolve('native/artifacts/core-visuals/v1/Cap7CE.Core.Visuals.exe'), supervisor);
    const executable = path.join(root, 'node.exe'), worker = path.join(root, 'visual-cache.cjs'), profile = path.join(root, 'profile');
    await fs.copyFile(path.resolve('artifacts/metadata-worker/v1/node.exe'), executable);
    await fs.copyFile(path.resolve('artifacts/metadata-worker/v1/visual-cache.cjs'), worker);
    const open = (file = worker) => { const client = new CoreVisualCacheClient(profile, executable, file, supervisor); clients.push(client); return client; };
    let client = open(); const source = path.join(root, '源 图.png'); await fs.writeFile(source, png);
    const injected = path.join(root, 'injected.cjs'), marker = path.join(root, 'must-not-run');
    await fs.writeFile(injected, `require('fs').writeFileSync(${JSON.stringify(marker)},'bad')`);
    const saved = { PATH: process.env.PATH, NODE_OPTIONS: process.env.NODE_OPTIONS, NODE_PATH: process.env.NODE_PATH, ELECTRON_RUN_AS_NODE: process.env.ELECTRON_RUN_AS_NODE };
    try {
      process.env.PATH = ''; process.env.NODE_OPTIONS = `--require "${injected}"`; process.env.NODE_PATH = root; process.env.ELECTRON_RUN_AS_NODE = '1';
      await client.request('initialize');
    } finally { for (const [key, value] of Object.entries(saved)) if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    await assert.rejects(fs.access(marker));
    const bundleHash = hash(await fs.readFile(worker));
    assert.throws(() => require('../scripts/metadata-runtime-safety.cjs').assertStopped(root), /core-node-runtime-in-use/);
    assert.equal(hash(await fs.readFile(worker)), bundleHash, 'running output is preserved');
    const entries = [];
    for (const type of types) {
      const entry = await client.request('create', [source, type]), stat = await fs.stat(source);
      const parts = [hash(path.resolve(source).toLowerCase()), stat.size, stat.mtimeMs, 1, 5, type];
      if (type.includes('shell')) parts.push('shell', 1);
      assert.equal(entry.key, hash(parts.join(':')), 'same pre-migration key');
      await client.request('write', [entry, png.toString('base64'), 'image/png']);
      assert.equal(await client.request('valid', [entry]), true);
      assert.equal((await client.request('read', [entry.imagePath])).base64, png.toString('base64'));
      const metadata = JSON.parse(await fs.readFile(entry.metadataPath, 'utf8'));
      assert.equal(metadata.publicationOwner, undefined); assert.equal(metadata.publicationToken, undefined);
      entries.push(entry);
    }
    assert.equal((await client.request('stats')).cacheCount, 5); assert.equal((await client.request('skimStats')).cacheCount, 4);
    assert.equal((await client.request('inventory')).length, 2);
    const forged = { ...entries[0], imagePath: path.join(root, 'outside.png') };
    await assert.rejects(client.request('write', [forged, png.toString('base64'), 'image/png']), error => error.code === 'ECANCELED');
    await assert.rejects(fs.access(forged.imagePath));
    await assert.rejects(client.request('read', [source])); await assert.rejects(client.request('create', [source, 'unknown']));
    await assert.rejects(client.request('write', [entries[0], 'not-base64', 'image/png']));
    await client.request('clear');
    for (const entry of entries.slice(0, 5)) await assert.rejects(client.request('write', [entry, png.toString('base64'), 'image/png']), error => error.code === 'ECANCELED');
    assert.equal((await client.request('skimStats')).cacheCount, 4); assert.deepEqual(await fs.readFile(source), png);
    const survivor = entries[5]; client.close(); client = open();
    await assert.rejects(client.request('write', [survivor, png.toString('base64'), 'image/png']), error => error.code === 'ECANCELED');
    const restored = await client.request('create', [source, survivor.type]); assert.equal(await client.request('valid', [restored]), true);
    assert.equal(restored.key, survivor.key); assert.notEqual(restored.publicationOwner, survivor.publicationOwner);
    await client.request('deleteSourcesByType', [[source], survivor.type]); assert.equal(await client.request('valid', [restored]), false);
    await client.request('deleteDirectory', [root]); assert.equal((await client.request('skimStats')).cacheCount, 0);
    assert.deepEqual(await fs.readFile(source), png);

    // Direct domain check: a clear waits for admitted writes, rejects obsolete epochs, and unblocks after failure.
    const library = path.join(root, 'publication.cjs');
    await build({ entryPoints: [path.resolve('core/node/visualCache/publication.ts')], outfile: library, bundle: true, platform: 'node', format: 'cjs', logLevel: 'error' });
    const publication = require(library).createVisualCachePublications(); let release;
    const gate = new Promise(resolve => release = resolve), epoch = publication.visualCacheEpoch('preview-image');
    const writing = publication.publishVisualCache('preview-image', epoch, () => gate); let cleared = false;
    const clearing = publication.clearVisualCachePublications(['preview-image'], async () => { cleared = true; });
    await sleep(10); assert.equal(cleared, false); release(); await Promise.all([writing, clearing]);
    await assert.rejects(publication.publishVisualCache('preview-image', epoch, async () => {}), error => error.code === 'ECANCELED');
    await assert.rejects(publication.clearVisualCachePublications(['preview-image'], async () => { throw Error('delete failed'); }));
    await publication.publishVisualCache('preview-image', publication.visualCacheEpoch('preview-image'), async () => {});

    // Fragmentation and malformed peers cannot dispatch or replay a request.
    const frames = [], reader = new VisualCacheFrameReader(frame => frames.push(frame.toString())), frame = Buffer.from([2,0,0,0,123,125]);
    for (const byte of Buffer.concat([frame, frame])) reader.push(Buffer.from([byte])); reader.finish(); assert.deepEqual(frames, ['{}','{}']);
    assert.throws(() => new VisualCacheFrameReader(() => {}).push(Buffer.from([255,255,255,127])));
    const bad = path.join(root, 'bad.cjs'); await fs.writeFile(bad, "process.stdin.once('data',()=>process.stdout.write(Buffer.from([255,255,255,127])))");
    await assert.rejects(open(bad).request('initialize'));
    const wrongRuntime = path.join(root, 'wrong.exe'); await fs.writeFile(wrongRuntime, 'not-the-fixed-runtime');
    const wrongClient = new CoreVisualCacheClient(profile, wrongRuntime, worker, supervisor); clients.push(wrongClient);
    await assert.rejects(wrongClient.request('initialize'), /core-cache-host-unavailable/);
    const crash = path.join(root, 'crash.cjs'), attempts = path.join(root, 'attempts');
    await fs.writeFile(crash, `process.stdin.once('data',()=>{require('fs').appendFileSync(${JSON.stringify(attempts)},'x');process.exit(1)});`);
    await assert.rejects(open(crash).request('clear')); await sleep(100);
    assert.equal(await fs.readFile(attempts, 'utf8'), 'x', 'lost replies never replay a cache operation');
    const raw = spawn(executable, [worker, profile], { windowsHide: true, stdio: ['pipe','ignore','ignore'] });
    const exited = new Promise(resolve => raw.once('close', resolve)); raw.stdin.end(Buffer.from([255,255,255,127])); assert.notEqual(await exited, 0);
    const launcher = path.join(root, 'parent.cjs'), pidFile = path.join(root, 'child.json');
    await fs.writeFile(launcher, `const {CoreVisualCacheClient}=require(${JSON.stringify(require.resolve('../dist-electron/core/coreVisualCacheClient.js'))});\nconst c=new CoreVisualCacheClient(${JSON.stringify(profile)},${JSON.stringify(executable)},${JSON.stringify(worker)},${JSON.stringify(supervisor)});c.request('stats').then(()=>{require('fs').writeFileSync(${JSON.stringify(pidFile)},JSON.stringify({pid:c.child.pid}));setInterval(()=>{},10000)});`);
    const parent = spawn(executable, [launcher], { windowsHide: true, stdio: 'ignore' });
    let childPid;
    try {
      for (let attempt=0; attempt<100; attempt++) { try { childPid=JSON.parse(await fs.readFile(pidFile,'utf8')).pid; break; } catch { await sleep(50); } }
      assert.ok(childPid); assert.ok(alive(childPid)); parent.kill();
      for (let attempt=0; attempt<100 && alive(childPid); attempt++) await sleep(50);
      assert.equal(alive(childPid), false, 'cache owner exits on parent pipe EOF');
    } finally { parent.kill(); if (childPid && alive(childPid)) process.kill(childPid); }
    console.log('Core cache: standalone pinned Node, nine unchanged cache keys/schema, accurate totals, clear barrier, signed stale-session rejection, malformed pipes and parent exit passed; source bytes unchanged.');
  } finally { for (const client of clients) client.close(); await sleep(150); assert.equal(path.dirname(root), path.resolve(os.tmpdir())); assert.ok(path.basename(root).startsWith("cap7ce-core-visual-cache-")); await fs.rm(root, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
