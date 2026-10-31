const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const file = path.resolve(__dirname, '../core/artifacts/file-facts/core/node/fileFacts/domain/modelFactInspector.js');
const loaded = { exports: {} }, workers = [];
let stats = 0;
class FakeWorker extends EventEmitter {
  constructor(file, options) { super(); this.options = options; this.threadId = 1; this.terminated = 0; workers.push(this); }
  terminate() { this.terminated++; return new Promise(resolve => { this.release = resolve; }); }
}
vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
  exports: loaded.exports, __dirname: path.dirname(file), Buffer, setTimeout, clearTimeout, Promise,
  require(name) {
    if (name === 'node:fs/promises') return { lstat: async () => { stats++; return { isFile: () => true, isSymbolicLink: () => false }; } };
    if (name === 'node:worker_threads') return { Worker: FakeWorker };
    if (name === 'node:path') return path;
    return require(path.resolve(path.dirname(file), name));
  }
}, { filename: file });
const inspect = loaded.exports.inspectModelFactBatch;
const source = [{ filePath: 'C:\\generated\\test.gguf', sourceRevision: 'exact' }];
const tick = () => new Promise(setImmediate);
(async () => {
  const before = new AbortController(); before.abort();
  assert.equal((await inspect(source, 100, before.signal))[0].errorCode, 'model-fact-cancelled');
  assert.equal(stats, 0);
  const active = new AbortController(); let settled = false;
  const pending = inspect(source, 100, active.signal).then(result => { settled = true; return result; });
  await tick();
  assert.equal(workers[0].options.resourceLimits.maxOldGenerationSizeMb, 256);
  active.abort(); await tick();
  assert.equal(settled, false, 'cancel waits for the owned parser to retire');
  assert.equal(workers[0].terminated, 1); workers[0].release(0);
  assert.equal((await pending)[0].errorCode, 'model-fact-cancelled');
  const cleanExit = inspect(source, 100); await tick();
  workers[1].emit('exit', 0); workers[1].release(0);
  assert.equal((await cleanExit)[0].errorCode, 'model-fact-worker-failed');
  const timed = inspect(source, 10, new AbortController().signal); await tick();
  await new Promise(resolve => setTimeout(resolve, 25));
  assert.equal(workers[2].terminated, 1); workers[2].release(0);
  assert.equal((await timed)[0].errorCode, 'model-fact-timeout');
  const successSignal = new AbortController();
  const success = inspect(source, 100, successSignal.signal); await tick();
  workers[3].emit('message', { ok: true, data: { parameterCount: 123, precision: '4bit' } });
  successSignal.abort(); assert.equal(workers[3].terminated, 1); workers[3].release(0);
  const result = (await success)[0];
  assert.equal(result.status, 'indexed'); assert.equal(result.parameterCount, 123);
  assert.equal(result.sourceRevision, 'exact');
  console.log('Model cancellation, timeout and completion retire the bounded parser without reading source content.');
})().catch(error => { console.error(error); process.exitCode = 1; });
